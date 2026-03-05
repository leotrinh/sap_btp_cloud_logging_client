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
    const formattedMessage = this._formatMessage(message);
    
    // Create base log with core fields first
    const baseLog = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: formattedMessage,
      msg: formattedMessage, // Add msg field for BTP Cloud Logging filtering
      application: this.config.applicationName || 'unknown',
      environment: this.config.environment || 'unknown',
      subaccount: this.config.subAccountId || 'unknown',//Leo: keep subaccount instead change to sub_account cause of exist data
      hostname: os.hostname(),
      pid: process.pid,
    };

    // Then spread metadata to allow user override
    Object.assign(baseLog, metadata);

    // Apply BTP Cloud Logging if enabled
    if (this.config.enableSAPFieldMapping !== false) {
      this._applyCloudLoggingFieldMapping(baseLog);
    }

    if (metadata.correlationId || metadata.requestId) {
      (/** @type {any} */ (baseLog)).correlationId = metadata.correlationId || metadata.requestId;
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

  /**
   * Apply BTP Cloud Logging field mapping transformation
   * @param {FormattedLogEntry} logEntry
   * @private
   */
  _applyCloudLoggingFieldMapping(logEntry) {
    // Map internal fields to BTP Cloud Logging Standard Fields
    if (logEntry.message && !logEntry.msg) {
      logEntry.msg = logEntry.message;
    }
    
    if (logEntry.application && !logEntry.app_name) {
      logEntry.app_name = logEntry.application;
    }
    
    if (logEntry.subaccount && !logEntry.organization_name) {
      logEntry.organization_name = logEntry.subaccount;
    }

    // Remove original fields after mapping if enabled (default behavior)
    if (this.config.removeOriginalFieldsAfterMapping !== false) {
      delete logEntry.message;
      delete logEntry.application;
      delete logEntry.subaccount;
    }
  }
}

module.exports = LogFormatter;