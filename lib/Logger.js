'use strict';
// Console-based fallback logger for environments where BTP Cloud Logging is unavailable.
// Used by LogUtils.js as a local fallback when the cloud logger cannot be initialized.

const SENSITIVE_KEYS = [
  'password', 'token', 'secret', 'authorization', 'apikey', 'api_key',
  'client_secret', 'clientsecret', 'access_token', 'refresh_token',
  'cookie', 'session', 'credential', 'private_key', 'privatekey',
  'ingest-password', 'dashboards-password', 'client-ca', 'server-ca',
  'ingest-mtls-key', 'ingest-mtls-cert'
];

const MAX_SANITIZE_DEPTH = 10;

/**
 * Recursively redact sensitive fields from an object before logging.
 * Includes a depth limit to prevent performance degradation on large payloads.
 *
 * @param {any} obj - The object to sanitize
 * @param {number} [depth=0] - Current recursion depth (internal use)
 * @returns {any} A sanitized copy of the object
 */
function sanitize(obj, depth = 0) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;
  if (depth >= MAX_SANITIZE_DEPTH) return '[Object too deep]';

  if (Array.isArray(obj)) return obj.map(item => sanitize(item, depth + 1));

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Format metadata for console output.
 * @param {object} [metadata]
 * @returns {string}
 */
function formatMeta(metadata) {
  if (!metadata || Object.keys(metadata).length === 0) return '';
  try {
    return ' ' + JSON.stringify(sanitize(metadata));
  } catch {
    return ' [metadata-serialization-error]';
  }
}

const logger = {
  info: (message, metadata) => {
    console.log(`[INFO] ${new Date().toISOString()}: ${message}${formatMeta(metadata)}`);
  },
  error: (message, metadata) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}${formatMeta(metadata)}`);
  },
  warn: (message, metadata) => {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}${formatMeta(metadata)}`);
  },
  debug: (message, metadata) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${new Date().toISOString()}: ${message}${formatMeta(metadata)}`);
    }
  }
};

module.exports = logger;
module.exports.sanitize = sanitize;
