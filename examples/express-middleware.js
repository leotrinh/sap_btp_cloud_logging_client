const express = require('express');
const { createLogger, middleware } = require('sap-btp-cloud-logging-client');

const app = express();
const logger = createLogger({
  ingestEndpoint: process.env.BTP_LOGGING_INGEST_ENDPOINT,
  username: process.env.BTP_LOGGING_USERNAME,
  password: process.env.BTP_LOGGING_PASSWORD,
  applicationName: 'express-app'
});

// Use logging middleware
app.use(middleware(logger, {
  correlationIdHeader: 'x-correlation-id',
  excludePaths: ['/health', '/metrics']
}));

app.get('/', async (req, res) => {
  await logger.info('Home page accessed', {
    correlationId: req.get('x-correlation-id'),
    userAgent: req.get('user-agent')
  });
  
  res.json({ message: 'Hello World' });
});

app.get('/error', async (req, res) => {
  try {
    throw new Error('Test error');
  } catch (error) {
    await logger.error('Test error occurred', {
      correlationId: req.get('x-correlation-id'),
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(3000, () => {
  logger.info('Server started on port 3000');
});