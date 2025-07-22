//@ts-ignore
const Transport = require('winston').Transport;

/**
 * @typedef {import('./CloudLoggingService')} CloudLoggingService
 */

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

        this.cloudLogger.log(info.level, info.message, {
        }).catch((error) => {
            // LEO-FIX: Ignore this line. The 'emit' method is inherited but not found by TSC.
            // @ts-ignore
            this.emit('error', error);
        });

        callback();
    }
}

module.exports = BTPCloudLoggingTransport;