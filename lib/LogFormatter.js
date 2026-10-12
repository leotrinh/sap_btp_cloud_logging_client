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
      // Cloud Logging and the Java sibling package both name this written_at.
      // The platform adds its own @timestamp on arrival, which is a different
      // instant — arrival, not authorship — so both are worth having.
      written_at: new Date().toISOString(),
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

    // Keys the formatter consumes and re-emits under a canonical name. They
    // must be removed before the spread, or the caller's own spelling survives
    // alongside the canonical one — which is how `correlationId` would come
    // back on an entry this release removed it from.
    const consumed = new Set(['correlationId', 'correlation_id', 'requestId']);
    if (requestDetails) {
      consumed.add('req');
    }
    const ownMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !consumed.has(key))
    );

    // Then spread metadata to allow user override. Redaction happens here so it
    // covers both public entry points (createLogger and logUtils) rather than one.
    Object.assign(baseLog, this.config.sanitizeMetadata === false ? ownMetadata : sanitize(ownMetadata));

    // Apply BTP Cloud Logging if enabled
    if (this.config.enableSAPFieldMapping !== false) {
      this._applyCloudLoggingFieldMapping(baseLog);
    }

    // Cloud Logging reads `correlation_id` semantically: it strips the hyphens
    // and derives a W3C trace-context `trace_id`, which is what lets an entry
    // join a trace. The same value under `correlationId` is stored but inert.
    // Only the snake_case name is emitted. Every spelling is still accepted as
    // input — correlationId, correlation_id, requestId — so no caller changes.
    const correlationId = metadata.correlationId || metadata.correlation_id || metadata.requestId;
    if (correlationId) {
      (/** @type {any} */ (baseLog)).correlation_id = correlationId;
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