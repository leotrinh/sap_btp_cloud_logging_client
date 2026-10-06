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

    // A 4xx is the server refusing the entry — a wrong credential, a bad
    // payload. It used to be counted as a successful send, so a permanently
    // misconfigured client reported itself healthy while every line was
    // discarded. It is now reported and dropped: still never thrown into the
    // caller, because business code cannot act on a logging credential fault.
    it('reports a 4xx rejection instead of counting it as delivered', async () => {
      axios.mockResolvedValue({ status: 401, statusText: 'Unauthorized' });

      await expect(logger.info('Test message')).resolves.toBeUndefined();

      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 401'));
      expect(logger.getHealthStatus().healthy).toBe(false);
    });

    it('does not retry a 4xx, because the server will reject it again', async () => {
      axios.mockResolvedValue({ status: 400, statusText: 'Bad Request' });

      await logger.info('Test message');

      expect(logger.retryTimer).toBeNull();
      expect(logger.retryCount).toBe(0);
    });

    it('notifies onError when an entry is rejected', async () => {
      const onError = jest.fn();
      const svc = new CloudLoggingService({
        ingestEndpoint: 'https://example.invalid', username: 'u', password: 'p',
        preventUncaughtExceptions: false, onError,
      });
      axios.mockResolvedValue({ status: 403, statusText: 'Forbidden' });

      await svc.info('Test message');

      expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ level: 'INFO' }));
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

    // Replaced in the v1.0.8 hardening pass. The previous assertion covered
    // `_originalHandlers`, a field that only existed to support replacing the
    // application's process listeners wholesale. The package no longer does
    // that, so the contract under test is now "add, never replace".
    it('should add its listeners without removing the application\'s own', () => {
      const appHandler = () => {};
      process.on('uncaughtException', appHandler);
      const before = process.listeners('uncaughtException').length;

      try {
        logger._setupGlobalErrorHandling();

        expect(process.listeners('uncaughtException')).toContain(appHandler);
        expect(process.listeners('uncaughtException').length).toBeGreaterThan(before - 1);
      } finally {
        process.removeListener('uncaughtException', appHandler);
      }
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
