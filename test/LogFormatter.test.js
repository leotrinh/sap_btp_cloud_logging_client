const LogFormatter = require('../lib/LogFormatter');

describe('LogFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new LogFormatter({
      applicationName: 'TestApp',
      environment: 'test',
      subAccountId: 'test-subaccount',
      enableSAPFieldMapping: true
    });
  });

  describe('format', () => {
    it('should format basic log entry with all required fields', () => {
      const result = formatter.format('INFO', 'Test message');
      
      expect(result).toMatchObject({
        level: 'INFO',
        message: 'Test message',
        msg: 'Test message',
        application: 'TestApp',
        environment: 'test',
        subaccount: 'test-subaccount',
        hostname: expect.any(String),
        pid: expect.any(Number),
        timestamp: expect.any(String)
      });
    });

    it('should apply BTP Cloud Logging when enabled', () => {
      const result = formatter.format('INFO', 'Test message');
      
      expect(result).toHaveProperty('msg', 'Test message');
      expect(result).toHaveProperty('app_name', 'TestApp');
      expect(result).toHaveProperty('organization_name', 'test-subaccount');
    });

    it('should not apply BTP Cloud Logging when disabled', () => {
      const disabledFormatter = new LogFormatter({
        applicationName: 'TestApp',
        environment: 'test',
        subAccountId: 'test-subaccount',
        enableSAPFieldMapping: false
      });

      const result = disabledFormatter.format('INFO', 'Test message');
      
      expect(result).toHaveProperty('msg', 'Test message'); // Still added for compatibility
      expect(result).not.toHaveProperty('app_name');
      expect(result).not.toHaveProperty('organization_name');
    });

    it('should preserve custom metadata fields', () => {
      const metadata = {
        userId: '123',
        action: 'login',
        customField: 'custom value'
      };

      const result = formatter.format('INFO', 'Test message', metadata);
      
      expect(result).toMatchObject(metadata);
      expect(result).toHaveProperty('app_name', 'TestApp'); // SAP mapping still applied
    });

    it('should handle correlation ID correctly', () => {
      const metadata = { correlationId: 'corr-123' };
      const result = formatter.format('INFO', 'Test message', metadata);
      
      expect(result.correlationId).toBe('corr-123');
    });

    it('should handle request ID as correlation ID fallback', () => {
      const metadata = { requestId: 'req-123' };
      const result = formatter.format('INFO', 'Test message', metadata);
      
      expect(result.correlationId).toBe('req-123');
    });

    it('should prioritize correlation ID over request ID', () => {
      const metadata = { 
        correlationId: 'corr-123',
        requestId: 'req-456'
      };
      const result = formatter.format('INFO', 'Test message', metadata);
      
      expect(result.correlationId).toBe('corr-123');
    });

    it('should add stack trace for ERROR level when enabled', () => {
      const errorFormatter = new LogFormatter({
        applicationName: 'TestApp',
        environment: 'test',
        subAccountId: 'test-subaccount',
        includeStackTrace: true
      });

      const result = errorFormatter.format('ERROR', 'Error message');
      
      expect(result).toHaveProperty('stack');
      expect(result.stack).toContain('at LogFormatter._getStackTrace');
    });

    it('should format object messages as JSON', () => {
      const objectMessage = { key: 'value', number: 123 };
      const result = formatter.format('INFO', objectMessage);
      
      expect(result.message).toBe('{"key":"value","number":123}');
      expect(result.msg).toBe('{"key":"value","number":123}');
    });

    it('should handle undefined configuration values gracefully', () => {
      const minimalFormatter = new LogFormatter({});
      const result = minimalFormatter.format('INFO', 'Test message');
      
      expect(result.application).toBe('unknown');
      expect(result.environment).toBe('unknown');
      expect(result.subaccount).toBe('unknown');
    });

    it('should not overwrite existing SAP fields in metadata', () => {
      const metadata = {
        msg: 'existing msg',
        app_name: 'existing app',
        organization_name: 'existing org'
      };

      const result = formatter.format('INFO', 'Test message', metadata);
      
      // Should preserve existing values from metadata
      expect(result.msg).toBe('existing msg');
      expect(result.app_name).toBe('existing app');
      expect(result.organization_name).toBe('existing org');
    });
  });

  describe('_applySAPFieldMapping', () => {
    it('should map fields correctly when they exist', () => {
      const logEntry = {
        message: 'test message',
        application: 'test app',
        subaccount: 'test subaccount'
      };

      formatter._applySAPFieldMapping(logEntry);

      expect(logEntry.msg).toBe('test message');
      expect(logEntry.app_name).toBe('test app');
      expect(logEntry.organization_name).toBe('test subaccount');
    });

    it('should not overwrite existing SAP fields', () => {
      const logEntry = {
        message: 'test message',
        msg: 'existing msg',
        application: 'test app',
        app_name: 'existing app'
      };

      formatter._applySAPFieldMapping(logEntry);

      expect(logEntry.msg).toBe('existing msg');
      expect(logEntry.app_name).toBe('existing app');
    });
  });
});
