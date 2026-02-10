import { createLogger, CloudLoggingService } from 'sap-btp-cloud-logging-client';

// Types for log levels
type LogLevel = 'info' | 'error' | 'warn' | 'debug' | 'fatal';

// Base metadata interface
interface BaseMetadata {
    timestamp?: string;
    environment?: string;
    [key: string]: any;
}

// API log options
interface ApiLogOptions {
    source?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    sourceSystem?: string;
    userId?: string;
    correlationId?: string;
    duration?: string;
    includePayload?: boolean;
    payload?: any;
    includeResponse?: boolean;
    response?: any;
    error?: {
        message?: string;
        stack?: string;
        code?: string;
    };
}

// Scheduler log options
interface SchedulerLogOptions {
    jobName?: string;
    jobId?: string;
    cronExpression?: string;
    executionTime?: string;
    status?: 'started' | 'completed' | 'failed' | 'scheduled' | 'skipped' | 'validation-failed' | 'schedule-failed';
    recordsProcessed?: number;
    errorCount?: number;
    error?: {
        message?: string;
        stack?: string;
    };
}

// Event log options
interface EventLogOptions {
    eventName?: string;
    eventId?: string;
    eventSource?: string;
    eventType?: string;
    entityId?: string;
    entityType?: string;
    userId?: string;
    includeData?: boolean;
    data?: any;
    error?: {
        message?: string;
        stack?: string;
    };
}

// Base/System log options
interface BaseLogOptions {
    component?: string;
    action?: string;
    module?: string;
    custom?: Record<string, any>;
    error?: {
        message?: string;
        stack?: string;
    };
}

// Log types enum
enum LogType {
    API = 'API',
    SCHEDULER = 'SCHEDULER',
    EVENT = 'EVENT',
    BASE = 'BASE'
}

class LogUtils {
    private static instance: LogUtils;
    private cloudLogger: CloudLoggingService | null;
    private readonly logTypes = LogType;
    private fallbackLogger: any; // Your custom logger

    private constructor(fallbackLogger?: any) {
        this.cloudLogger = this.initializeCloudLogger();
        this.fallbackLogger = fallbackLogger || console;
    }

    public static getInstance(fallbackLogger?: any): LogUtils {
        if (!LogUtils.instance) {
            LogUtils.instance = new LogUtils(fallbackLogger);
        }
        return LogUtils.instance;
    }

    private initializeCloudLogger(): CloudLoggingService | null {
        try {
            // Leo: using default instance with env value maintenance 
            // Now supports BTP_LOG_LEVEL for filtering
            const btpCloudLogger = createLogger();
            if (!btpCloudLogger) {
                throw new Error(`Can't get BTP Cloud Logging Client instance`);
            }
            return btpCloudLogger;
        } catch (error: any) {
            this.fallbackLogger.error(`get BTP Cloud Logging Client instance error: ${error?.message ?? 'N/A'}`);
            return null; // Return null instead of throwing to allow fallback logging
        }
    }

    // Core logging method
    private log(level: LogLevel, message: string, metadata: BaseMetadata = {}): void {
        const enrichedMetadata: BaseMetadata = {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            ...metadata
        };

        if (this.cloudLogger) {
            // Cloud logging handles filtering via BTP_LOG_LEVEL
            this.cloudLogger[level](message, enrichedMetadata);
        }

        // Fallback to console logger if cloud logger fails or is not available
        // Note: You might want to skip this if cloud logging is working fine to avoid double logging
        // But keeping it for now as a fallback/debug mechanism
        // this.fallbackLogger[level](message, enrichedMetadata); 
    }

    // Standard log methods
    public info(message: string, metadata: BaseMetadata = {}): void {
        this.log('info', message, metadata);
    }

    public error(message: string, error?: Error | any, metadata: BaseMetadata = {}): void {
        const errorMetadata: BaseMetadata = {
            ...metadata,
            error: {
                message: error?.message,
                stack: error?.stack,
                code: error?.code
            }
        };
        this.log('error', message, errorMetadata);
    }

    public warn(message: string, metadata: BaseMetadata = {}): void {
        this.log('warn', message, metadata);
    }

    public debug(message: string, metadata: BaseMetadata = {}): void {
        this.log('debug', message, metadata);
    }

    public fatal(message: string, error?: Error | any, metadata: BaseMetadata = {}): void {
        const errorMetadata: BaseMetadata = {
            ...metadata,
            error: {
                message: error?.message,
                stack: error?.stack,
                code: error?.code
            }
        };
        this.log('fatal', message, errorMetadata);
    }

    // Specialized logging methods with predefined metadata structures

