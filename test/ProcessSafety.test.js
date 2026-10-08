const { spawnSync } = require('child_process');
const CloudLoggingService = require('../lib/CloudLoggingService');
const LogFormatter = require('../lib/LogFormatter');

// Regression guards for the two hazards found in the v1.0.8 audit:
//   A1 — the package replaced the host application's process-level handlers
//   A2 — the raw Express request object reached the shipped payload
describe('process-level error handling (A1)', () => {
  /** @type {any[]} */
  let preExisting;

  beforeEach(() => {
    preExisting = process.listeners('uncaughtException');
  });

  it('registers no uncaughtException listener when explicitly disabled', () => {
    const before = process.listeners('uncaughtException').length;

    new CloudLoggingService({
      ingestEndpoint: 'https://example.invalid',
      username: 'u',
      password: 'p',
      preventUncaughtExceptions: false,
    });

    expect(process.listeners('uncaughtException')).toHaveLength(before);
  });

  it('registers its process listeners at most once, however many instances exist', () => {
    const before = process.listeners('uncaughtException').length;

    for (let i = 0; i < 12; i++) {
      new CloudLoggingService({
        ingestEndpoint: 'https://example.invalid',
        username: 'u',
        password: 'p',
        preventUncaughtExceptions: true,
      });
    }

    // At most one listener added across every construction — anything more leaks
    // and trips Node's MaxListenersExceededWarning in the consumer's logs.
    expect(process.listeners('uncaughtException').length).toBeLessThanOrEqual(before + 1);
  });

  it('never removes listeners the application already registered', () => {
    const appHandler = () => {};
    process.on('uncaughtException', appHandler);

    try {
      new CloudLoggingService({
        ingestEndpoint: 'https://example.invalid',
        username: 'u',
        password: 'p',
        preventUncaughtExceptions: true,
      });

      expect(process.listeners('uncaughtException')).toContain(appHandler);
    } finally {
      process.removeListener('uncaughtException', appHandler);
      process.listeners('uncaughtException')
        .filter(l => !preExisting.includes(l))
        .forEach(l => process.removeListener('uncaughtException', l));
      process.listeners('unhandledRejection')
        .filter(l => !preExisting.includes(l))
        .forEach(l => process.removeListener('unhandledRejection', l));
    }
  });
});

// Crash semantics are only observable in a real process: Jest registers its own
// uncaughtException listeners, so the sole-listener branch never runs in-band.
describe('crash semantics for an application with no handler of its own (A1)', () => {
  const servicePath = require.resolve('../lib/CloudLoggingService');

  /** @param {string} setup statements evaluated before the service is constructed */
  function runChild(setup) {
    const script = `
      const CloudLoggingService = require(${JSON.stringify(servicePath)});
      ${setup}
      new CloudLoggingService({ ingestEndpoint: 'https://example.invalid', username: 'u', password: 'p' });
      setTimeout(() => { throw new Error('unrelated application bug'); }, 0);
      setTimeout(() => { console.log('SURVIVED'); }, 150);
    `;
    return spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  }

  it('still crashes on an unrelated uncaught exception, as it would without this package', () => {
    const result = runChild('');

    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('SURVIVED');
  });

  it('defers to the application handler instead, when there is one', () => {
    const result = runChild('process.on(\'uncaughtException\', (e) => console.log(\'APP HANDLED:\', e.message));');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('APP HANDLED: unrelated application bug');
    expect(result.stdout).toContain('SURVIVED');
  });
});

describe('request handling in the formatted payload (A2)', () => {
  const formatter = new LogFormatter({ applicationName: 'app', subAccountId: 'sub' });

  /** Minimal stand-in with the circular shape and headers of a real Express request. */
  function fakeRequest() {
    const req = {
      method: 'POST',
      url: '/orders',
      ip: '10.0.0.1',
      headers: { authorization: 'Bearer super-secret-token', cookie: 'session=abc' },
      get(name) { return this.headers[String(name).toLowerCase()]; },
    };
    req.res = { req };
    return req;
  }

  it('does not keep the raw request object on the payload', () => {
    const entry = formatter.format('INFO', 'Incoming request', { req: fakeRequest() });

    expect(entry.req).toBeUndefined();
  });

  it('produces a payload that can be serialized', () => {
    const entry = formatter.format('INFO', 'Incoming request', { req: fakeRequest() });

    expect(() => JSON.stringify(entry)).not.toThrow();
  });

  it('never ships the authorization header or cookie', () => {
    const entry = formatter.format('INFO', 'Incoming request', { req: fakeRequest() });
    const serialized = JSON.stringify(entry);

    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('session=abc');
  });

  it('still extracts the safe request subset', () => {
    const entry = formatter.format('INFO', 'Incoming request', { req: fakeRequest() });

    expect(entry.request.method).toBe('POST');
    expect(entry.request.url).toBe('/orders');
  });

  it('redacts sensitive metadata on the createLogger path too (A6)', () => {
    const entry = formatter.format('INFO', 'done', { password: 'hunter2', orderId: 'A1' });

    expect(entry.password).toBe('[REDACTED]');
    expect(entry.orderId).toBe('A1');
  });

  it('leaves metadata untouched when sanitizeMetadata is disabled', () => {
    const optedOut = new LogFormatter({ applicationName: 'app', sanitizeMetadata: false });

    const entry = optedOut.format('INFO', 'done', { tokenCount: 5 });

    expect(entry.tokenCount).toBe(5);
  });
});

