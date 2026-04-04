import { Request } from 'express';

export interface LogMetadata {
	[key: string]: any;
	correlationId?: string;
	requestId?: string;
	req?: Request;
}

export interface CloudLoggingConfig {
	// BTP Cloud Logging endpoints
	ingestEndpoint?: string;
	ingestMtlsEndpoint?: string;
	dashboardEndpoint?: string;

	// Authentication
	authType?: 'basic' | 'mtls';
	username?: string;
	password?: string;

	// mTLS certificates
	clientCert?: string;
	clientKey?: string;
	serverCa?: string;

	// Application context
	subAccountId?: string;
	applicationName?: string;
	environment?: string;

	// Logging configuration
	logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
	enableRetry?: boolean;
	maxRetries?: number;
	timeout?: number;

	// Additional fields
	includeStackTrace?: boolean;
	correlationIdHeader?: string;

	// BTP Cloud Logging field mapping
	enableSAPFieldMapping?: boolean; // Default: true
	removeOriginalFieldsAfterMapping?: boolean; // Default: true

	// Error handling
	preventUncaughtExceptions?: boolean; // Default: true

	// Fallback options
	fallbackToConsole?: boolean;
	fallbackLogger?: any;
	onError?: (error: Error, context: LogContext) => void;
}

export interface LogContext {
	level: string;
	message: string;
	metadata: LogMetadata;
}

export interface LogEntry {
	level: string;
	message: string;
	metadata?: LogMetadata;
}

export interface HealthStatus {
	healthy: boolean;
	retryCount: number;
	maxRetries: number;
	endpoint: string;
	mtlsEndpoint: string;
}

export interface ServiceKey {
	'client-ca': string;
	'dashboards-endpoint': string;
	'dashboards-password': string;
	'dashboards-username': string;
	'ingest-endpoint': string;
	'ingest-mtls-cert': string;
	'ingest-mtls-endpoint': string;
	'ingest-mtls-key': string;
	'ingest-password': string;
	'ingest-username': string;
	'server-ca': string;
}

export interface FormattedLogEntry {
	timestamp: string;
	level: string;
	message?: string; // Made optional to allow deletion
	msg: string; // Add msg field for SAP BTP Cloud Logging filtering
	application?: string; // Made optional to allow deletion
	environment: string;
	subaccount?: string; // Made optional to allow deletion
	hostname: string;
	pid: number;
	correlationId?: string;
	stack?: string;
	request?: RequestInfo;
	// BTP Cloud Logging standard fields
	app_name?: string; // Mapped from application
	organization_name?: string; // Mapped from subaccount
	[key: string]: any;
}

export interface RequestInfo {
	method: string;
	url: string;
	userAgent: string;
	ip: string;
	correlationId?: string;
}

export interface MiddlewareOptions {
	correlationIdHeader?: string;
	logRequests?: boolean;
	logResponses?: boolean;
	excludePaths?: string[];
}

export declare class CloudLoggingService {
	constructor(config?: CloudLoggingConfig);

	log(level: string, message: string, metadata?: LogMetadata): Promise<void>;
	info(message: string, metadata?: LogMetadata): Promise<void>;
	warn(message: string, metadata?: LogMetadata): Promise<void>;
	error(message: string, metadata?: LogMetadata): Promise<void>;
	debug(message: string, metadata?: LogMetadata): Promise<void>;
	fatal(message: string, metadata?: LogMetadata): Promise<void>;

	logBatch(entries: LogEntry[]): Promise<void>;
	getHealthStatus(): HealthStatus;
	shutdown(): Promise<void>;
}

export declare class LogFormatter {
	constructor(config: CloudLoggingConfig);
	format(level: string, message: string, metadata?: LogMetadata): FormattedLogEntry;
}

export declare class ConfigManager {
	static getDefaultConfig(): CloudLoggingConfig;
	static mergeConfig(userConfig?: CloudLoggingConfig): CloudLoggingConfig;
	static validateConfig(config: CloudLoggingConfig): void;
	static fromServiceKey(serviceKey: ServiceKey): CloudLoggingConfig;
}

export declare class BTPCloudLoggingTransport {
	constructor(options: { cloudLogger: CloudLoggingService });
	log(info: any, callback: Function): void;
}

export declare function createLogger(config?: CloudLoggingConfig): CloudLoggingService;
export declare function middleware(logger: CloudLoggingService, options?: MiddlewareOptions): Function;
// ─── Logger (console fallback) ────────────────────────────────────────────

export interface ConsoleLogger {
	info(message: string, metadata?: object): void;
	error(message: string, metadata?: object): void;
	warn(message: string, metadata?: object): void;
	debug(message: string, metadata?: object): void;
}

export declare const Logger: ConsoleLogger;
export declare function sanitize(obj: any, depth?: number): any;

// ─── LogUtils (domain logger) ─────────────────────────────────────────────

export type LogLevel = 'info' | 'error' | 'warn' | 'debug';

export interface LogApiOptions {
	source?: string;
	endpoint?: string;
	method?: string;
	statusCode?: number;
	sourceSystem?: string;
	correlationId?: string;
	duration?: number;
	includePayload?: boolean;
	payload?: any;
	includeResponse?: boolean;
	response?: any;
}

export interface LogEventOptions {
	eventName?: string;
	eventId?: string;
	eventSource?: string;
	eventType?: string;
	entityId?: string;
	entityType?: string;
	userId?: string;
	includeData?: boolean;
	data?: any;
}

export interface LogBaseOptions {
	component?: string;
	action?: string;
	module?: string;
	custom?: Record<string, any>;
}

export declare class LogUtils {
	constructor();
	log(level: LogLevel, message: string, metadata?: object): void;
	info(message: string, metadata?: object): void;
	error(message: string, errorOrMeta?: Error | object, metadata?: object): void;
	warn(message: string, metadata?: object): void;
	debug(message: string, metadata?: object): void;
	setLoggingLevel(level: string): void;
	logApi(level: LogLevel, message: string, options?: LogApiOptions): void;
	apiInfo(message: string, options?: LogApiOptions): void;
	apiError(message: string, error: Error, options?: LogApiOptions): void;
	logEvent(level: LogLevel, message: string, options?: LogEventOptions): void;
	eventInfo(message: string, options?: LogEventOptions): void;
	eventError(message: string, error: Error, options?: LogEventOptions): void;
	logBase(level: LogLevel, message: string, options?: LogBaseOptions): void;
	baseInfo(message: string, options?: LogBaseOptions): void;
	baseError(message: string, error: Error, options?: LogBaseOptions): void;
}

export declare const logUtils: LogUtils;
export declare function createLogUtils(): LogUtils;
