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
	message: string;
	application: string;
	environment: string;
	subaccount: string;
	hostname: string;
	pid: number;
	correlationId?: string;
	stack?: string;
	request?: RequestInfo;
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