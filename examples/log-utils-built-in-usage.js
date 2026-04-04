'use strict';
/**
 * Logger & LogUtils built-in usage (v1.0.8+)
 *
 * logUtils — domain logger singleton with structured log types (API, Event, Base)
 * Logger   — console fallback with sensitive data redaction
 * sanitize — utility to redact sensitive fields from any object
 *
 * No need to copy LogUtils/Logger manually anymore — they are bundled in the package.
 */

const { logUtils, Logger, sanitize, LogUtils } = require('sap-btp-cloud-logging-client');

// ─── Standard logging ─────────────────────────────────────────────────────

logUtils.info('Application started');
logUtils.warn('Low memory warning', { availableMB: 128 });
logUtils.debug('Config loaded', { env: process.env.NODE_ENV });

// Error with Error object (extracts message + stack automatically)
try {
    throw new Error('DB connection timeout');
} catch (err) {
    logUtils.error('OrderService - fetchOrders failed', err, { orderId: 'ORD-001' });
}

// ─── API Logs ─────────────────────────────────────────────────────────────

logUtils.apiInfo('POST /orders received', {
    source: 'OrderService',
    endpoint: '/orders',
    method: 'POST',
    statusCode: 201,
    correlationId: 'req-abc-123'
});

logUtils.apiError('GET /suppliers failed', new Error('Timeout'), {
    source: 'SupplierService',
    endpoint: '/suppliers',
    statusCode: 503
});

// ─── Event Logs ───────────────────────────────────────────────────────────

logUtils.eventInfo('PurchaseOrder.Created event received', {
    eventName: 'PurchaseOrder.Created',
    eventType: 'WEBHOOK',
    entityId: 'PO-4500012345',
    entityType: 'PO'
});

logUtils.eventError('RiskScore sync failed', new Error('API unavailable'), {
    eventName: 'RiskScore.Changed',
    entityId: 'SUPPLIER-001'
});

// ─── Base/System Logs ─────────────────────────────────────────────────────

logUtils.baseInfo('DB migration completed', {
    component: 'MigrationService',
    action: 'migrate',
    module: 'db'
});

logUtils.baseError('Cache flush failed', new Error('Redis unavailable'), {
    component: 'CacheService',
    action: 'flush'
});

// ─── Console fallback Logger (direct) ────────────────────────────────────

Logger.info('Direct console fallback log');
Logger.error('Direct error log', { context: 'startup' });

// ─── Sanitize utility ─────────────────────────────────────────────────────

const payload = {
    userId: 'u-123',
    password: 'secret123',       // → [REDACTED]
    token: 'Bearer abc',         // → [REDACTED]
    nested: { apikey: 'key99' }  // → [REDACTED]
};
console.log('Sanitized payload:', sanitize(payload));

// ─── Custom LogUtils instance (if needed) ────────────────────────────────

const myLogger = new LogUtils(); // fresh instance with its own BTP Cloud Logger init
myLogger.baseInfo('Custom instance ready', { component: 'MyService' });
