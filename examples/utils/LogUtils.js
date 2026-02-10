const { createLogger } = require('sap-btp-cloud-logging-client');
const logger = require('./logger');

class LogUtils {
  constructor() {
    this.cloudLogger = this.initializeCloudLogger();
    this.logTypes = {
      API: 'API',
      SCHEDULER: 'SCHEDULER',
      EVENT: 'EVENT',
      BASE: 'BASE',
    };
  }

  initializeCloudLogger() {
    try {
      const btpCloudLogger = createLogger();
      if (!btpCloudLogger) {
        throw new Error('Can\'t get BTP Cloud Logging Client instance');
      }
      return btpCloudLogger;
    } catch (error) {
      logger.error(
        `get BTP Cloud Logging Client instance error: ${error.message ?? 'N/A'}`
      );
      return null;
    }
  }

  log(level, message, metadata = {}) {
    const enrichedMetadata = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      ...metadata,
    };

    if (this.cloudLogger) {
      this.cloudLogger[level](message, enrichedMetadata);
    }

    // Fallback to console logger
    logger[level](message, enrichedMetadata);
  }

  // Standard log methods
  info(message, metadata = {}) {
    this.log('info', message, metadata);
  }

  error(message, error, metadata = {}) {
    const errorMetadata = {
      ...metadata,
      error: {
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
      },
    };
    this.log('error', message, errorMetadata);
  }

  warn(message, metadata = {}) {
    this.log('warn', message, metadata);
  }

  debug(message, metadata = {}) {
    this.log('debug', message, metadata);
  }

  fatal(message, error, metadata = {}) {
    const errorMetadata = {
      ...metadata,
      error: {
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
      },
    };
    this.log('fatal', message, errorMetadata);
  }
  //Api Logs
  logApi(level, message, options = {}) {
    const metadata = {
      type: this.logTypes.API,
      source: options.source || 'unknown',
      endpoint: options.endpoint || '',
      method: options.method || '',
      statusCode: options.statusCode,
      sourceSystem: options.sourceSystem || '',
      userId: options.userId || '',
      correlationId: options.correlationId || '',
      duration: options.duration,
      payload: options.includePayload ? options.payload : undefined,
      response: options.includeResponse ? options.response : undefined,
    };

    this.log(level, message, metadata);
  }

  apiInfo(message, options = {}) {
    this.logApi('info', message, options);
  }

  apiError(message, error, options = {}) {
    const errorOptions = {
      ...options,
      error: {
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
      },
    };
    this.logApi('error', message, errorOptions);
  }

  // Scheduler Logs
  logScheduler(level, message, options = {}) {
    const metadata = {
      type: this.logTypes.SCHEDULER,
      jobName: options.jobName || 'unknown',
      jobId: options.jobId,
      cronExpression: options.cronExpression,
      executionTime: options.executionTime,
      status: options.status, // 'started', 'completed', 'failed'
      recordsProcessed: options.recordsProcessed,
      errorCount: options.errorCount,
    };

    this.log(level, message, metadata);
  }

  schedulerInfo(message, options = {}) {
    this.logScheduler('info', message, options);
  }

  schedulerError(message, error, options = {}) {
    const errorOptions = {
      ...options,
      status: 'failed',
      error: {
        message: error?.message,
        stack: error?.stack,
      },
    };
    this.logScheduler('error', message, errorOptions);
  }

  // Event Logs
  logEvent(level, message, options = {}) {
    const metadata = {
      type: this.logTypes.EVENT,
      eventName: options.eventName || 'unknown',
      eventId: options.eventId,
      eventSource: options.eventSource,
      eventType: options.eventType,
      entityId: options.entityId,
      entityType: options.entityType,
      userId: options.userId,
      data: options.includeData ? options.data : undefined,
    };

    this.log(level, message, metadata);
  }

  eventInfo(message, options = {}) {
    this.logEvent('info', message, options);
  }

  eventError(message, error, options = {}) {
    const errorOptions = {
      ...options,
      error: {
        message: error?.message,
        stack: error?.stack,
      },
    };
    this.logEvent('error', message, errorOptions);
  }

  // Base/System Logs
  logBase(level, message, options = {}) {
    const metadata = {
      type: this.logTypes.BASE,
      component: options.component || 'system',
      action: options.action,
      module: options.module,
      ...options.custom,
    };

    this.log(level, message, metadata);
  }

  baseInfo(message, options = {}) {
    this.logBase('info', message, options);
  }

  baseError(message, error, options = {}) {
    const errorOptions = {
      ...options,
      error: {
        message: error?.message,
        stack: error?.stack,
      },
    };
    this.logBase('error', message, errorOptions);
  }
}

module.exports = new LogUtils();
