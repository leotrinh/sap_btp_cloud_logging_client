# User Guide

## Installation

```bash
npm install sap-btp-cloud-logging-client
```

## Configuration

The library is configured primarily through environment variables. These can be set directly in your deployment environment (e.g., Cloud Foundry `manifest.yml`) or loaded from a `.env` file for local development.

### Required Variables
These are typically obtained from the Service Key of your BTP Cloud Logging instance.

| Variable | Description |
|----------|-------------|
| `BTP_LOGGING_INGEST_ENDPOINT` | The URL for sending logs (e.g., `https://ingest-sf-xxx...`) |
| `BTP_LOGGING_USERNAME` | Username for basic authentication |
| `BTP_LOGGING_PASSWORD` | Password for basic authentication |

**Alternatively (v1.0.1+):**
You can provide the entire Service Key JSON as a single environment variable:
```bash
BTP_LOGGING_SRV_KEY_CRED='{"ingest-endpoint": "...", "ingest-username": "...", ...}'
```

### Optional Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `BTP_SUBACCOUNT_ID` | `PAYG_DEVELOPMENT` | Identifier for the sub-account (useful for multi-subaccount setups) |
| `BTP_APPLICATION_NAME` | `unknown-app` | Name of the application generating logs |
| `BTP_LOG_LEVEL` | `DEBUG` | Minimum log level to send (`DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`) |
| `BTP_LOGGING_MAX_RETRIES` | `3` | Number of times to retry failed log requests |
| `BTP_LOGGING_TIMEOUT` | `5000` | Timeout in milliseconds for log requests |
| `BTP_LOGGING_ENABLE_RETRY` | `true` | Whether to retry failed requests |

## Basic Usage

### JavaScript
```javascript
const { createLogger } = require('sap-btp-cloud-logging-client');

const logger = createLogger();

logger.info('Application started');
logger.error('Something went wrong', { errorId: '123' });
```

### TypeScript
```typescript
import { createLogger } from 'sap-btp-cloud-logging-client';

const logger = createLogger();

logger.info('User logged in', { userId: 'u-123' });
```

## Logger & LogUtils (v1.0.8+)

Built-in structured domain logger — no need to copy LogUtils manually to each project.

### logUtils Singleton

```js
const { logUtils } = require('sap-btp-cloud-logging-client');

// Standard
logUtils.info('msg');
logUtils.warn('msg', { extra: 'data' });
logUtils.error('msg', new Error('reason'));       // Error object extracts message+stack
logUtils.error('msg', { key: 'val' });            // or plain metadata

// API logs
logUtils.apiInfo('Request received', { source: 'WebhookSrv', endpoint: '/hook', statusCode: 200 });
logUtils.apiError('Request failed', error, { endpoint: '/hook' });

// Event logs
logUtils.eventInfo('Order.Created received', { eventType: 'WEBHOOK', entityId: 'PO-001' });
logUtils.eventError('Sync failed', error, { eventName: 'RiskScore.Changed' });

// Base/System logs
logUtils.baseInfo('Migration done', { component: 'MigrationSrv', action: 'migrate' });
logUtils.baseError('Cache flush failed', error, { component: 'CacheSrv' });
```

### Custom Instance

```js
const { LogUtils } = require('sap-btp-cloud-logging-client');
const myLogger = new LogUtils(); // fresh instance with its own BTP Cloud Logger init
```

### sanitize — Redact Sensitive Fields

```js
const { sanitize } = require('sap-btp-cloud-logging-client');

const safe = sanitize({ userId: 'u-1', password: 'secret', token: 'Bearer xyz' });
// → { userId: 'u-1', password: '[REDACTED]', token: '[REDACTED]' }
```

Redacted keys: `password`, `token`, `secret`, `authorization`, `apikey`, `api_key`,
`client_secret`, `access_token`, `refresh_token`, `cookie`, `session`, `credential`,
`private_key`, `ingest-password`, `dashboards-password`, `client-ca`, `server-ca`,
`ingest-mtls-key`, `ingest-mtls-cert`

### Logger — Console Fallback

```js
const { Logger } = require('sap-btp-cloud-logging-client');

Logger.info('msg', { meta: 'data' });
Logger.error('msg', { context: 'startup' });
Logger.warn('msg');
Logger.debug('msg'); // skipped in production (NODE_ENV=production)
```

---

## Advanced Features

### 1. Log Level Filtering
Control log verbosity without changing code. Set `BTP_LOG_LEVEL=WARN` in production to only capture warnings and errors.

### 2. Express Middleware
Automatically log incoming HTTP requests and responses.

```javascript
const express = require('express');
const { createLogger, middleware } = require('sap-btp-cloud-logging-client');

const app = express();
const logger = createLogger();

app.use(middleware(logger, {
  logRequests: true,      // Log request details (method, url, headers)
  logResponses: true,     // Log response status and duration
  excludePaths: ['/health'] // Skip health check endpoints
}));
```

### 3. Multi-Subaccount Pattern
You can point multiple applications from different sub-accounts to a **single** Cloud Logging instance to save costs or centralize logs.

1.  Create one Cloud Logging instance (e.g., in a "Shared Services" sub-account).
2.  Create a Service Key for this instance.
3.  In "Sub-Account A", configure the app with the Service Key credentials.
4.  Set `BTP_SUBACCOUNT_ID=subaccount-a` in "Sub-Account A".
5.  Set `BTP_SUBACCOUNT_ID=subaccount-b` in "Sub-Account B".

Logs will appear in the central dashboard, filterable by `subaccount_id` field.