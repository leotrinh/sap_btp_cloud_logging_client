# Architecture

This document describes the internal architecture of the `sap-btp-cloud-logging-client` library and recommended deployment patterns.

## Library Components

The library is designed with a modular architecture to separate concerns:

```mermaid
classDiagram
    class CloudLoggingService {
        +log(level, message, metadata)
        +logBatch(entries)
    }
    class ConfigManager {
        +getDefaultConfig()
        +mergeConfig()
        +validateConfig()
    }
    class Transport {
        <<interface>>
        +send(data)
    }
    class HttpTransport {
        +send(data)
    }
    class AuthStrategy {
        <<interface>>
        +getHeaders()
        +getEndpoint()
    }
    class BasicAuthStrategy {
        +getHeaders()
    }
    class MtlsAuthStrategy {
        +getHttpsAgent()
    }
    class Middleware {
        +handle(req, res, next)
    }

    CloudLoggingService --> ConfigManager : uses
    CloudLoggingService --> Transport : sends logs via
    HttpTransport --|> Transport : implements
    HttpTransport --> AuthStrategy : uses
    BasicAuthStrategy --|> AuthStrategy : implements
    MtlsAuthStrategy --|> AuthStrategy : implements
    Middleware --> CloudLoggingService : logs requests
```

### Components Description
1.  **CloudLoggingService**: The main entry point. Handles log level filtering, batching, and delegates actual sending to the Transport layer.
2.  **ConfigManager**: Loads configuration from environment variables or Service Keys.
3.  **Transport**: Abstract interface for sending logs. Currently implemented by `HttpTransport` using `axios`.
4.  **AuthStrategy**: Abstraction for authentication (Basic vs mTLS). Decouples auth logic from transport logic.
5.  **Middleware**: Express.js middleware for automatic request/response logging.

## Deployment Architecture

### Multi-Subaccount Logging Pattern
A common pattern is to aggregate logs from multiple sub-accounts into a single Cloud Logging Service instance.

```mermaid
flowchart TB
    subgraph GlobalAccount ["Global Account (CPEA/PAYG)"]
        direction TB
        subgraph SubA ["Sub-Account A (e.g. Dev)"]
            AppA["Node.js App A"]
            ClientA["sap-btp-cloud-logging-client"]
            AppA --> ClientA
        end
        
        subgraph SubB ["Sub-Account B (e.g. Test)"]
            AppB["Node.js App B"]
            ClientB["sap-btp-cloud-logging-client"]
            AppB --> ClientB
        end
        
        subgraph SubC ["Sub-Account C (e.g. Prod)"]
            AppC["Node.js App C"]
            ClientC["sap-btp-cloud-logging-client"]
            AppC --> ClientC
        end
    end

    CLS["SAP Cloud Logging Service
    (Central Instance)"]

    ClientA --"BTP_SUBACCOUNT_ID=dev"--> CLS
    ClientB --"BTP_SUBACCOUNT_ID=test"--> CLS
    ClientC --"BTP_SUBACCOUNT_ID=prod"--> CLS

    style CLS fill:#f9f,stroke:#333,stroke-width:2px
    style GlobalAccount fill:#e1f5fe,stroke:#01579b
```

### Key Concept
*   **Central Instance**: One Cloud Logging instance (created in a "Central" subaccount or reused) serves as the log sink.
*   **Differentiation**: Each client application configures `BTP_SUBACCOUNT_ID` layout or `BTP_APPLICATION_NAME` to distinguish its logs in the central dashboard.
*   **Cost Efficiency**: Reduces the need to provision separate Cloud Logging instances for every small sub-account.
