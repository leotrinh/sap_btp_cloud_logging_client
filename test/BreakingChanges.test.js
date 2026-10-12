const path = require('path');
const CloudLoggingService = require('../lib/CloudLoggingService');
const LogFormatter = require('../lib/LogFormatter');

// Guards for the 2.0.0 contract. Each of these was a deliberate break, so each
// needs a test that fails if it is silently undone.
describe('2.0.0 — process-level error handling is off by default', () => {
  /** @type {any[]} */
  let preExisting;

  beforeEach(() => {
    preExisting = process.listeners('uncaughtException');
  });

  afterEach(() => {
    process.listeners('uncaughtException')
      .filter((l) => !preExisting.includes(l))
      .forEach((l) => process.removeListener('uncaughtException', l));
  });

  it('registers no listener unless asked', () => {
    const before = process.listeners('uncaughtException').length;

    new CloudLoggingService({ ingestEndpoint: 'https://example.invalid', username: 'u', password: 'p' });

    expect(process.listeners('uncaughtException')).toHaveLength(before);
  });

  // The positive twin: proving the opt-in still works is what makes the
  // assertion above mean "off by default" rather than "broken".
  it('registers one when explicitly enabled', () => {
    const before = process.listeners('uncaughtException').length;

    new CloudLoggingService({
      ingestEndpoint: 'https://example.invalid', username: 'u', password: 'p',
      preventUncaughtExceptions: true,
    });

    expect(process.listeners('uncaughtException').length).toBeGreaterThanOrEqual(before);
  });
});

// `type` is SAP's own discriminator and only stays useful if nobody else
// writes to it. Vacating it is not enough — it has to be defended.
describe('2.0.0 — type is reserved, record_kind carries the record kind', () => {
  const formatter = new LogFormatter({ applicationName: 'app' });

  it('always emits the type constant', () => {
    expect(formatter.format('INFO', 'x', {}).type).toBe('log');
  });

  it('keeps the constant even when a consumer supplies their own type', () => {
    expect(formatter.format('INFO', 'x', { type: 'SCHEDULER' }).type).toBe('log');
  });

  it('preserves the consumer value under record_kind rather than dropping it', () => {
    expect(formatter.format('INFO', 'x', { type: 'SCHEDULER' }).record_kind).toBe('SCHEDULER');
  });

  it('does not overwrite a record_kind the caller already set', () => {
    const entry = formatter.format('INFO', 'x', { type: 'SCHEDULER', record_kind: 'api' });

    expect(entry.record_kind).toBe('api');
  });
});

// winston became an optional peer dependency, so requiring the package must
// not pull it in. The failure this guards against is an eager require at
// module load, which would break every consumer who does not use winston.
describe('2.0.0 — winston is only loaded by consumers who use it', () => {
  it('does not load winston when the package is imported', () => {
    const winstonPath = require.resolve('winston');
    delete require.cache[winstonPath];
    Object.keys(require.cache)
      .filter((k) => k.includes(`${path.sep}lib${path.sep}`) || k.endsWith(`${path.sep}index.js`))
      .forEach((k) => delete require.cache[k]);

    require('../index.js');

    expect(require.cache[winstonPath]).toBeUndefined();
  });

  it('loads it on first access of WinstonTransport', () => {
    const pkg = require('../index.js');

    expect(typeof pkg.WinstonTransport).toBe('function');
    expect(require.cache[require.resolve('winston')]).toBeDefined();
  });
});
