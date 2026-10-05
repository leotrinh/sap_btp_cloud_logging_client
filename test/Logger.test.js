const logger = require('../lib/Logger');
const { sanitize } = require('../lib/Logger');

// Characterization tests for lib/Logger.js — these describe the behaviour that
// existed before the hardening work and must keep holding afterwards.
describe('sanitize', () => {
  it('redacts keys matching the sensitive list, case-insensitively', () => {
    const result = sanitize({ Password: 'p', AUTHORIZATION: 'a', userName: 'leo' });

    expect(result.Password).toBe('[REDACTED]');
    expect(result.AUTHORIZATION).toBe('[REDACTED]');
    expect(result.userName).toBe('leo');
  });

  it('matches on substring, not equality', () => {
    const result = sanitize({ db_password_hash: 'x', refresh_token_v2: 'y' });

    expect(result.db_password_hash).toBe('[REDACTED]');
    expect(result.refresh_token_v2).toBe('[REDACTED]');
  });

  it('redacts Cloud Logging service key fields', () => {
    const result = sanitize({
      'ingest-password': 'x',
      'ingest-mtls-key': 'y',
      'server-ca': 'z',
      'ingest-endpoint': 'https://host',
    });

    expect(result['ingest-password']).toBe('[REDACTED]');
    expect(result['ingest-mtls-key']).toBe('[REDACTED]');
    expect(result['server-ca']).toBe('[REDACTED]');
    expect(result['ingest-endpoint']).toBe('https://host');
  });

  it('recurses into nested objects and arrays', () => {
    const result = sanitize({ outer: { token: 'x' }, list: [{ secret: 'y' }] });

    expect(result.outer.token).toBe('[REDACTED]');
    expect(result.list[0].secret).toBe('[REDACTED]');
  });

  it('stops at the depth limit instead of recursing without bound', () => {
    let deep = { value: 'leaf' };
    for (let i = 0; i < 15; i++) deep = { nested: deep };

    expect(JSON.stringify(sanitize(deep))).toContain('[Object too deep]');
  });

  it('passes through primitives and nullish values unchanged', () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
    expect(sanitize('plain')).toBe('plain');
    expect(sanitize(42)).toBe(42);
  });

  it('does not mutate the input object', () => {
    const input = { password: 'secret' };
    sanitize(input);

    expect(input.password).toBe('secret');
  });
});

describe('console fallback logger', () => {
  beforeEach(() => jest.clearAllMocks());

  it('redacts metadata before writing it to the console', () => {
    logger.info('hello', { password: 'secret', id: 7 });

    const written = console.log.mock.calls[0][0];
    expect(written).toContain('[REDACTED]');
    expect(written).not.toContain('secret');
  });

  it('survives metadata that cannot be serialized', () => {
    const circular = {};
    circular.self = circular;

    expect(() => logger.info('hello', circular)).not.toThrow();
  });
});
