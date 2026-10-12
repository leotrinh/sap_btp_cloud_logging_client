/**
 * @typedef {import('./CloudLoggingService')} CloudLoggingService
 */

/** @type {any} */
let cached = null;

/**
 * Build the transport class on first use.
 *
 * `winston` is an optional peer dependency, so it must not be required when
 * the module is loaded — only when a consumer actually asks for this
 * transport. Defining the class eagerly would require it at import time and
 * break every consumer who does not use winston at all.
 *
 * @returns {any}
 */
function getBTPCloudLoggingTransport() {
  if (cached) {
    return cached;
  }

  let Transport;
  try {
    // @ts-ignore - winston exposes Transport at runtime; its types name it differently
    Transport = require('winston').Transport;
  } catch {
    throw new Error(
      'WinstonTransport requires the optional peer dependency "winston". Install it with: npm install winston'
    );
  }

  class BTPCloudLoggingTransport extends Transport {
    /**
       * @param {{ cloudLogger: CloudLoggingService } & import('winston').transport.TransportStreamOptions} options
       */
    constructor(options) {
      super(options);
      this.name = 'btp-cloud-logging';
      this.cloudLogger = options.cloudLogger;
    }

    /**
       * @param {any} info
       * @param {() => void} callback
       */
    log(info, callback) {
      setImmediate(() => {
        // LEO-FIX: Ignore this line. The 'emit' method is inherited but not found by TSC.
        // @ts-ignore
        this.emit('logged', info);
      });

      // Leo: Forward Winston metadata to cloud logger (Fix: was passing empty {})
      const { level, message, ...metadata } = info;
      this.cloudLogger.log(level, message, metadata).catch((error) => {
        // LEO-FIX: Ignore this line. The 'emit' method is inherited but not found by TSC.
        // @ts-ignore
        this.emit('error', error);
      });

      callback();
    }
  }

  cached = BTPCloudLoggingTransport;
  return cached;
}

module.exports = getBTPCloudLoggingTransport;