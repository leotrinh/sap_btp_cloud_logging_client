const ConfigManager = require('./ConfigManager');
const LogFormatter = require('./LogFormatter');
const { HttpTransport, createAuthStrategy } = require('./Transport');

/**
 * @typedef {import('../types').CloudLoggingConfig} CloudLoggingConfig
 * @typedef {import('../types').LogMetadata} LogMetadata
 * @typedef {import('../types').FormattedLogEntry} FormattedLogEntry
 * @typedef {import('../types').LogEntry} LogEntry
 */

/**
 * Process-level listeners are a property of the process, not of an instance.
 * Registering them per instance leaks a pair of listeners on every construction
 * and trips Node's MaxListenersExceededWarning at ten. Until the previous
 * removeAllListeners() call was removed this leak was invisible, because each
 * construction wiped the slate first.
 */
let globalErrorHandlersRegistered = false;

/**
 * Leo: Log level priority for filtering
 * @type {Record<string, number>}
 */
const LOG_LEVEL_PRIORITY = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

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
    this.retryTimer = null; // @ts-ignore - Timer type

    // Leo: Initialize transport with auth strategy
    const authStrategy = createAuthStrategy(this.config);
    this.transport = new HttpTransport(this.config, authStrategy);

    // Leo: Set minimum log level (default: DEBUG = log everything)
    this.minLogLevel = LOG_LEVEL_PRIORITY[this.config.logLevel || 'DEBUG'] || 0;

    // DEPRECATED: this defaults to enabled only to keep existing consumers working.
    // Process-level error handling belongs to the application, not to one of its
    // libraries — see _setupGlobalErrorHandling for what being enabled costs.
    // The default flips to `false` in 2.0.0; set it explicitly to pin the behaviour.
    if (this.config.preventUncaughtExceptions !== false) {
      this._setupGlobalErrorHandling();
    }
  }

  /**
   * Leo: Check if a log level should be logged based on config
   * @param {string} level
   * @returns {boolean}
   */
  _shouldLog(level) {
    const levelPriority = LOG_LEVEL_PRIORITY[level.toUpperCase()] ?? 0;
    return levelPriority >= this.minLogLevel;
  }

  /**
   * @param {string} level
   * @param {string} message
   * @param {LogMetadata} [metadata]
   */
  async log(level, message, metadata = {}) {
    // Leo: Skip if below minimum log level
    if (!this._shouldLog(level)) {
      return;
    }

    try {
      // Leo: endpoint validation is handled by HttpTransport.send()
      const logEntry = this.formatter.format(level, message, metadata);
      await this.transport.send(logEntry);
      this.retryCount = 0;
      this.isHealthy = true;
    } catch (error) {
      await this._handleError(error, level, message, metadata);
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
      // Clear existing timer before setting new one to prevent memory leaks
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
      }
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.log(level, message, metadata);
      }, delay);
      return; // Don't throw error when retrying
    }
    if (this.config.fallbackToConsole && this.config.fallbackLogger) {
      this.config.fallbackLogger.log(level, message, { ...metadata, error: error.message });
      return; // Don't throw error when using fallback logger
    } else if (this.config.fallbackToConsole) {
      // eslint-disable-next-line no-console
      console.error(`Cloud Logging failed: ${error.message}. Log:`, { level, message, metadata });
      return; // Don't throw error when using console fallback
    }

    if (this.config.onError) {
      this.config.onError(error, { level, message, metadata });
    }

    // Throw error if no retry or fallback is available
    throw error;
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
    if (!entries?.length) return;

    // Leo: Filter entries based on log level
    const filteredEntries = entries.filter(entry => this._shouldLog(entry.level));
    if (!filteredEntries.length) return;

    try {
      // Leo: endpoint validation is handled by HttpTransport.send()
      const formattedEntries = filteredEntries.map(entry =>
        this.formatter.format(entry.level, entry.message, entry.metadata)
      );

      await this.transport.send(formattedEntries);
    } catch (error) {
      // Ensure error is properly typed as Error for TypeScript compatibility
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this._handleBatchError(filteredEntries, errorObj);
    }
  }

  /**
   * Leo: Handles errors for all entries in a batch
   * @private
   * @param {LogEntry[]} entries - Log entries that failed
   * @param {Error} error - The error that occurred
   */
  _handleBatchError(entries, error) {
    entries.forEach(entry => {
      this._handleError(error, entry.level, entry.message, entry.metadata || {});
    });
  }

  getHealthStatus() {
    return {
      healthy: this.isHealthy,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      endpoint: this.config.ingestEndpoint || 'Not configured',
      mtlsEndpoint: this.config.ingestMtlsEndpoint || 'Not configured'
    };
  }

  async shutdown() {
    // eslint-disable-next-line no-console
    console.log('Cloud Logging Service shutting down...');
    
    // Clear retry timer if exists
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Opt-in handling of process-level errors that originate in this package.
   *
   * Listeners are ADDED, never swapped in: the application's own
   * uncaughtException/unhandledRejection handlers — and those of any APM or
   * crash reporter — stay registered and keep running.
   *
   * Caveat the caller is accepting by enabling this: Node does not terminate on
   * an uncaught exception while any listener is registered. An error that is
   * not ours is therefore re-thrown when no other listener exists, so the
   * application still crashes exactly as it would without this package. The
   * default flips to `false` in 2.0.0, where the application owns this outright.
   *
   * @private
   */
  _setupGlobalErrorHandling() {
    if (globalErrorHandlersRegistered) {
      return;
    }
    globalErrorHandlersRegistered = true;

    // Add our error handler
    const errorHandler = (/** @type {any} */ error) => {
      // Check if error is related to our Cloud Logging
      const errorMessage = error?.message || '';
      const errorCode = error?.code;
      
      if (errorMessage.includes('Cloud Logging') || 
          errorMessage.includes('cloud logging') ||
          errorCode === 'ECONNRESET' ||
          errorCode === 'ECONNREFUSED' ||
          errorCode === 'ENOTFOUND' ||
          errorCode === 'ETIMEDOUT' ||
          errorCode === 'ECONNABORTED') {
        
        // eslint-disable-next-line no-console
        console.error('Cloud Logging Error (handled):', errorMessage);
        
        // Don't crash the application - just log the error
        return;
      }
      
      // Anything else belongs to the application, whose own listeners are still
      // registered and run untouched. When ours is the only one, returning would
      // leave the process alive after an unrelated bug — Node does not terminate
      // while a listener exists — so re-throw to restore the crash the
      // application would have had without this package.
      if (process.listeners('uncaughtException').every((listener) => listener === errorHandler)) {
        throw error;
      }
    };

    // Register alongside existing listeners — never replace them.
    process.on('uncaughtException', errorHandler);

    // Also handle unhandled promise rejections
    const rejectionHandler = (/** @type {any} */ reason) => {
      const errorMessage = reason?.message || String(reason);
      
      if (errorMessage.includes('Cloud Logging') || 
          errorMessage.includes('cloud logging')) {
        
        // eslint-disable-next-line no-console
        console.error('Cloud Logging Promise Rejection (handled):', errorMessage);
        return;
      }
      
      // Anything else belongs to the application; its own listeners still run.
    };

    process.on('unhandledRejection', rejectionHandler);
  }
}

module.exports = CloudLoggingService;