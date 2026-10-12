// winston is an optional peer dependency from 2.0.0 — install it yourself:
//   npm install winston
// The package never loads it unless you access WinstonTransport.
const winston = require('winston');
const { createLogger, WinstonTransport } = require('sap-btp-cloud-logging-client');

// Create BTP Cloud Logger
const btpLogger = createLogger({
  ingestEndpoint: process.env.BTP_LOGGING_INGEST_ENDPOINT,
  username: process.env.BTP_LOGGING_USERNAME,
  password: process.env.BTP_LOGGING_PASSWORD,
  applicationName: 'winston-app'
});

// Create Winston logger with BTP transport
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new WinstonTransport({ cloudLogger: btpLogger })
  ]
});

// Usage
logger.info('Winston integration test', { service: 'auth', userId: 'user123' });
logger.error('Winston error test', { service: 'payment', error: 'Payment failed' });