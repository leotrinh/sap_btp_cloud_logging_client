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
        msg: 'Test message', // Only msg field after mapping
        environment: 'test',
        hostname: expect.any(String),
        pid: expect.any(Number),
        timestamp: expect.any(String),
        app_name: 'TestApp', // BTP mapped field
        organization_name: 'test-subaccount' // BTP mapped field
      });
      
      // Original fields should be removed by default
      expect(result).not.toHaveProperty('message');
      expect(result).not.toHaveProperty('application');
      expect(result).not.toHaveProperty('subaccount');
    });

    describe('BTP Cloud Logging field mapping', () => {
      it('should apply BTP field mapping when enabled', () => {
        const result = formatter.format('INFO', 'Test message');

        expect(result).toHaveProperty('msg', 'Test message');
        expect(result).toHaveProperty('app_name', 'TestApp');
        expect(result).toHaveProperty('organization_name', 'test-subaccount');
      });

      it('should not apply BTP field mapping when disabled', () => {
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
        expect(result).toHaveProperty('app_name', 'TestApp'); // BTP mapping still applied
        expect(result).not.toHaveProperty('message'); // Original field removed
        expect(result).not.toHaveProperty('application'); // Original field removed
        expect(result).not.toHaveProperty('subaccount'); // Original field removed
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

        expect(result.msg).toBe('{"key":"value","number":123}');
        expect(result).not.toHaveProperty('message'); // Original field removed
      });

      it('should handle undefined configuration values gracefully', () => {
        const minimalFormatter = new LogFormatter({});
        const result = minimalFormatter.format('INFO', 'Test message');

        expect(result.environment).toBe('unknown');
        expect(result.msg).toBe('Test message');
        expect(result).not.toHaveProperty('message'); // Original field removed
        expect(result).not.toHaveProperty('application'); // Original field removed
        expect(result).not.toHaveProperty('subaccount'); // Original field removed
      });

      it('should not overwrite existing BTP fields in metadata', () => {
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
        
        // Original fields should still be removed
        expect(result).not.toHaveProperty('message');
        expect(result).not.toHaveProperty('application');
        expect(result).not.toHaveProperty('subaccount');
      });
    }); // end describe('BTP Cloud Logging field mapping')
  }); // end describe('format')

  describe('_applyCloudLoggingFieldMapping', () => {
    it('should map fields correctly when they exist', () => {
      const logEntry = {
        message: 'test message',
        application: 'test app',
        subaccount: 'test subaccount'
      };

      formatter._applyCloudLoggingFieldMapping(logEntry);

      expect(logEntry.msg).toBe('test message');
      expect(logEntry.app_name).toBe('test app');
      expect(logEntry.organization_name).toBe('test subaccount');
    });

    it('should not overwrite existing BTP fields', () => {
      const logEntry = {
        message: 'test message',
        msg: 'existing msg',
        application: 'test app',
        app_name: 'existing app'
      };

      formatter._applyCloudLoggingFieldMapping(logEntry);

      expect(logEntry.msg).toBe('existing msg');
      expect(logEntry.app_name).toBe('existing app');
    });
  }); // end describe('_applyCloudLoggingFieldMapping')

  describe('removeOriginalFieldsAfterMapping', () => {
    it('should remove original fields after mapping by default', () => {
      const result = formatter.format('INFO', 'Test message');
      
      // Should have new BTP fields
      expect(result).toHaveProperty('msg', 'Test message');
      expect(result).toHaveProperty('app_name', 'TestApp');
      expect(result).toHaveProperty('organization_name', 'test-subaccount');
      
      // Should NOT have original fields (removed by default)
      expect(result).not.toHaveProperty('message');
      expect(result).not.toHaveProperty('application');
      expect(result).not.toHaveProperty('subaccount');
    });

    it('should keep original fields when removeOriginalFieldsAfterMapping is false', () => {
      const keepOriginalFormatter = new LogFormatter({
        applicationName: 'TestApp',
        environment: 'test',
        subAccountId: 'test-subaccount',
        enableSAPFieldMapping: true,
        removeOriginalFieldsAfterMapping: false
      });

      const result = keepOriginalFormatter.format('INFO', 'Test message');
      
      // Should have both original and new fields
      expect(result).toHaveProperty('message', 'Test message');
      expect(result).toHaveProperty('msg', 'Test message');
      expect(result).toHaveProperty('application', 'TestApp');
      expect(result).toHaveProperty('app_name', 'TestApp');
      expect(result).toHaveProperty('subaccount', 'test-subaccount');
      expect(result).toHaveProperty('organization_name', 'test-subaccount');
    });

    it('should not remove fields when SAP field mapping is disabled', () => {
      const disabledFormatter = new LogFormatter({
        applicationName: 'TestApp',
        environment: 'test',
        subAccountId: 'test-subaccount',
        enableSAPFieldMapping: false
      });

      const result = disabledFormatter.format('INFO', 'Test message');
      
      // Should have original fields (mapping disabled)
      expect(result).toHaveProperty('message', 'Test message');
      expect(result).toHaveProperty('application', 'TestApp');
      expect(result).toHaveProperty('subaccount', 'test-subaccount');
      
      // Should NOT have new BTP fields (mapping disabled)
      expect(result).not.toHaveProperty('app_name');
      expect(result).not.toHaveProperty('organization_name');
      expect(result).toHaveProperty('msg'); // msg is still added for compatibility
    });
  });

  describe('Edge Cases', () => {
    it('should handle metadata with BTP fields correctly - metadata should take precedence', () => {
      const metadata = {
        msg: 'user_msg',
        app_name: 'user_app', 
        organization_name: 'user_org',
        customField: 'custom_value'
      };

      const result = formatter.format('INFO', 'Test message', metadata);
      
      // User metadata should take precedence over auto-mapped values
      expect(result.msg).toBe('user_msg'); // Should NOT be overwritten
      expect(result.app_name).toBe('user_app'); // Should NOT be overwritten
      expect(result.organization_name).toBe('user_org'); // Should NOT be overwritten
      expect(result.customField).toBe('custom_value');
      
      // Original fields should still be removed
      expect(result).not.toHaveProperty('message');
      expect(result).not.toHaveProperty('application');
      expect(result).not.toHaveProperty('subaccount');
    });

    it('should handle null/undefined values in metadata gracefully', () => {
      const metadata = {
        app_name: undefined,
        correlationId: '',
        customField: null
      };

      const result = formatter.format('INFO', 'Test message', metadata);
      
      // msg should always be set from message parameter, not from metadata
      expect(result.msg).toBe('Test message');
      // app_name should be set from config when metadata provides undefined
      expect(result.app_name).toBe('TestApp');
      expect(result.correlationId).toBe('');
      expect(result.customField).toBeNull();
      
      // Should still have mapped fields from config when metadata doesn't provide them
      expect(result).toHaveProperty('organization_name', 'test-subaccount');
    });

    it('should handle empty string config values correctly', () => {
      const emptyConfigFormatter = new LogFormatter({
        applicationName: '',
        environment: '',
        subAccountId: '',
        enableSAPFieldMapping: true
      });

      const result = emptyConfigFormatter.format('INFO', 'Test message');
      
      // Empty strings should fallback to 'unknown' per current logic
      expect(result.app_name).toBe('unknown');
      expect(result.environment).toBe('unknown');
      expect(result.organization_name).toBe('unknown');
      expect(result.msg).toBe('Test message');
    });

    it('should handle metadata with conflicting original and BTP fields', () => {
      const metadata = {
        message: 'metadata_message',
        application: 'metadata_app',
        subaccount: 'metadata_subaccount',
        msg: 'metadata_msg',
        app_name: 'metadata_app_name',
        organization_name: 'metadata_org'
      };

      const result = formatter.format('INFO', 'Test message', metadata);
      
      // Metadata should take precedence for both original and BTP fields
      expect(result.msg).toBe('metadata_msg');
      expect(result.app_name).toBe('metadata_app_name');
      expect(result.organization_name).toBe('metadata_org');
      
      // Original fields should be removed even if they came from metadata
      expect(result).not.toHaveProperty('message');
      expect(result).not.toHaveProperty('application');
      expect(result).not.toHaveProperty('subaccount');
    });

    it('should handle circular object references in metadata', () => {
      const circularMetadata = { customField: 'value' };
      circularMetadata.self = circularMetadata; // Create circular reference

      // Should not throw error or cause infinite loop
      expect(() => {
        const result = formatter.format('INFO', 'Test message', circularMetadata);
        expect(result.customField).toBe('value');
        expect(result).toHaveProperty('self'); // Circular reference preserved
      }).not.toThrow();
    });

    it('should handle very long field names and values', () => {
      const longString = 'a'.repeat(10000);
      const metadata = {
        [`very_long_field_name_${longString}`]: longString,
        msg: longString
      };

      const result = formatter.format('INFO', 'Test message', metadata);
      
      expect(result.msg).toBe(longString);
      expect(result[`very_long_field_name_${longString}`]).toBe(longString);
    });

    it('should not remove original fields when SAP mapping is disabled, even if removeOriginalFieldsAfterMapping is true', () => {
      const disabledMappingFormatter = new LogFormatter({
        applicationName: 'TestApp',
        environment: 'test',
        subAccountId: 'test-subaccount',
        enableSAPFieldMapping: false, // Disabled
        removeOriginalFieldsAfterMapping: true // But this should not affect when mapping is disabled
      });

      const result = disabledMappingFormatter.format('INFO', 'Test message');
      
      // Should have original fields (mapping disabled)
      expect(result).toHaveProperty('message', 'Test message');
      expect(result).toHaveProperty('application', 'TestApp');
      expect(result).toHaveProperty('subaccount', 'test-subaccount');
      
      // Should NOT have new BTP fields (mapping disabled)
      expect(result).not.toHaveProperty('app_name');
      expect(result).not.toHaveProperty('organization_name');
      expect(result).toHaveProperty('msg'); // msg is still added for compatibility
    });
  });
}); // end describe('LogFormatter')