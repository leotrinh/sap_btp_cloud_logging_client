/* eslint-disable no-console */
const CloudLoggingService = require('../lib/CloudLoggingService');
const axios = require('axios');

// Mock axios to simulate network errors
jest.mock('axios');

describe('Network Error Handling', () => {
  let logger;
  let originalConsoleError;
  let originalProcessHandlers;

  // eslint-disable-next-line no-console
  beforeEach(() => {
    // Mock console.error to capture error messages
    originalConsoleError = console.error;
    console.error = jest.fn(); // eslint-disable-line no-console
    
    // Store original process handlers
    originalProcessHandlers = {
      uncaughtException: process.listeners('uncaughtException'),
      unhandledRejection: process.listeners('unhandledRejection')
    };

    logger = new CloudLoggingService({
      ingestEndpoint: 'https://test-endpoint.com',
      username: 'test-user',
      password: 'test-pass',
      preventUncaughtExceptions: true
    });
  });

  afterEach(() => {
    // Restore console.error
    // eslint-disable-next-line no-console
    console.error = originalConsoleError;
    
    // Restore process handlers
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    originalProcessHandlers.uncaughtException.forEach(handler => {
      process.on('uncaughtException', handler);
    });
    originalProcessHandlers.unhandledRejection.forEach(handler => {
      process.on('unhandledRejection', handler);
    });
  });

  describe('Transport Layer Error Handling', () => {
    it('should handle ECONNRESET errors gracefully', async () => {
      const connResetError = new Error('Connection reset');
      connResetError.code = 'ECONNRESET';
      axios.mockRejectedValue(connResetError);

      // Should not throw uncaught exception
      await expect(logger.info('Test message')).rejects.toThrow('Cloud Logging connection failed: ECONNRESET');
    });

    it('should handle ECONNREFUSED errors gracefully', async () => {
      const connRefusedError = new Error('Connection refused');
      connRefusedError.code = 'ECONNREFUSED';
      axios.mockRejectedValue(connRefusedError);

      await expect(logger.info('Test message')).rejects.toThrow('Cloud Logging connection failed: ECONNREFUSED');
    });

    it('should handle ENOTFOUND errors gracefully', async () => {
      const notFoundError = new Error('DNS lookup failed');
      notFoundError.code = 'ENOTFOUND';
      axios.mockRejectedValue(notFoundError);

      await expect(logger.info('Test message')).rejects.toThrow('Cloud Logging connection failed: ENOTFOUND');
    });

    it('should handle ETIMEDOUT errors gracefully', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ETIMEDOUT';
      axios.mockRejectedValue(timeoutError);

      await expect(logger.info('Test message')).rejects.toThrow('Cloud Logging connection failed: ETIMEDOUT');
    });

    it('should handle 4xx HTTP errors gracefully', async () => {
      axios.mockResolvedValue({
        status: 401,
        statusText: 'Unauthorized'
      });

      // Should not throw for 4xx errors
      await expect(logger.info('Test message')).resolves.toBeUndefined();
      // eslint-disable-next-line no-console
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle 5xx HTTP errors with proper exception', async () => {
      axios.mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(logger.info('Test message')).rejects.toThrow('HTTP 500: Internal Server Error');
    });
  });

  describe('Global Error Handling', () => {
    it('should prevent uncaught exceptions from Cloud Logging errors', (done) => {
      const cloudLoggingError = new Error('Cloud Logging connection failed');
      cloudLoggingError.code = 'ECONNRESET';

      // Simulate uncaught exception
      setTimeout(() => {
        // This should be caught by our error handler
        throw cloudLoggingError;
      }, 10);

      // If the error is handled properly, the test should complete without crashing
      setTimeout(() => {
        // eslint-disable-next-line no-console
        expect(console.error).toHaveBeenCalledWith(
          'Cloud Logging Error (handled):',
          'Cloud Logging connection failed'
        );
        done();
      }, 50);
    });

    it('should prevent unhandled promise rejections from Cloud Logging', (done) => {
      const rejectionError = new Error('Cloud Logging promise failed');

      // Simulate unhandled promise rejection
      setTimeout(() => {
        Promise.reject(rejectionError);
      }, 10);

      // If the rejection is handled properly, the test should complete
      setTimeout(() => {
        // eslint-disable-next-line no-console
        expect(console.error).toHaveBeenCalledWith(
          'Cloud Logging Promise Rejection (handled):',
          'Cloud Logging promise failed'
        );
        done();
      }, 50);
    });

    it('should not interfere with non-Cloud Logging errors', (done) => {
      const nonCloudLoggingError = new Error('Some other error');

      // Remove our handler temporarily for this test
      process.removeAllListeners('uncaughtException');

      // Add a test handler that will catch the error
      process.on('uncaughtException', (error) => {
        // eslint-disable-next-line no-console
        expect(error.message).toBe('Some other error');
        done();
      });

      // Re-setup our handler
      logger._setupGlobalErrorHandling();

      // Simulate non-Cloud Logging error
      setTimeout(() => {
        throw nonCloudLoggingError;
      }, 10);
    });
  });

  describe('Fallback Behavior', () => {
    it('should fallback to console when enabled', async () => {
      const networkError = new Error('Network error');
      networkError.code = 'ECONNRESET';
      axios.mockRejectedValue(networkError);

      const fallbackLogger = new CloudLoggingService({
        ingestEndpoint: 'https://test-endpoint.com',
        username: 'test-user',
        password: 'test-pass',
        fallbackToConsole: true,
        enableRetry: false // Disable retry for faster test
      });

      await fallbackLogger.info('Test message');

      // eslint-disable-next-line no-console
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Cloud Logging failed:'),
        expect.objectContaining({
          level: 'INFO',
          message: 'Test message'
        })
      );
    });
  });
});
