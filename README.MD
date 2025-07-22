# SAP BTP Cloud Logging Client
A Package support using cloud logging multiple-sub accounts with 1 Cloud Logging instance
Example: Your System Landscape with 3 global account (2 CPEA, 1 PAYG)

```
├── Global CPEA Subcribe
│   ├── Sub Account A Subcribed Cloud Logging
│   ├── Sub Account B using Cloud Logging via sap-btp-cloud-logging-client
├── Global CPEA using/
│   └── Sub Account C using Cloud Logging via sap-btp-cloud-logging-client
├── Global PAYG/
│   └── Sub Account D using Cloud Logging via sap-btp-cloud-logging-client
```

## Project Structure
```
sap-btp-cloud-logging-client/
├── package.json
├── README.md
├── LICENSE
├── index.js
├── lib/
│   ├── CloudLoggingService.js
│   ├── LogFormatter.js
│   └── ConfigManager.js
├── types/
│   └── index.d.ts
├── examples/
│   ├── basic-usage.js
│   ├── express-middleware.js
│   └── advanced-usage.js
└── test/
    └── CloudLoggingService.test.js
```

## Usage

### Install package
```
npm install sap-btp-cloud-logging-client
```
### Env config
All required config bellow can get from Service: Cloud Logging instance Service Keys
```
# Required
BTP_LOGGING_INGEST_ENDPOINT=https://ingest-sf-xxx.cls-16.cloud.logs.services.eu10.hana.ondemand.com
BTP_LOGGING_USERNAME=your-username
BTP_LOGGING_PASSWORD=your-password

# Optional
BTP_SUBACCOUNT_ID=subaccount-id #to determine the logs source
BTP_APPLICATION_NAME=your-app-name
BTP_LOG_LEVEL=INFO
BTP_LOGGING_MAX_RETRIES=3
BTP_LOGGING_TIMEOUT=5000
```
### Basic implementation
- Javascript
```
const { createLogger } = require('sap-btp-cloud-logging');

const logger = createLogger();

logger.info('Hello from BTP Cloud Logging!');
```
- Typescript
```
import { createLogger, middleware as loggingMiddleware } from 'sap-btp-cloud-logging-client';
const logger = createLogger();
logger.info('Hello from BTP Cloud Logging!');
```

## Contributors & Issues
### Issues
Any issues can report at [Issues]([tinhtd.info@gmail.com](https://github.com/leotrinh/sap_btp_cloud_logging_client/issues))

### Contributors
In its initial version, this project was created to meet my specific needs, and it may not fully align with your use case. We aim to make contributing to this project as easy and transparent as possible. To contribute, simply make your changes and submit a pull request (PR).

Feel free to let me know if you need any further adjustments!
#### Contributing
1. [Leo Trịnh](tinhtd.info@gmail.com)