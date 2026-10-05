const { LogUtils } = require('../lib/LogUtils');

// Characterization + regression tests for lib/LogUtils.js.
// Before the hardening work this file had no test at all, while it holds the
// domain logging API most consumers actually call.
describe('LogUtils', () => {
  /** @type {any} */
  let utils;
  /** @type {any} */
  let cloudLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    utils = new LogUtils();
    cloudLogger = {
      info: jest.fn().mockResolvedValue(undefined),
      error: jest.fn().mockResolvedValue(undefined),
      warn: jest.fn().mockResolvedValue(undefined),
      debug: jest.fn().mockResolvedValue(undefined),
    };
    utils.cloudLogger = cloudLogger;
  });

  it('forwards to the cloud logger method matching the level', () => {
    utils.info('hello', { id: 1 });

    expect(cloudLogger.info).toHaveBeenCalledTimes(1);
    expect(cloudLogger.info.mock.calls[0][0]).toBe('hello');
  });

  it('enriches metadata with environment, subaccount and application', () => {
    utils.info('hello', { id: 1 });

    const meta = cloudLogger.info.mock.calls[0][1];
    expect(meta.subaccount).toBe('test-subaccount');
    expect(meta.application).toBe('test-app');
    expect(meta.environment).toBe('test');
    expect(meta.id).toBe(1);
  });

  it('extracts message, stack and code when an Error is passed to error()', () => {
    const err = Object.assign(new Error('boom'), { code: 'E_BOOM' });

    utils.error('failed', err);

    const meta = cloudLogger.error.mock.calls[0][1];
    expect(meta.error.message).toBe('boom');
    expect(meta.error.code).toBe('E_BOOM');
    expect(meta.error.stack).toContain('boom');
  });

  it('treats a plain object passed to error() as metadata', () => {
    utils.error('failed', { orderId: 'A1' });

    expect(cloudLogger.error.mock.calls[0][1].orderId).toBe('A1');
  });

  it('tags API logs with the API type and the supplied options', () => {
    utils.apiInfo('called', { endpoint: '/orders', method: 'GET', statusCode: 200 });

    const meta = cloudLogger.info.mock.calls[0][1];
    expect(meta.type).toBe('API');
    expect(meta.endpoint).toBe('/orders');
    expect(meta.statusCode).toBe(200);
  });

  it('omits API payload and response unless explicitly requested', () => {
    utils.apiInfo('called', { payload: { card: '4111' }, response: { ok: true } });

    const meta = cloudLogger.info.mock.calls[0][1];
    expect(meta.payload).toBeUndefined();
    expect(meta.response).toBeUndefined();
  });

  it('tags event logs with the EVENT type', () => {
    utils.eventInfo('received', { eventName: 'OrderCreated' });

    expect(cloudLogger.info.mock.calls[0][1].type).toBe('EVENT');
  });

  it('tags base logs with the BASE type and defaults the component', () => {
    utils.baseInfo('started');

    const meta = cloudLogger.info.mock.calls[0][1];
    expect(meta.type).toBe('BASE');
    expect(meta.component).toBe('system');
  });

  it('still writes to the console when the cloud logger is unavailable', () => {
    utils.cloudLogger = null;

    expect(() => utils.info('hello')).not.toThrow();
    expect(console.log).toHaveBeenCalled();
  });

  // Regression guard for finding A5: a failing cloud path used to be swallowed
  // by an empty catch, so a consumer saw healthy console output while nothing
  // reached Cloud Logging at all.
  it('surfaces a cloud logger failure instead of swallowing it silently', () => {
    utils.cloudLogger = {
      info: () => { throw new Error('transport exploded'); },
    };

    expect(() => utils.info('hello')).not.toThrow();
    expect(console.warn).toHaveBeenCalled();

    const warned = console.warn.mock.calls.map(c => String(c[0])).join(' ');
    expect(warned).toContain('transport exploded');
  });

  it('reports a cloud logger failure only once per throttle window', () => {
    utils.cloudLogger = {
      info: () => { throw new Error('transport exploded'); },
    };

    utils.info('one');
    utils.info('two');
    utils.info('three');

    const failureWarnings = console.warn.mock.calls
      .filter(c => String(c[0]).includes('transport exploded'));
    expect(failureWarnings).toHaveLength(1);
  });
});
