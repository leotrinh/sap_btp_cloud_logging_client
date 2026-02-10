---
description: Integrate SAP BTP Cloud Logging Client into your project
---

# Integrate SAP BTP Cloud Logging Client

This workflow will help you install and configure the `sap-btp-cloud-logging-client` in your project.

## 1. Install Package
First, we need to install the package from npm.

```bash
npm install sap-btp-cloud-logging-client
```

## 2. Setup LogUtils
We will create a standard `LogUtils` class to help you use the logger effectively throughout your application.

1.  Create directory `src/utils` if it doesn't exist.
    ```bash
    mkdir -p src/utils
    ```

2.  Copy the `LogUtils.ts` template from the installed package or from the project repository.
    ```bash
    # If you have this repo cloned locally:
    cp node_modules/sap-btp-cloud-logging-client/examples/utils/LogUtils.ts src/utils/LogUtils.ts
    # Or copy from the template in this repo:
    # cp .agent/skills/setup-logging/templates/LogUtils.ts src/utils/LogUtils.ts
    ```
    *(Note: If you are using JavaScript, you may need to strip the TypeScript types or convert the file.)*

## 3. Configure Environment
Add the following configuration to your `.env` file. You will need to fill in the values from your SAP BTP Service Key.

```env
# SAP BTP Cloud Logging Configuration
BTP_LOGGING_INGEST_ENDPOINT=https://ingest-sf-xxx.cls-16.cloud.logs.services.eu10.hana.ondemand.com
BTP_LOGGING_USERNAME=your-username
BTP_LOGGING_PASSWORD=your-password
BTP_LOG_LEVEL=INFO
BTP_APPLICATION_NAME=my-app
BTP_SUBACCOUNT_ID=subaccount-id
# Or use a single Service Key JSON (overrides individual fields above)
# BTP_LOGGING_SRV_KEY_CRED={"ingest-endpoint":"...","ingest-username":"...","ingest-password":"..."}
```

## 4. Middleware Integration (Optional)
If you are using Express.js, you can add the logging middleware to your app.

In your `app.js` or `index.js`:

```javascript
const { createLogger, middleware } = require('sap-btp-cloud-logging-client');
const logger = createLogger();

// Add this before your routes
app.use(middleware(logger, {
  logRequests: true,
  logResponses: true,
  excludePaths: ['/health', '/api/docs/*']
}));
```

## 5. Verification
Run your application and check the logs. You should see a startup message if you added one, or check the Cloud Logging dashboard.
