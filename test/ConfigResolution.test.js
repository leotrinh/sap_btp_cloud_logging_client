const ConfigManager = require('../lib/ConfigManager');

// A21 — a malformed service key used to destroy working configuration rather
// than defer to it. `getEnvJSONObject` returned `{}` on a parse failure, `{}`
// is truthy, so an empty object was spread over values that were valid and the
// resulting error named the credentials instead of the key that wiped them.
describe('service key resolution (A21)', () => {
  const VARS = ['BTP_LOGGING_SRV_KEY_CRED', 'BTP_LOGGING_INGEST_ENDPOINT',
    'BTP_LOGGING_USERNAME', 'BTP_LOGGING_PASSWORD', 'BTP_SUBACCOUNT_ID', 'BTP_APPLICATION_NAME'];
  /** @type {Record<string, string | undefined>} */
  let saved;

  beforeEach(() => {
    saved = {};
    VARS.forEach((v) => { saved[v] = process.env[v]; delete process.env[v]; });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    VARS.forEach((v) => { if (saved[v] === undefined) delete process.env[v]; else process.env[v] = saved[v]; });
    jest.restoreAllMocks();
  });

  function withDiscreteConfig() {
    process.env.BTP_LOGGING_INGEST_ENDPOINT = 'https://discrete.example';
    process.env.BTP_LOGGING_USERNAME = 'discrete-user';
    process.env.BTP_LOGGING_PASSWORD = 'discrete-pass';
  }

  it('falls back to the discrete variables when the service key cannot be parsed', () => {
    withDiscreteConfig();
    // The shape a line-oriented .env reader produces from pretty-printed JSON.
    process.env.BTP_LOGGING_SRV_KEY_CRED = '{';

    const config = ConfigManager.mergeConfig({});

    expect(config.ingestEndpoint).toBe('https://discrete.example');
    expect(config.username).toBe('discrete-user');
  });

  it('names the service key, not the credentials, when it cannot be parsed', () => {
    withDiscreteConfig();
    process.env.BTP_LOGGING_SRV_KEY_CRED = '{"ingest-endpoint": "x",';

    ConfigManager.mergeConfig({});

    // eslint-disable-next-line no-console
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('BTP_LOGGING_SRV_KEY_CRED'));
  });

  it('does not throw about missing credentials when the discrete ones are present', () => {
    withDiscreteConfig();
    process.env.BTP_LOGGING_SRV_KEY_CRED = 'not json at all';

    expect(() => ConfigManager.mergeConfig({})).not.toThrow();
  });

  it('uses a parseable service key as given', () => {
    process.env.BTP_LOGGING_SRV_KEY_CRED = JSON.stringify({
      'ingest-endpoint': 'key.example',
      'ingest-username': 'key-user',
      'ingest-password': 'key-pass',
      'dashboards-endpoint': 'dash.example',
    });

    const config = ConfigManager.mergeConfig({});

    expect(config.ingestEndpoint).toBe('https://key.example');
    expect(config.username).toBe('key-user');
  });

  // A parseable key is a deliberate selection. Completing it from unrelated
  // variables would ship logs under a credential nobody chose, with nothing in
  // the output revealing which one was used.
  it('reports what an incomplete service key is missing rather than completing it silently', () => {
    withDiscreteConfig();
    process.env.BTP_LOGGING_SRV_KEY_CRED = JSON.stringify({ 'ingest-endpoint': 'key.example' });

    try { ConfigManager.mergeConfig({}); } catch { /* validation is not what this asserts */ }

    // eslint-disable-next-line no-console
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('incomplete'));
    // eslint-disable-next-line no-console
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/username|password/));
  });
});

// A9 — the two resolution paths disagreed, and one shipped the author's own
// identifiers into consumers' logs. A placeholder must read as absent rather
// than as a real environment name.
describe('placeholder defaults (A9)', () => {
  it('uses neutral defaults when nothing is configured', () => {
    const saved = [process.env.BTP_SUBACCOUNT_ID, process.env.BTP_APPLICATION_NAME];
    delete process.env.BTP_SUBACCOUNT_ID;
    delete process.env.BTP_APPLICATION_NAME;

    try {
      const config = ConfigManager.getDefaultConfig();

      expect(config.subAccountId).toBe('unknown-subaccount');
      expect(config.applicationName).toBe('unknown-app');
    } finally {
      if (saved[0] !== undefined) process.env.BTP_SUBACCOUNT_ID = saved[0];
      if (saved[1] !== undefined) process.env.BTP_APPLICATION_NAME = saved[1];
    }
  });
});
