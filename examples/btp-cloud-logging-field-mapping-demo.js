// Demo script to test BTP Cloud Logging field mapping
const { createLogger } = require('../index');

async function demoSAPFieldMapping() {
  console.log('=== BTP Cloud Logging Field Mapping Demo ===\n');

  // Test with BTP Cloud Logging enabled (default)
  console.log('1. Testing with BTP Cloud Logging ENABLED (default):');
  const loggerWithMapping = createLogger({
    applicationName: 'LEO_APP',
    environment: 'development',
    subAccountId: 'Leo Test System',
    enableSAPFieldMapping: true // This is the default
  });

  const mappedLog = loggerWithMapping.formatter.format('INFO', '[CacheService] Initialized cache adapter: memory', {
    userId: '12345',
    component: 'cache'
  });

  console.log('Mapped log structure:');
  console.log(JSON.stringify(mappedLog, null, 2));
  console.log('\nKey SAP fields added:');
  console.log(`- msg: ${mappedLog.msg}`);
  console.log(`- app_name: ${mappedLog.app_name}`);
  console.log(`- organization_name: ${mappedLog.organization_name}`);
  console.log(`- Original fields preserved: message="${mappedLog.message}", application="${mappedLog.application}", subaccount="${mappedLog.subaccount}"\n`);

  // Test with BTP Cloud Logging disabled
  console.log('2. Testing with BTP Cloud Logging DISABLED:');
  const loggerWithoutMapping = createLogger({
    applicationName: 'LEO_APP',
    environment: 'development',
    subAccountId: 'Leo Test System',
    enableSAPFieldMapping: false
  });

  const unmappedLog = loggerWithoutMapping.formatter.format('INFO', '[CacheService] Initialized cache adapter: memory', {
    userId: '12345',
    component: 'cache'
  });

  console.log('Unmapped log structure:');
  console.log(JSON.stringify(unmappedLog, null, 2));
  console.log('\nSAP fields status:');
  console.log(`- msg: ${unmappedLog.msg} (still added for compatibility)`);
  console.log(`- app_name: ${unmappedLog.app_name || 'NOT ADDED'}`);
  console.log(`- organization_name: ${unmappedLog.organization_name || 'NOT ADDED'}\n`);

  // Test with existing SAP fields in metadata
  console.log('3. Testing with existing SAP fields in metadata (should preserve):');
  const logWithExistingFields = loggerWithMapping.formatter.format('INFO', 'Test message', {
    msg: 'custom msg from metadata',
    app_name: 'custom app from metadata',
    organization_name: 'custom org from metadata'
  });

  console.log('Log with existing SAP fields:');
  console.log(JSON.stringify(logWithExistingFields, null, 2));
  console.log('\nPreserved custom SAP fields:');
  console.log(`- msg: ${logWithExistingFields.msg}`);
  console.log(`- app_name: ${logWithExistingFields.app_name}`);
  console.log(`- organization_name: ${logWithExistingFields.organization_name}\n`);

  console.log('=== Demo completed ===');
  console.log('\nBenefits:');
  console.log('✅ No breaking changes - existing API usage unchanged');
  console.log('✅BTP Cloud Logging support - can filter on msg, app_name, organization_name');
  console.log('✅ Backward compatible - both old and new field names present');
  console.log('✅ Configurable - can disable mapping if needed');
  console.log('✅ Preserves custom metadata - existing SAP fields in metadata take priority');
}

// Run demo
demoSAPFieldMapping().catch(console.error);
