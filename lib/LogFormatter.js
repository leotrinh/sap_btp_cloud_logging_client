const os = require('os');
const { sanitize } = require('./Logger');

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

    // A real HTTP request is circular and carries headers such as authorization,
    // so it is replaced by a safe subset and never reaches the payload itself.
    // Anything else a consumer happens to call `req` is ordinary metadata and
    // must survive untouched.
    const requestDetails = this._formatRequest(metadata.req);
    let ownMetadata = metadata;
    if (requestDetails) {
      ownMetadata = Object.fromEntries(
        Object.entries(metadata).filter(([key]) => key !== 'req')
      );
    }

    // Then spread metadata to allow user override. Redaction happens here so it
    // covers both public entry points (createLogger and logUtils) rather than one.
    Object.assign(baseLog, this.config.sanitizeMetadata === false ? ownMetadata : sanitize(ownMetadata));

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

    if (requestDetails) {
      // LEO-FIX: Cast to any to allow adding a property dynamically.
      (/** @type {any} */ (baseLog)).request = requestDetails;
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
       * Extract the safe subset of an HTTP request.
       * Returns null for anything that is not request-shaped, so a consumer who
       * passes an unrelated value named `req` keeps it as plain metadata instead
       * of losing it — or crashing on `req.get`.
       *
       * @param {any} req
       * @returns {object | null}
       */
  _formatRequest(req) {
    if (!req || typeof req !== 'object' || typeof req.get !== 'function') {
      return null;
    }
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