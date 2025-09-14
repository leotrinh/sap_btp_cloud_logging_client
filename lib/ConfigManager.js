const JSONUtils = require('./JSONUtils.js');

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
        // Leo: changed from getDefaultConfig to getConfig to ensure service key is prioritized.
        const baseConfig = this.getConfig();
        const merged = { ...baseConfig, ...userConfig };
        this.validateConfig(merged);
        return merged;
    }

    /**
     * @param {CloudLoggingConfig} config
     */
    static validateConfig(config) {
        if (!config.ingestEndpoint) {
            // Leo: switched to console.warn to avoid crashing the app if fallbackToConsole is true.
            console.warn('BTP_LOGGING_INGEST_ENDPOINT is not configured. Logging may fallback to console if enabled.');
            return;
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
     * @returns {Partial<CloudLoggingConfig>}
     */
    static fromServiceKey(serviceKey) {
        /** @type {Partial<CloudLoggingConfig>} */
        const config = {
            ingestEndpoint: `https://${serviceKey['ingest-endpoint']}`,
            dashboardEndpoint: `https://${serviceKey['dashboards-endpoint']}`,
            username: serviceKey['ingest-username'],
            password: serviceKey['ingest-password'],
            clientCert: serviceKey['ingest-mtls-cert'],
            clientKey: serviceKey['ingest-mtls-key'],
            serverCa: serviceKey['server-ca'],
        };

        // Leo: determine authType based on available credentials in the service key.
        if (config.clientCert && config.clientKey) {
            config.authType = 'mtls';
        } else if (config.username && config.password) {
            config.authType = 'basic';
        }

        return config;
    }

    /**
     * @returns {CloudLoggingConfig}
     */
    static getConfig() {
        // Leo: get the base configuration from standard environment variables first.
        const defaultConfig = this.getDefaultConfig();
        let serviceKey = null;

        // Leo: check for the new service key credential environment variable.
        if (process.env.BTP_LOGGING_SRV_KEY_CRED) {
            try {
                serviceKey = JSONUtils.getEnvJSONObject(process.env.BTP_LOGGING_SRV_KEY_CRED);
            } catch (error) {
                console.error('Failed to parse BTP_LOGGING_SRV_KEY_CRED service key:', error);
            }
        }

        if (serviceKey) {
            console.log(`test`);
            // Leo: if a service key exists, derive config from it & merge service key config over the default config to ensure it takes precedence.
            const serviceKeyConfig = this.fromServiceKey(serviceKey);
            return { ...defaultConfig, ...serviceKeyConfig };
        } else {
            // Leo: if no service key, return the configuration from standard environment variables.
            return defaultConfig;
        }
    }
}

module.exports = ConfigManager;