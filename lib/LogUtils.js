'use strict';
// BTP Cloud Logging utility — wraps CloudLoggingService with structured domain log types.
// Provides apiInfo/apiError, eventInfo/eventError, baseInfo/baseError for consistent logging.
// Exported as singleton (logUtils) and class (LogUtils) for custom instantiation.

const CloudLoggingService = require('./CloudLoggingService');
const logger = require('./Logger');
const { sanitize } = require('./Logger');

const RETRY_DELAY_MS = 2000;
const MAX_INIT_RETRIES = 3;

const LOG_TYPES = { API: 'API', EVENT: 'EVENT', BASE: 'BASE' };

class LogUtils {
    constructor() {
        this.cloudLogger = null;
        this._initRetryCount = 0;
        this._initializeWithRetry();
    }

    // ─── Initialization with Retry ────────────────────────────────────────

    /**
     * Attempts to initialize BTP Cloud Logging Client.
     * Retries up to MAX_INIT_RETRIES times, then falls back to console-only mode.
     */
    _initializeWithRetry() {
        try {
            const btpCloudLogger = new CloudLoggingService();
            if (!btpCloudLogger) throw new Error("Can't get BTP Cloud Logging Client instance");
            this.cloudLogger = btpCloudLogger;
            logger.info('[LogUtils] BTP Cloud Logging Client initialized successfully');
        } catch (error) {
            this._initRetryCount++;
            logger.error(`[LogUtils] BTP Cloud Logging Client init error (attempt ${this._initRetryCount}/${MAX_INIT_RETRIES}): ${error?.message ?? 'N/A'}`);
            if (this._initRetryCount < MAX_INIT_RETRIES) {
                setTimeout(() => this._initializeWithRetry(), RETRY_DELAY_MS);
            } else {
                logger.warn('[LogUtils] All init retries exhausted. Running in console-only mode.');
            }
        }
    }

    // ─── Core log dispatcher ──────────────────────────────────────────────

    /**
     * Core log method — dispatches to BTP Cloud Logger (primary) and console fallback.
     * All metadata is sanitized before logging (tokens, passwords, secrets redacted).
     *
     * @param {'info'|'error'|'warn'|'debug'} level
     * @param {string} message
     * @param {object} [metadata={}]
     */
    log(level, message, metadata = {}) {
        const enrichedMetadata = {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            subaccount: process.env.BTP_SUBACCOUNT_ID || 'LEO_DEV_PAYG',
            application: process.env.BTP_APPLICATION_NAME || 'LEO_APP_DEV',
            ...sanitize(metadata)
        };

        if (this.cloudLogger) {
            try { this.cloudLogger[level](message, enrichedMetadata); } catch { /* fallback below */ }
        }
        logger[level](message, enrichedMetadata);
    }

    // ─── Standard log methods ─────────────────────────────────────────────

    info(message, metadata = {}) { this.log('info', message, metadata); }

    /**
     * Supports two calling conventions:
     *   log.error('msg', new Error('...'))   → extracts error.message/stack
     *   log.error('msg', { key: val })        → plain metadata
     *
     * @param {string} message
     * @param {Error|object} [errorOrMeta]
     * @param {object} [metadata={}]
     */
    error(message, errorOrMeta, metadata = {}) {
        if (errorOrMeta instanceof Error) {
            this.log('error', message, {
                ...metadata,
                error: { message: errorOrMeta.message, stack: errorOrMeta.stack, code: errorOrMeta.code }
            });
        } else {
            this.log('error', message, errorOrMeta || metadata);
        }
    }

    warn(message, metadata = {}) { this.log('warn', message, metadata); }
    debug(message, metadata = {}) { this.log('debug', message, metadata); }

    /** No-op stub for backward compat with cf-nodejs-logging-support */
    setLoggingLevel(_level) {}

    // ─── API Logs ─────────────────────────────────────────────────────────

    logApi(level, message, options = {}) {
        this.log(level, message, {
            type: LOG_TYPES.API,
            source: options.source || 'unknown',
            endpoint: options.endpoint || '',
            method: options.method || '',
            statusCode: options.statusCode,
            sourceSystem: options.sourceSystem || '',
            correlationId: options.correlationId || '',
            duration: options.duration,
            payload: options.includePayload ? options.payload : undefined,
            response: options.includeResponse ? options.response : undefined
        });
    }

    apiInfo(message, options = {}) { this.logApi('info', message, options); }

    apiError(message, error, options = {}) {
        this.logApi('error', message, {
            ...options,
            error: { message: error?.message, stack: error?.stack, code: error?.code }
        });
    }

    // ─── Event Logs ───────────────────────────────────────────────────────

    logEvent(level, message, options = {}) {
        this.log(level, message, {
            type: LOG_TYPES.EVENT,
            eventName: options.eventName || 'unknown',
            eventId: options.eventId,
            eventSource: options.eventSource,
            eventType: options.eventType,
            entityId: options.entityId,
            entityType: options.entityType,
            userId: options.userId,
            data: options.includeData ? options.data : undefined
        });
    }

    eventInfo(message, options = {}) { this.logEvent('info', message, options); }

    eventError(message, error, options = {}) {
        this.logEvent('error', message, {
            ...options,
            error: { message: error?.message, stack: error?.stack }
        });
    }

    // ─── Base/System Logs ─────────────────────────────────────────────────

    logBase(level, message, options = {}) {
        this.log(level, message, {
            type: LOG_TYPES.BASE,
            component: options.component || 'system',
            action: options.action,
            module: options.module,
            ...options.custom
        });
    }

    baseInfo(message, options = {}) { this.logBase('info', message, options); }

    baseError(message, error, options = {}) {
        this.logBase('error', message, {
            ...options,
            error: { message: error?.message, stack: error?.stack }
        });
    }
}

// Export singleton as default + expose class for custom instantiation
const logUtils = new LogUtils();
module.exports = logUtils;
module.exports.LogUtils = LogUtils;
