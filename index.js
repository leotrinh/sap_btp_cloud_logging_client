const CloudLoggingService = require('./lib/CloudLoggingService');
const LogFormatter = require('./lib/LogFormatter');
const ConfigManager = require('./lib/ConfigManager');
const Middleware = require('./lib/Middleware');
const WinstonTransport = require('./lib/WinstonTransport');

/**
 * @typedef {import('./types').CloudLoggingConfig} CloudLoggingConfig
 */

module.exports = {
  CloudLoggingService,
  LogFormatter,
  ConfigManager,

  /**
   * Factory function for easy initialization
   * @param {CloudLoggingConfig} [config]
   * @returns {CloudLoggingService}
   */
  createLogger: (config) => {
    return new CloudLoggingService(config);
  },

  middleware: Middleware,
  WinstonTransport: WinstonTransport,
};