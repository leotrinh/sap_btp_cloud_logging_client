const { CloudLoggingService, ConfigManager } = require('../index');
const axios = require('axios');

jest.mock('axios');
const mockedAxios = axios;

describe('CloudLoggingService', () => {
  let logger;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      ingestEndpoint: 'https://test-endpoint.com',
      username: 'test-user',
      password: 'test-pass',
      applicationName: 'test-app',
      subaccountId: 'test-subaccount',
      authType: 'basic',
      enableRetry: false,
    };

    logger = new CloudLoggingService(mockConfig);
    // Leo: Use a single mock for all axios calls for simplicity.
    mockedAxios.mockClear();
  });

  describe('Constructor', () => {
    it('should initialize with default config when env vars are set', () => {
      process.env.BTP_LOGGING_INGEST_ENDPOINT = 'http://dummy-endpoint.com';
      process.env.BTP_LOGGING_USERNAME = 'dummy';
      process.env.BTP_LOGGING_PASSWORD = 'dummy';

      const defaultLogger = new CloudLoggingService();
      expect(defaultLogger.config).toBeDefined();
      expect(defaultLogger.config.ingestEndpoint).toBe(
        'http://dummy-endpoint.com'
      );

      delete process.env.BTP_LOGGING_INGEST_ENDPOINT;
      delete process.env.BTP_LOGGING_USERNAME;
      delete process.env.BTP_LOGGING_PASSWORD;
    });

    it('should merge user config with defaults', () => {
      expect(logger.config.applicationName).toBe('test-app');
      expect(logger.config.maxRetries).toBe(3);
    });
  });

  describe('Basic Logging', () => {
    it('should send INFO log successfully', async () => {
      mockedAxios.mockResolvedValue({ status: 200 });

      await logger.info('Test message', { userId: 'user123' });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: mockConfig.ingestEndpoint,
          data: expect.objectContaining({
            level: 'INFO',
            message: 'Test message',
          }),
        })
      );
    });

    it('should send ERROR log successfully', async () => {
      mockedAxios.mockResolvedValue({ status: 200 });

      await logger.error('Error message', { errorCode: 'E001' });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            level: 'ERROR',
          }),
        })
      );
    });
  });

  describe('Batch Logging', () => {
    // Leo: Corrected the mock to use the generic axios mock and expect a single config object.
    it('should send batch logs successfully', async () => {
      mockedAxios.mockResolvedValue({ status: 200 });

      const entries = [
        { level: 'INFO', message: 'Message 1' },
        { level: 'WARN', message: 'Message 2' },
      ];

      await logger.logBatch(entries);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: mockConfig.ingestEndpoint,
          data: expect.arrayContaining([
            expect.objectContaining({ level: 'INFO', message: 'Message 1' }),
            expect.objectContaining({ level: 'WARN', message: 'Message 2' }),
          ]),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      mockedAxios.mockRejectedValue(new Error('Network error'));

      await logger.info('Test message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Cloud Logging failed: Network error. Log:',
        expect.any(Object)
      );
      expect(logger.isHealthy).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('should retry on failure when retry is enabled', async () => {
      jest.useFakeTimers();
      const retryLogger = new CloudLoggingService({ ...mockConfig, enableRetry: true });
      mockedAxios.mockRejectedValue(new Error('Temporary failure'));

      await retryLogger.info('Test message');
      expect(retryLogger.retryCount).toBe(1);

      jest.advanceTimersByTime(2000);
      jest.clearAllTimers();
      jest.useRealTimers();
    });
  });

  describe('Health Check', () => {
    // Leo: Updated the expected health status to include the new `mtlsEndpoint` property.
    it('should return health status', () => {
      const health = logger.getHealthStatus();
      expect(health).toEqual({
        healthy: true,
        retryCount: 0,
        maxRetries: 3,
        endpoint: mockConfig.ingestEndpoint,
        mtlsEndpoint: 'Not configured',
      });
    });
  });

  describe('Log Level Filtering', () => {
    it('should skip DEBUG logs when logLevel is INFO', async () => {
      mockedAxios.mockResolvedValue({ status: 200 });
      const infoLogger = new CloudLoggingService({ ...mockConfig, logLevel: 'INFO' });

      await infoLogger.debug('Debug message');
      expect(mockedAxios).not.toHaveBeenCalled();

      await infoLogger.info('Info message');
      expect(mockedAxios).toHaveBeenCalled();
    });

    it('should skip DEBUG and INFO when logLevel is WARN', async () => {
      mockedAxios.mockResolvedValue({ status: 200 });
      const warnLogger = new CloudLoggingService({ ...mockConfig, logLevel: 'WARN' });

      await warnLogger.debug('Debug message');
      await warnLogger.info('Info message');
      expect(mockedAxios).not.toHaveBeenCalled();

      await warnLogger.warn('Warn message');
      expect(mockedAxios).toHaveBeenCalled();
    });

    it('should filter batch entries based on logLevel', async () => {
      mockedAxios.mockResolvedValue({ status: 200 });
      const warnLogger = new CloudLoggingService({ ...mockConfig, logLevel: 'WARN' });

      const entries = [
        { level: 'DEBUG', message: 'Debug' },
        { level: 'INFO', message: 'Info' },
        { level: 'WARN', message: 'Warn' },
        { level: 'ERROR', message: 'Error' },
      ];

      await warnLogger.logBatch(entries);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ level: 'WARN' }),
            expect.objectContaining({ level: 'ERROR' }),
          ]),
        })
      );
    });
  });
});

describe('ConfigManager', () => {
  describe('Default Config', () => {
    it('should return default configuration', () => {
      const config = ConfigManager.getDefaultConfig();
      expect(config).toHaveProperty('authType', 'basic');
    });
  });

  describe('Config Validation', () => {
    // Leo: this test now checks for a console warning instead of an error, matching the new logic.
    it('should warn for missing ingest endpoint', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      ConfigManager.validateConfig({ authType: 'basic' });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'BTP_LOGGING_INGEST_ENDPOINT is not configured. Logging may fallback to console if enabled.'
      );
      consoleWarnSpy.mockRestore();
    });

    it('should throw error for missing basic auth credentials', () => {
      expect(() => {
        ConfigManager.validateConfig({ authType: 'basic', ingestEndpoint: 'http://a.com' });
      }).toThrow('Username and password are required for basic authentication');
    });

    it('should throw error for missing mTLS credentials', () => {
      expect(() => {
        ConfigManager.validateConfig({ authType: 'mtls' });
      }).toThrow('Client certificate and key are required for mTLS authentication');
    });
  });

  describe('Service Key Conversion', () => {
    it('should convert service key to config', () => {
      const serviceKey = {
        'ingest-endpoint': 'ingest-test.com',
        'ingest-mtls-endpoint': 'ingest-mtls-test.com',
        'ingest-username': 'test-user',
        'ingest-password': 'test-pass',
      };
      const config = ConfigManager.fromServiceKey(serviceKey);
      expect(config).toHaveProperty('authType', 'basic');
      expect(config).toHaveProperty('ingestMtlsEndpoint', 'https://ingest-mtls-test.com');
    });
  });
});