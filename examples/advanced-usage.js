const { CloudLoggingService, ConfigManager } = require('sap-btp-cloud-logging');

// Using service key
const serviceKey = {
  'ingest-endpoint': 'ingest-sf-xxx.cls-16.cloud.logs.services.eu10.hana.ondemand.com',
  'ingest-username': 'your-username',
  'ingest-password': 'your-password',
  'ingest-mtls-cert': '-----BEGIN CERTIFICATE-----...',
  'ingest-mtls-key': '-----BEGIN PRIVATE KEY-----...',
  'server-ca': '-----BEGIN CERTIFICATE-----...'
};

const config = ConfigManager.fromServiceKey(serviceKey);
const logger = new CloudLoggingService({
  ...config,
  applicationName: 'advanced-app',
  enableRetry: true,
  maxRetries: 5,
  onError: (error, context) => {
    console.error('Logging error:', error.message, context);
  }
});

// Batch logging
async function batchLogging() {
  const entries = [
    { level: 'INFO', message: 'Batch entry 1', metadata: { batch: 1 } },
    { level: 'INFO', message: 'Batch entry 2', metadata: { batch: 2 } },
    { level: 'WARN', message: 'Batch entry 3', metadata: { batch: 3 } }
  ];

  await logger.logBatch(entries);
}

// Health monitoring
setInterval(() => {
  const health = logger.getHealthStatus();
  console.log('Logger health:', health);
}, 30000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await logger.shutdown();
  process.exit(0);
});

batchLogging();