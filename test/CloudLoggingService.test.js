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
      enableRetry: false, // Disable retry for most tests to avoid complexity with timers
    };

    logger = new CloudLoggingService(mockConfig);
    // LEO-FIX: Clear the mock on the main axios function, not axios.post
    mockedAxios.mockClear();
  });

  describe('Constructor', () => {
    // LEO-FIX: This test now provides the required environment variables 
    // to properly test initialization from default values.
    it('should initialize with default config when env vars are set', () => {
      process.env.BTP_LOGGING_INGEST_ENDPOINT = 'http://dummy-endpoint.com';
      process.env.BTP_LOGGING_USERNAME = 'dummy';
      process.env.BTP_LOGGING_PASSWORD = 'dummy';

      const defaultLogger = new CloudLoggingService();
      expect(defaultLogger.config).toBeDefined();
      expect(defaultLogger.config.ingestEndpoint).toBe('http://dummy-endpoint.com');

      // Cleanup env variables
      delete process.env.BTP_LOGGING_INGEST_ENDPOINT;
      delete process.env.BTP_LOGGING_USERNAME;
      delete process.env.BTP_LOGGING_PASSWORD;
    });

    it('should merge user config with defaults', () => {
      expect(logger.config.applicationName).toBe('test-app');
      expect(logger.config.maxRetries).toBe(3); // default value
    });
  });

  describe('Basic Logging', () => {
    it('should send INFO log successfully', async () => {
      // LEO-FIX: Mock the main axios function to resolve
      mockedAxios.mockResolvedValue({ status: 200 });

      await logger.info('Test message', { userId: 'user123' });

      // LEO-FIX: Expect the main axios function to be called with a single config object
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: mockConfig.ingestEndpoint,
          data: expect.objectContaining({
            level: 'INFO',
            message: 'Test message',
            application: 'test-app',
            userId: 'user123'
          }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': expect.stringContaining('Basic')
          })
        })
      );
    });

    it('should send ERROR log successfully', async () => {
      mockedAxios.mockResolvedValue({ status: 200 });

      await logger.error('Error message', { errorCode: 'E001' });

      // LEO-FIX: Expect the main axios function to be called
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            level: 'ERROR',
            message: 'Error message',
            errorCode: 'E001'
          })
        })
      );
    });
  });

  describe('Batch Logging', () => {
    // LEO-NOTE: This test was already passing but I am updating the mock style for consistency.
    it('should send batch logs successfully', async () => {
      // Your implementation uses axios.post for batches, so this mock is correct.
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const entries = [
        { level: 'INFO', message: 'Message 1', metadata: { batch: 1 } },
        { level: 'WARN', message: 'Message 2', metadata: { batch: 2 } }
      ];

      await logger.logBatch(entries);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        mockConfig.ingestEndpoint,
        expect.arrayContaining([
          expect.objectContaining({ level: 'INFO', message: 'Message 1' }),
          expect.objectContaining({ level: 'WARN', message: 'Message 2' })
        ]),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      // LEO-FIX: Reject the main axios function call
      mockedAxios.mockRejectedValue(new Error('Network error'));

      await logger.info('Test message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Cloud Logging failed:',
        'Network error'
      );
      expect(logger.isHealthy).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('should retry on failure when retry is enabled', async () => {
      jest.useFakeTimers();
      const retryLogger = new CloudLoggingService({
        ...mockConfig,
        enableRetry: true,
        maxRetries: 2,
      });

      // LEO-FIX: Reject the main axios call to trigger the retry logic
      mockedAxios.mockRejectedValue(new Error('Temporary failure'));

      await retryLogger.info('Test message');

      // The first call fails and increases the count
      expect(retryLogger.retryCount).toBe(1);

      // Fast-forward time to trigger the retry
      jest.advanceTimersByTime(2000);
      // LEO-FIX: Add this line to clear the pending setTimeout
      jest.clearAllTimers();
      jest.useRealTimers();
    });
  });

  // LEO-NOTE: No changes were needed below this line as these tests were already passing.

  describe('Health Check', () => {
    it('should return health status', () => {
      const health = logger.getHealthStatus();

      expect(health).toEqual({
        healthy: true,
        retryCount: 0,
        maxRetries: 3,
        endpoint: mockConfig.ingestEndpoint
      });
    });
  });
});

describe('ConfigManager', () => {
  describe('Default Config', () => {
    it('should return default configuration', () => {
      const config = ConfigManager.getDefaultConfig();
      expect(config).toHaveProperty('authType', 'basic');
      expect(config).toHaveProperty('maxRetries', 3);
      expect(config).toHaveProperty('timeout', 5000);
    });
  });

  describe('Config Validation', () => {
    it('should throw error for missing ingest endpoint', () => {
      expect(() => {
        ConfigManager.validateConfig({});
      }).toThrow('BTP_LOGGING_INGEST_ENDPOINT is required');
    });

    it('should throw error for missing basic auth credentials', () => {
      expect(() => {
        ConfigManager.validateConfig({
          ingestEndpoint: 'https://test.com',
          authType: 'basic'
        });
      }).toThrow('Username and password are required for basic authentication');
    });

    it('should throw error for missing mTLS credentials', () => {
      expect(() => {
        ConfigManager.validateConfig({
          ingestEndpoint: 'https://test.com',
          authType: 'mtls'
        });
      }).toThrow('Client certificate and key are required for mTLS authentication');
    });
  });

  describe('Service Key Conversion', () => {
    it('should convert service key to config', () => {
      const serviceKey = {
        'ingest-endpoint': 'ingest-test.com',
        'ingest-username': 'test-user',
        'ingest-password': 'test-pass',
        'dashboards-endpoint': 'dashboard-test.com',
        'ingest-mtls-cert': 'cert-data',
        'ingest-mtls-key': 'key-data',
        'server-ca': 'ca-data'
      };

      const config = ConfigManager.fromServiceKey(serviceKey);

      expect(config).toEqual({
        ingestEndpoint: 'https://ingest-test.com',
        dashboardEndpoint: 'https://dashboard-test.com',
        authType: 'basic',
        username: 'test-user',
        password: 'test-pass',
        clientCert: 'cert-data',
        clientKey: 'key-data',
        serverCa: 'ca-data'
      });
    });
  });
});