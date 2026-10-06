const JSONUtils = require('./JSONUtils.js');

// One neutral default each, defined once. Both paths used to disagree, and one
// of them shipped the author's personal identifiers into consumers' logs. A
// placeholder must read as absent rather than as a real environment name, or an
// operator seeing it on a dashboard has no reason to suspect configuration is
// missing.
const UNKNOWN_SUBACCOUNT = 'unknown-subaccount';
const UNKNOWN_APP = 'unknown-app';

/**
 * @typedef {import('../types').CloudLoggingConfig} CloudLoggingConfig
 * @typedef {import('../types').ServiceKey} ServiceKey
 */


class ConfigManager {
  /**
     * @returns {CloudLoggingConfig}
     */
  static getDefaultConfig() {
    // LEO-FIX: Provide a default string to parseInt to avoid passing undefined
    const maxRetries = process.env.BTP_LOGGING_MAX_RETRIES;
    const timeout = process.env.BTP_LOGGING_TIMEOUT;

    return {
      ingestEndpoint: process.env.BTP_LOGGING_INGEST_ENDPOINT,
      dashboardEndpoint: process.env.BTP_LOGGING_DASHBOARD_ENDPOINT,
      ingestMtlsEndpoint: '',
      /** * LEO-FIX: Explicitly cast the string literal to match the type definition.
                   * @type {'basic' | 'mtls'}
                   */
      authType: 'basic',
      username: process.env.BTP_LOGGING_USERNAME,
      password: process.env.BTP_LOGGING_PASSWORD,
      clientCert: process.env.BTP_LOGGING_CLIENT_CERT,
      clientKey: process.env.BTP_LOGGING_CLIENT_KEY,
      serverCa: process.env.BTP_LOGGING_SERVER_CA,
      subAccountId: process.env.BTP_SUBACCOUNT_ID || UNKNOWN_SUBACCOUNT,
      applicationName: process.env.BTP_APPLICATION_NAME || UNKNOWN_APP,
      environment: process.env.NODE_ENV || 'development',
      enableRetry: process.env.BTP_LOGGING_ENABLE_RETRY !== 'false',
      maxRetries: maxRetries ? parseInt(maxRetries, 10) : 3,
      timeout: timeout ? parseInt(timeout, 10) : 5000,
      // Leo: Read log level from environment variable
      /** @type {'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'} */
      logLevel: /** @type {'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'} */ (process.env.BTP_LOG_LEVEL || 'DEBUG'),
      includeStackTrace: process.env.BTP_LOGGING_INCLUDE_STACK_TRACE === 'true',
      correlationIdHeader: process.env.BTP_LOGGING_CORRELATION_HEADER || 'x-correlation-id',
      fallbackToConsole: process.env.BTP_LOGGING_FALLBACK_CONSOLE !== 'false',
      fallbackLogger: null,
      // LEO-FIX: Change null to undefined to match the type definition.
      onError: undefined,
      // Redact sensitive metadata keys before shipping (default: true).
      // Escape hatch for consumers whose own field names collide with the
      // redaction list and who would rather keep the raw values.
      sanitizeMetadata: process.env.BTP_LOGGING_SANITIZE_METADATA !== 'false',
      // BTP Cloud Logging field mapping (default: true)
      enableSAPFieldMapping: process.env.BTP_LOGGING_ENABLE_FIELD_MAPPING !== 'false',
      removeOriginalFieldsAfterMapping: process.env.BTP_LOGGING_REMOVE_ORIGINAL_FIELDS !== 'false',
    };
  }

  /**
     * @param {CloudLoggingConfig} [userConfig]
     * @returns {CloudLoggingConfig}
     */
  static mergeConfig(userConfig = {}) {
    // Leo: uses _resolveBaseConfig to get env + service key merged config.
    const baseConfig = this._resolveBaseConfig();
    const merged = { ...baseConfig, ...userConfig };
    this.validateConfig(merged);
    return merged;
  }

