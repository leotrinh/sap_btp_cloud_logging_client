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
            /** * LEO-FIX: Explicitly cast the string literal to match the type definition.
                   * @type {'basic' | 'mtls'} 
                   */
            authType: 'basic',
            username: process.env.BTP_LOGGING_USERNAME,
            password: process.env.BTP_LOGGING_PASSWORD,
            clientCert: process.env.BTP_LOGGING_CLIENT_CERT,
            clientKey: process.env.BTP_LOGGING_CLIENT_KEY,
            serverCa: process.env.BTP_LOGGING_SERVER_CA,
            subaccountId: process.env.BTP_SUBACCOUNT_ID || 'PAYG_DEVELOPMENT',
            applicationName: process.env.BTP_APPLICATION_NAME || 'unknown-app',
            environment: process.env.NODE_ENV || 'development',
            logLevel: 'INFO',
            enableRetry: process.env.BTP_LOGGING_ENABLE_RETRY !== 'false',
            maxRetries: maxRetries ? parseInt(maxRetries, 10) : 3,
            timeout: timeout ? parseInt(timeout, 10) : 5000,
            includeStackTrace: process.env.BTP_LOGGING_INCLUDE_STACK_TRACE === 'true',
            correlationIdHeader: process.env.BTP_LOGGING_CORRELATION_HEADER || 'x-correlation-id',
            fallbackToConsole: process.env.BTP_LOGGING_FALLBACK_CONSOLE !== 'false',
            fallbackLogger: null,
            // LEO-FIX: Change null to undefined to match the type definition.
            onError: undefined,
        };
    }

    /**
       * @param {CloudLoggingConfig} [userConfig]
       * @returns {CloudLoggingConfig}
       */
    static mergeConfig(userConfig = {}) {
        const defaultConfig = this.getDefaultConfig();
        const merged = { ...defaultConfig, ...userConfig };
        this.validateConfig(merged);
        return merged;
    }

    /**
       * @param {CloudLoggingConfig} config
       */
    static validateConfig(config) {
        if (!config.ingestEndpoint) {
            throw new Error('BTP_LOGGING_INGEST_ENDPOINT is required');
        }
        if (config.authType === 'basic') {
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
       * @returns {CloudLoggingConfig}
       */
    static fromServiceKey(serviceKey) {
        return {
            ingestEndpoint: `https://${serviceKey['ingest-endpoint']}`,
            dashboardEndpoint: `https://${serviceKey['dashboards-endpoint']}`,
            authType: 'basic',
            username: serviceKey['ingest-username'],
            password: serviceKey['ingest-password'],
            clientCert: serviceKey['ingest-mtls-cert'],
            clientKey: serviceKey['ingest-mtls-key'],
            serverCa: serviceKey['server-ca'],
        };
    }
}

module.exports = ConfigManager;