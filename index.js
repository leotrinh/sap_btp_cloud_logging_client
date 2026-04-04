const CloudLoggingService = require('./lib/CloudLoggingService');
const LogFormatter = require('./lib/LogFormatter');
const ConfigManager = require('./lib/ConfigManager');
const Middleware = require('./lib/Middleware');
const WinstonTransport = require('./lib/WinstonTransport');
const Logger = require('./lib/Logger');
const { sanitize } = require('./lib/Logger');
const logUtils = require('./lib/LogUtils');
const { LogUtils } = require('./lib/LogUtils');

/**
 * @typedef {import('./types').CloudLoggingConfig} CloudLoggingConfig
 */

module.exports = {
  // Core cloud logging
  CloudLoggingService,
  LogFormatter,
  ConfigManager,
  createLogger: (config) => new CloudLoggingService(config),
  middleware: Middleware,
  WinstonTransport,

  // Console fallback logger + sanitize utility
  Logger,
  sanitize,

  // Domain logger — singleton (ready to use) + class (for custom instantiation)
  logUtils,
  LogUtils,
  createLogUtils: () => new LogUtils(),
};
