# Prompt: Setup SAP BTP Cloud Logging

Use this prompt to help the user integrate the `sap-btp-cloud-logging-client` into their project.

## Context
The user wants to add SAP BTP Cloud Logging to their Node.js/TypeScript project. This library provides a standard way to send logs to SAP Cloud Logging service.

## Goal
Guide the user through installation, configuration, and implementation of a standard `LogUtils` class.

## Steps to Execute

1.  **Check Dependencies**:
    Ask the user to run:
    ```bash
    npm install sap-btp-cloud-logging-client
    ```

2.  **Provide LogUtils Template**:
    Offer to create `src/utils/LogUtils.ts` with the standard Singleton implementation.
    *   **Source**: `.claude/code/LogUtils.ts`
    *   **Action**: Read the file `.claude/code/LogUtils.ts` and write it to the user's project at `src/utils/LogUtils.ts`.

3.  **Configure Environment**:
    Tell the user to add these variables to their `.env` file:
    ```env
    # SAP BTP Cloud Logging
    BTP_LOGGING_INGEST_ENDPOINT=<your-ingest-url>
    BTP_LOGGING_USERNAME=<your-username>
    BTP_LOGGING_PASSWORD=<your-password>
    BTP_LOG_LEVEL=INFO
    BTP_APPLICATION_NAME=<your-app-name>
    BTP_SUBACCOUNT_ID=<your-subaccount-id>
    ```
    *Alternative: use `BTP_LOGGING_SRV_KEY_CRED` with a JSON service key to auto-configure all fields.*

4.  **Usage Example**:
    Show the user how to use it:
    ```typescript
    import LogUtils from './utils/LogUtils';
    const logger = LogUtils.getInstance();
    logger.info('Application started');
    logger.apiInfo('GET /users', { endpoint: '/users', method: 'GET' });
    ```

5.  **Middleware Integration (Optional)**:
    For Express.js apps:
    ```javascript
    const { createLogger, middleware } = require('sap-btp-cloud-logging-client');
    const logger = createLogger();
    app.use(middleware(logger, {
      logRequests: true,
      logResponses: true,
      excludePaths: ['/health']
    }));
    ```
