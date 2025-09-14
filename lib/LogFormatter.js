const os = require('os');

/**
 * @typedef {import('../types').CloudLoggingConfig} CloudLoggingConfig
 * @typedef {import('../types').LogMetadata} LogMetadata
 * @typedef {import('../types').FormattedLogEntry} FormattedLogEntry
 */

class LogFormatter {
  /**
       * @param {CloudLoggingConfig} config
       */
  constructor(config) {
    this.config = config;
  }

  /**
       * @param {string} level
       * @param {string} message
       * @param {LogMetadata} [metadata]
       * @returns {FormattedLogEntry}
       */
  format(level, message, metadata = {}) {
    const baseLog = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: this._formatMessage(message),
      application: this.config.applicationName,
      environment: this.config.environment,
      subaccount: this.config.subaccountId,
      hostname: os.hostname(),
      pid: process.pid,
      ...metadata,
    };

    if (metadata.correlationId || metadata.requestId) {
      baseLog.correlationId = metadata.correlationId || metadata.requestId;
    }

    if (level.toUpperCase() === 'ERROR' && this.config.includeStackTrace) {
      // LEO-FIX: Cast to any to allow adding a property dynamically.
      (/** @type {any} */ (baseLog)).stack = this._getStackTrace();
    }

    if (metadata.req) {
      // LEO-FIX: Cast to any to allow adding a property dynamically.
      (/** @type {any} */ (baseLog)).request = this._formatRequest(metadata.req);
    }

    return /** @type {FormattedLogEntry} */ (baseLog);
  }

  /**
       * @param {any} message
       */
  _formatMessage(message) {
    if (typeof message === 'object') {
      return JSON.stringify(message);
    }
    return String(message);
  }

  /**
       * @param {import('express').Request} req
       */
  _formatRequest(req) {
    return {
      method: req.method,
      url: req.url,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      correlationId: req.get(this.config.correlationIdHeader || 'x-correlation-id'),
    };
  }

  _getStackTrace() {
    const err = new Error();
    return err.stack ? err.stack.split('\n').slice(2).join('\n') : '';
  }
}

module.exports = LogFormatter;