  /**
     * @param {CloudLoggingConfig} config
     */
  static validateConfig(config) {
    if (config.authType === 'basic') {
      if (!config.ingestEndpoint) {
        // Leo: switched to console.warn to avoid crashing the app if fallbackToConsole is true.
        /* eslint no-console: ["error", { allow: ["warn", "error"] }] */
        console.warn('BTP_LOGGING_INGEST_ENDPOINT is not configured. Logging may fallback to console if enabled.');
        return;
      }
      if (!config.username || !config.password) {
        throw new Error('Username and password are required for basic authentication');
      }
    } else if (config.authType === 'mtls') {
      if (!config.clientCert || !config.clientKey) {
        throw new Error('Client certificate and key are required for mTLS authentication');
      }
    }
  }

  /**
     * @param {ServiceKey} serviceKey
     * @returns {Partial<CloudLoggingConfig>}
     */
  static fromServiceKey(serviceKey) {
    let ingestMtlsEndpoint = '';
    if (serviceKey['ingest-mtls-endpoint']) {
      ingestMtlsEndpoint = `https://${serviceKey['ingest-mtls-endpoint']}`;
    }
    /** @type {Partial<CloudLoggingConfig>} */
    const config = {
      ingestEndpoint: `https://${serviceKey['ingest-endpoint']}`,
      dashboardEndpoint: `https://${serviceKey['dashboards-endpoint']}`,
      ingestMtlsEndpoint: ingestMtlsEndpoint,
      username: serviceKey['ingest-username'],
      password: serviceKey['ingest-password'],
      clientCert: serviceKey['ingest-mtls-cert'],
      clientKey: serviceKey['ingest-mtls-key'],
      serverCa: serviceKey['server-ca'],
    };

    // Leo: determine authType based on available credentials in the service key.
    const forceAuthType = process.env.BTP_LOGGING_SRV_AUTH_TYPE;
    if (config.clientCert && config.clientKey && forceAuthType === 'mtls') {
      config.authType = 'mtls';
    } else if (config.username && config.password) {
      config.authType = 'basic';
    }

    return config;
  }

  /**
     * Leo: Internal method - resolves base config from env + service key.
     * @returns {CloudLoggingConfig}
     * @private
     */
  static _resolveBaseConfig() {
    const defaultConfig = this.getDefaultConfig();
    let serviceKey = null;
    // Leo: check for the new service key credential environment variable.
    if (process.env.BTP_LOGGING_SRV_KEY_CRED) {
      const parsed = JSONUtils.getEnvJSONObject(process.env.BTP_LOGGING_SRV_KEY_CRED);
      // An unparseable key is an accident — a line-oriented .env reader
      // truncating the pretty-printed JSON that `cf service-key` prints, for
      // instance. Degrade to the discrete variables rather than spreading a
      // set of `undefined` values over configuration that was valid, which
      // used to fail with a message naming the credentials instead of the key.
      if (!parsed || Object.keys(parsed).length === 0) {
        /* eslint no-console: ["error", { allow: ["warn", "error"] }] */
        console.warn('BTP_LOGGING_SRV_KEY_CRED is set but could not be parsed as JSON. Ignoring it and falling back to the individual BTP_LOGGING_* variables.');
      } else {
        serviceKey = parsed;
      }
    }

    if (serviceKey) {
      // Leo: if a service key exists, derive config from it & merge service key config over the default config to ensure it takes precedence.
      const serviceKeyConfig = this.fromServiceKey(/** @type {import('../types').ServiceKey} */(serviceKey));
      // A parseable key is a deliberate selection, so it is used as given.
      // Completing it from unrelated variables would ship logs under a
      // credential the operator did not know they had chosen, with nothing in
      // the output revealing which one was used — so say what is missing
      // instead of quietly filling it in.
      const missing = ['ingestEndpoint', 'username', 'password'].filter((key) => !serviceKeyConfig[key]);
      if (missing.length) {
        /* eslint no-console: ["error", { allow: ["warn", "error"] }] */
        console.warn(`BTP_LOGGING_SRV_KEY_CRED parsed but is incomplete — missing: ${missing.join(', ')}. Cloud logging will not be configured from it.`);
      }
      return { ...defaultConfig, ...serviceKeyConfig };
    } else {
      return defaultConfig;
    }
  }

  /**
     * Leo: Backward-compatible alias for _resolveBaseConfig.
     * @deprecated Use mergeConfig() instead. This will be removed in v2.0.
     * @returns {CloudLoggingConfig}
     */
  static getConfig() {
    return this._resolveBaseConfig();
  }
}

module.exports = ConfigManager;