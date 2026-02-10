---
name: setup-sap-btp-logging
description: Automates the setup of sap-btp-cloud-logging-client in a project.
---

# Setup SAP BTP Cloud Logging

This skill helps you integrate the `sap-btp-cloud-logging-client` into your Node.js/TypeScript project.

## Capabilities

1.  **Install Dependency**: Installs `sap-btp-cloud-logging-client`.
2.  **Add Utility Class**: Copies a standard `LogUtils` class (Singleton) to your project.
3.  **Configure Environment**: Adds required environment variables to your `.env` file.

## Usage

Run this skill when you want to add cloud logging to a project.

```bash
/setup-sap-btp-logging
```

## Steps

1.  **Install Package**:
    ```bash
    npm install sap-btp-cloud-logging-client
    ```

2.  **Create Utility Class**:
    Copy `templates/LogUtils.ts` to `src/utils/LogUtils.ts` (or your preferred location).
    *   *Note: If using JS, you may need to strip types.*

3.  **Update .env**:
    Append the following template to `.env`:
    ```env
    # SAP BTP Cloud Logging
    BTP_LOGGING_INGEST_ENDPOINT=
    BTP_LOGGING_USERNAME=
    BTP_LOGGING_PASSWORD=
    BTP_LOG_LEVEL=INFO
    BTP_APPLICATION_NAME=
    BTP_SUBACCOUNT_ID=
    # Or use a single Service Key JSON (overrides individual fields above)
    # BTP_LOGGING_SRV_KEY_CRED={"ingest-endpoint":"...","ingest-username":"...","ingest-password":"..."}
    ```

4.  **Add Middleware (Optional)**:
    In your express app:
    ```javascript
    const { createLogger, middleware } = require('sap-btp-cloud-logging-client');
    const logger = createLogger();
    app.use(middleware(logger, {
      logRequests: true,
      logResponses: true,
      excludePaths: ['/health', '/api/docs/*']
    }));
    ```
