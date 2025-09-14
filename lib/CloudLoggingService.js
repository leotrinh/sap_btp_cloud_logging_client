const axios = require('axios');
const https = require('https');
const ConfigManager = require('./ConfigManager');
const LogFormatter = require('./LogFormatter');

/**
 * @typedef {import('../types').CloudLoggingConfig} CloudLoggingConfig
 * @typedef {import('../types').LogMetadata} LogMetadata
 * @typedef {import('../types').FormattedLogEntry} FormattedLogEntry
 * @typedef {import('../types').LogEntry} LogEntry
 */

class CloudLoggingService {
	/**
		 * @param {CloudLoggingConfig} [config]
		 */
	constructor(config = {}) {
		// Leo: Configuration is merged using the updated ConfigManager, which now correctly
		// prioritizes the BTP_LOGGING_SRV_KEY_CRED environment variable over individual settings.
		this.config = ConfigManager.mergeConfig(config);
		this.formatter = new LogFormatter(this.config);
		this.isHealthy = true;
		this.retryCount = 0;
		this.maxRetries = this.config.maxRetries || 3;
		this._initializeAuth();
	}

	_initializeAuth() {
		if (!this.config.ingestEndpoint) return; // Leo: do not attempt auth setup if endpoint is missing.

		if (this.config.authType === 'basic') {
			this.authHeader = `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
		} else if (this.config.authType === 'mtls') {
			this.httpsAgent = new https.Agent({
				cert: this.config.clientCert,
				key: this.config.clientKey,
				ca: this.config.serverCa,
				rejectUnauthorized: true,
			});
		}
	}

	/**
		 * @param {string} level
		 * @param {string} message
		 * @param {LogMetadata} [metadata]
		 */
	async log(level, message, metadata = {}) {
		try {
			// Leo: if endpoint isn't configured, throw immediately to trigger fallback.
			if (!this.config.ingestEndpoint) {
				throw new Error('Cloud logging ingest endpoint is not configured.');
			}
			const logEntry = this.formatter.format(level, message, metadata);
			await this._sendLog(logEntry);
			this.retryCount = 0;
			this.isHealthy = true;
		} catch (error) {
			await this._handleError(error, level, message, metadata);
		}
	}

	/**
		 * @param {FormattedLogEntry} logEntry
		 */
	async _sendLog(logEntry) {
		/** @type {import('axios').AxiosRequestConfig} */
		const requestConfig = {
			method: 'POST',
			url: this.config.ingestEndpoint,
			data: logEntry,
			headers: { 'Content-Type': 'application/json' },
			timeout: this.config.timeout || 5000,
		};

		if (this.config.authType === 'basic') {
			//@ts-ignore
			requestConfig.headers.Authorization = this.authHeader;
		} else if (this.config.authType === 'mtls') {
			requestConfig.httpsAgent = this.httpsAgent;
		}

		// LEO-FIX: Ignore this line. Runtime vs. Type-definition mismatch for axios.
		// @ts-ignore
		const response = await axios(requestConfig);

		if (response.status >= 400) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
	}

	/**
		 * @param {any} error
		 * @param {string} level
		 * @param {string} message
		 * @param {LogMetadata} metadata
		 */
	async _handleError(error, level, message, metadata) {
		this.isHealthy = false;
		if (this.config.enableRetry && this.retryCount < this.maxRetries) {
			this.retryCount++;
			const delay = Math.pow(2, this.retryCount) * 1000;
			setTimeout(() => this.log(level, message, metadata), delay);
		}
		if (this.config.fallbackToConsole && this.config.fallbackLogger) {
			this.config.fallbackLogger.log(level, message, { ...metadata, error: error.message });
		} else if (this.config.fallbackToConsole) {
			// eslint-disable-next-line no-console
			console.error(`Cloud Logging failed: ${error.message}. Log:`, { level, message, metadata });
		}

		if (this.config.onError) {
			this.config.onError(error, { level, message, metadata });
		}
	}

	/**
		 * @param {string} message
		 * @param {LogMetadata} [metadata]
		 */
	async info(message, metadata = {}) { return this.log('INFO', message, metadata); }
	/**
		 * @param {string} message
		 * @param {LogMetadata} [metadata]
		 */
	async warn(message, metadata = {}) { return this.log('WARN', message, metadata); }
	/**
		 * @param {string} message
		 * @param {LogMetadata} [metadata]
		 */
	async error(message, metadata = {}) { return this.log('ERROR', message, metadata); }
	/**
		 * @param {string} message
		 * @param {LogMetadata} [metadata]
		 */
	async debug(message, metadata = {}) { return this.log('DEBUG', message, metadata); }
	/**
		 * @param {string} message
		 * @param {LogMetadata} [metadata]
		 */
	async fatal(message, metadata = {}) { return this.log('FATAL', message, metadata); }

	/**
		 * @param {LogEntry[]} entries
		 */
	async logBatch(entries) {
		if (!this.config.ingestEndpoint) {
			entries.forEach((entry) => {
				this._handleError(new Error('Cloud logging ingest endpoint is not configured.'), entry.level, entry.message, entry.metadata || {});
			});
			return;
		}
		const formattedEntries = entries.map((entry) =>
			this.formatter.format(entry.level, entry.message, entry.metadata)
		);
		try {
			// LEO-FIX: Ignore this line. Runtime vs. Type-definition mismatch for axios.
			// @ts-ignore
			await axios.post(this.config.ingestEndpoint || '', formattedEntries, {
				headers: { 'Authorization': this.authHeader, 'Content-Type': 'application/json' },
			});
		} catch (error) {
			entries.forEach((entry) => {
				this._handleError(error, entry.level, entry.message, entry.metadata || {});
			});
		}
	}

	getHealthStatus() {
		return {
			healthy: this.isHealthy,
			retryCount: this.retryCount,
			maxRetries: this.maxRetries,
			endpoint: this.config.ingestEndpoint || 'Not configured',
		};
	}

	async shutdown() {
		// eslint-disable-next-line no-console
		console.log('Cloud Logging Service shutting down...');
	}
}

module.exports = CloudLoggingService;