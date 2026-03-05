const axios = require('axios');
const https = require('https');

/**
 * @typedef {import('../types').CloudLoggingConfig} CloudLoggingConfig
 * @typedef {import('../types').FormattedLogEntry} FormattedLogEntry
 */

/**
 * Leo: Base Transport interface for sending logs
 * @interface
 */
class Transport {
  /**
     * @param {FormattedLogEntry | FormattedLogEntry[]} _data
     * @returns {Promise<void>}
     */
  async send(_data) {
    throw new Error('Transport.send() must be implemented by subclass');
  }
}

/**
 * Leo: HTTP Transport using Axios
 */
class HttpTransport extends Transport {
  /**
       * @param {CloudLoggingConfig} config
       * @param {AuthStrategy} authStrategy
       */
  constructor(config, authStrategy) {
    super();
    this.config = config;
    this.authStrategy = authStrategy;
  }

  /**
       * @param {FormattedLogEntry | FormattedLogEntry[]} data
       * @returns {Promise<void>}
       */
  async send(data) {
    const endpoint = this.authStrategy.getEndpoint(this.config);
    if (!endpoint) {
      throw new Error('Cloud logging ingest endpoint is not configured.');
    }

    /** @type {import('axios').AxiosRequestConfig} */
    const requestConfig = {
      method: 'POST',
      url: endpoint,
      data: data,
      headers: {
        'Content-Type': 'application/json',
        ...this.authStrategy.getHeaders()
      },
      timeout: this.config.timeout || 5000,
      // Add additional error handling options
      maxRedirects: 0, // Prevent redirects that might cause issues
      validateStatus: (status) => status < 500, // Treat 4xx as success for logging
    };

    const agent = this.authStrategy.getHttpsAgent();
    if (agent) {
      requestConfig.httpsAgent = agent;
    }

    try {
      // @ts-ignore - axios CJS default export is callable at runtime
      const response = await axios(requestConfig);

      if (response.status >= 400 && response.status < 500) {
        // 4xx errors are not critical for logging - just log warning
        // eslint-disable-next-line no-console
        console.warn(`Cloud Logging warning: HTTP ${response.status}: ${response.statusText}`);
        return; // Don't throw for 4xx errors
      }

      if (response.status >= 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      // Wrap all network errors to prevent uncaught exceptions
      const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (errorCode === 'ECONNRESET' || 
          errorCode === 'ECONNREFUSED' || 
          errorCode === 'ENOTFOUND' ||
          errorCode === 'ETIMEDOUT' ||
          errorCode === 'ECONNABORTED') {
        // Network errors - wrap with user-friendly message
        throw new Error(`Cloud Logging connection failed: ${errorCode}. Please check network connectivity.`);
      }
      
      // Re-throw other errors with original message
      throw error;
    }
  }
}

/**
 * Leo: Base Auth Strategy interface
 * @interface
 */
class AuthStrategy {
  /**
     * @param {CloudLoggingConfig} _config
     * @returns {string | undefined}
     */
  getEndpoint(_config) {
    throw new Error('AuthStrategy.getEndpoint() must be implemented by subclass');
  }

  /**
       * @returns {Record<string, string>}
       */
  getHeaders() {
    return {};
  }

  /**
       * @returns {https.Agent | undefined}
       */
  getHttpsAgent() {
    return undefined;
  }
}

/**
 * Leo: Basic Auth Strategy (username/password)
 */
class BasicAuthStrategy extends AuthStrategy {
  /**
       * @param {string} username
       * @param {string} password
       */
  constructor(username, password) {
    super();
    this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  /**
       * @param {CloudLoggingConfig} config
       * @returns {string | undefined}
       */
  getEndpoint(config) {
    return config.ingestEndpoint;
  }

  /**
       * @returns {Record<string, string>}
       */
  getHeaders() {
    return { Authorization: this.authHeader };
  }
}

/**
 * Leo: mTLS Auth Strategy (client certificate)
 */
class MtlsAuthStrategy extends AuthStrategy {
  /**
       * @param {string} clientCert
       * @param {string} clientKey
       * @param {string} [serverCa]
       */
  constructor(clientCert, clientKey, serverCa) {
    super();
    this.httpsAgent = new https.Agent({
      cert: clientCert,
      key: clientKey,
      ca: serverCa,
      rejectUnauthorized: true,
    });
  }

  /**
       * @param {CloudLoggingConfig} config
       * @returns {string | undefined}
       */
  getEndpoint(config) {
    return config.ingestMtlsEndpoint;
  }

  /**
       * @returns {https.Agent}
       */
  getHttpsAgent() {
    return this.httpsAgent;
  }
}

/**
 * Leo: Factory to create the appropriate auth strategy
 * @param {CloudLoggingConfig} config
 * @returns {AuthStrategy}
 */
function createAuthStrategy(config) {
  if (config.authType === 'mtls' && config.clientCert && config.clientKey) {
    return new MtlsAuthStrategy(config.clientCert, config.clientKey, config.serverCa);
  }
  if (config.username && config.password) {
    return new BasicAuthStrategy(config.username, config.password);
  }
  // Leo: Return a no-op strategy if no auth configured
  return new AuthStrategy();
}

module.exports = {
  Transport,
  HttpTransport,
  AuthStrategy,
  BasicAuthStrategy,
  MtlsAuthStrategy,
  createAuthStrategy,
};
