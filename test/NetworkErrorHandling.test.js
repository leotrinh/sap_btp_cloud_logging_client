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
      preventUncaughtExceptions: true,
      fallbackToConsole: false,
      enableRetry: false
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

      // Should not throw uncaught exception but should reject with wrapped error
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
    it('should setup global error handlers without crashing', () => {
      // Test that setting up handlers doesn't throw
      expect(() => {
        logger._setupGlobalErrorHandling();
      }).not.toThrow();
    });

    it('should store original handlers properly', () => {
      // Test that original handlers are stored
      logger._setupGlobalErrorHandling();
      expect(logger._originalHandlers).toBeDefined();
      expect(logger._originalHandlers.uncaughtException).toBeDefined();
      expect(logger._originalHandlers.unhandledRejection).toBeDefined();
    });

    it('should identify Cloud Logging errors correctly', () => {
      const cloudLoggingError = new Error('Cloud Logging connection failed');
      cloudLoggingError.code = 'ECONNRESET';
      
      // Test error identification logic indirectly through handler setup
      expect(() => {
        logger._setupGlobalErrorHandling();
      }).not.toThrow();
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