// A18 — sanitize() throws if any metadata getter throws. That escaped format()
// into the transport's catch, which could not tell a formatting failure from a
// network one, so an entry that could never be built was retried with backoff.
describe('an entry that cannot be formatted is dropped, not retried (A18)', () => {
  function hostileMetadata() {
    const meta = { orderId: 'A1' };
    Object.defineProperty(meta, 'boom', { enumerable: true, get() { throw new Error('getter exploded'); } });
    return meta;
  }

  it('does not throw into the caller', async () => {
    const svc = new CloudLoggingService({
      ingestEndpoint: 'https://example.invalid', username: 'u', password: 'p',
      preventUncaughtExceptions: false,
    });

    await expect(svc.info('boom', hostileMetadata())).resolves.toBeUndefined();
  });

  it('schedules no retry, because the entry will never format', async () => {
    const svc = new CloudLoggingService({
      ingestEndpoint: 'https://example.invalid', username: 'u', password: 'p',
      preventUncaughtExceptions: false,
    });

    await svc.info('boom', hostileMetadata());

    expect(svc.retryTimer).toBeNull();
    expect(svc.retryCount).toBe(0);
  });

  it('notifies onError with the formatting failure', async () => {
    const onError = jest.fn();
    const svc = new CloudLoggingService({
      ingestEndpoint: 'https://example.invalid', username: 'u', password: 'p',
      preventUncaughtExceptions: false, onError,
    });

    await svc.info('boom', hostileMetadata());

    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ level: 'INFO' }));
  });
});

// A15d — CloudLoggingService has always supported FATAL, but LogUtils mapped
// only info/error/warn/debug, so the level was unreachable through the
// documented domain logger and the console fallback had no fatal at all.
describe('fatal is reachable through both loggers (A15d)', () => {
  it('the console fallback has a fatal level', () => {
    const logger = require('../lib/Logger');

    expect(typeof logger.fatal).toBe('function');
  });

  it('LogUtils exposes fatal', () => {
    const { LogUtils } = require('../lib/LogUtils');

    expect(typeof LogUtils.prototype.fatal).toBe('function');
  });
});

// Cloud Logging derives a W3C trace id from `correlation_id` by stripping its
// hyphens, and ignores `correlationId`. Verified against the live index: the
// same client writing both names minutes apart produced a `trace_id` only for
// the snake_case one. Both are emitted until 2.0.0 drops the camelCase name.
describe('correlation id is emitted under both names', () => {
  const formatter = new LogFormatter({ applicationName: 'app' });

  it('emits correlation_id, which is the name the platform reads', () => {
    const entry = formatter.format('INFO', 'done', { correlationId: 'corr-4711' });

    expect(entry.correlation_id).toBe('corr-4711');
  });

  it('still emits correlationId, so existing queries keep working', () => {
    const entry = formatter.format('INFO', 'done', { correlationId: 'corr-4711' });

    expect(entry.correlationId).toBe('corr-4711');
  });

  it('accepts requestId as the source for both', () => {
    const entry = formatter.format('INFO', 'done', { requestId: 'req-99' });

    expect(entry.correlation_id).toBe('req-99');
    expect(entry.correlationId).toBe('req-99');
  });

  it('emits neither when the consumer supplies no correlation id', () => {
    const entry = formatter.format('INFO', 'done', { orderId: 'A1' });

    expect(entry.correlation_id).toBeUndefined();
    expect(entry.correlationId).toBeUndefined();
  });
});

// A consumer may legitimately pass metadata with a key named `req` that is not
// an HTTP request. Extracting it would both lose their field and crash on
// `req.get`, so anything not request-shaped stays ordinary metadata.
describe('metadata keyed "req" that is not a request', () => {
  const formatter = new LogFormatter({ applicationName: 'app' });

  it('keeps a plain string value', () => {
    const entry = formatter.format('INFO', 'done', { req: 'GET /orders' });

    expect(entry.req).toBe('GET /orders');
    expect(entry.request).toBeUndefined();
  });

  it('keeps a plain object value', () => {
    const entry = formatter.format('INFO', 'done', { req: { id: 'abc' } });

    expect(entry.req.id).toBe('abc');
    expect(entry.request).toBeUndefined();
  });

  it('does not throw on a value without a get() method', () => {
    expect(() => formatter.format('INFO', 'done', { req: { method: 'GET' } })).not.toThrow();
  });
});