    // API Logs
    private logApi(level: LogLevel, message: string, options: ApiLogOptions = {}): void {
        const metadata: BaseMetadata = {
            type: this.logTypes.API,
            source: options.source || 'unknown',
            endpoint: options.endpoint || '',
            method: options.method || '',
            statusCode: options.statusCode,
            sourceSystem: options.sourceSystem || '',
            userId: options.userId,
            correlationId: options.correlationId,
            duration: options.duration,
            payload: options.includePayload ? options.payload : undefined,
            response: options.includeResponse ? options.response : undefined
        };

        this.log(level, message, metadata);
    }

    public apiInfo(message: string, options: ApiLogOptions = {}): void {
        this.logApi('info', message, options);
    }

    public apiError(message: string, error?: Error | any, options: ApiLogOptions = {}): void {
        const errorOptions: ApiLogOptions = {
            ...options,
            error: {
                message: error?.message,
                stack: error?.stack,
                code: error?.code
            }
        };
        this.logApi('error', message, errorOptions);
    }

    public apiWarn(message: string, options: ApiLogOptions = {}): void {
        this.logApi('warn', message, options);
    }

    public apiDebug(message: string, options: ApiLogOptions = {}): void {
        this.logApi('debug', message, options);
    }

    // Scheduler Logs
    private logScheduler(level: LogLevel, message: string, options: SchedulerLogOptions = {}): void {
        const metadata: BaseMetadata = {
            type: this.logTypes.SCHEDULER,
            jobName: options.jobName || 'unknown',
            jobId: options.jobId,
            cronExpression: options.cronExpression,
            executionTime: options.executionTime,
            status: options.status,
            recordsProcessed: options.recordsProcessed,
            errorCount: options.errorCount
        };

        this.log(level, message, metadata);
    }

    public schedulerInfo(message: string, options: SchedulerLogOptions = {}): void {
        this.logScheduler('info', message, options);
    }

    public schedulerError(message: string, error?: Error | any, options: SchedulerLogOptions = {}): void {
        const errorOptions: SchedulerLogOptions = {
            ...options,
            status: options.status || 'failed',
            error: {
                message: error?.message,
                stack: error?.stack
            }
        };
        this.logScheduler('error', message, errorOptions);
    }

    public schedulerWarn(message: string, options: SchedulerLogOptions = {}): void {
        this.logScheduler('warn', message, options);
    }

    public schedulerDebug(message: string, options: SchedulerLogOptions = {}): void {
        this.logScheduler('debug', message, options);
    }

    // Event Logs
    private logEvent(level: LogLevel, message: string, options: EventLogOptions = {}): void {
        const metadata: BaseMetadata = {
            type: this.logTypes.EVENT,
            eventName: options.eventName || 'unknown',
            eventId: options.eventId,
            eventSource: options.eventSource,
            eventType: options.eventType,
            entityId: options.entityId,
            entityType: options.entityType,
            userId: options.userId,
            data: options.includeData ? options.data : undefined
        };

        this.log(level, message, metadata);
    }

    public eventInfo(message: string, options: EventLogOptions = {}): void {
        this.logEvent('info', message, options);
    }

    public eventError(message: string, error?: Error | any, options: EventLogOptions = {}): void {
        const errorOptions: EventLogOptions = {
            ...options,
            error: {
                message: error?.message,
                stack: error?.stack
            }
        };
        this.logEvent('error', message, errorOptions);
    }

    public eventWarn(message: string, options: EventLogOptions = {}): void {
        this.logEvent('warn', message, options);
    }

    public eventDebug(message: string, options: EventLogOptions = {}): void {
        this.logEvent('debug', message, options);
    }

    // Base/System Logs
    private logBase(level: LogLevel, message: string, options: BaseLogOptions = {}): void {
        const metadata: BaseMetadata = {
            type: this.logTypes.BASE,
            component: options.component || 'system',
            action: options.action,
            module: options.module,
            ...options.custom
        };

        this.log(level, message, metadata);
    }

    public baseInfo(message: string, options: BaseLogOptions = {}): void {
        this.logBase('info', message, options);
    }

    public baseError(message: string, error?: Error | any, options: BaseLogOptions = {}): void {
        const errorOptions: BaseLogOptions = {
            ...options,
            error: {
                message: error?.message,
                stack: error?.stack
            }
        };
        this.logBase('error', message, errorOptions);
    }

    public baseWarn(message: string, options: BaseLogOptions = {}): void {
        this.logBase('warn', message, options);
    }

    public baseDebug(message: string, options: BaseLogOptions = {}): void {
        this.logBase('debug', message, options);
    }

    // Utility method to get cloud logger instance (if needed for advanced usage)
    public getCloudLogger(): CloudLoggingService | null {
        return this.cloudLogger;
    }
}

// Export singleton instance getter and types
export default LogUtils;
export {
    LogUtils,
    LogLevel,
    BaseMetadata,
    ApiLogOptions,
    SchedulerLogOptions,
    EventLogOptions,
    BaseLogOptions,
    LogType
};