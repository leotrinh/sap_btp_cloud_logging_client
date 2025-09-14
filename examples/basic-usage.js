const { createLogger } = require('sap-btp-cloud-logging-client');
// Simple with .env config 
const logger  = createLogger();
// Logger with config
const loggerWithConfig = createLogger({
  ingestEndpoint: 'https://ingest-sf-xxx.cls-16.cloud.logs.services.eu10.hana.ondemand.com',
  username: 'your-username',
  password: 'your-password',
  applicationName: 'my-app',
  subaccountId: 'subaccount-b',
  environment: 'production'
});

// Basic logging
async function basicUsage() {
  try {
    await logger.info('Application started');
    await logger.warn('This is a warning', { userId: 'user123' });
    await logger.error('An error occurred', { 
      errorCode: 'E001',
      stack: new Error().stack 
    });
  } catch (error) {
    console.error('Logging failed:', error);
  }
}

basicUsage();