# Changelogs

## v1.0.8
- **Feature**: Bundled `Logger` and `LogUtils` directly into the package — no need to copy them manually to each project.
- **Feature**: Added `Logger` — console-based fallback logger with timestamp formatting. Used internally by `LogUtils` when BTP Cloud Logger is unavailable.
- **Feature**: Added `LogUtils` — structured domain logger with BTP Cloud Logger as primary and `Logger` as fallback. Includes retry logic (3 attempts, 2s delay) on init failure.
- **Feature**: Added `sanitize()` utility — recursively redacts sensitive fields (`password`, `token`, `secret`, `authorization`, `apikey`, `api_key`, `access_token`, `cookie`, etc.) from objects before logging. Depth-limited to prevent performance issues on large payloads.
- **Feature**: Domain-specific log methods: `apiInfo/apiError`, `eventInfo/eventError`, `baseInfo/baseError`, `logApi`, `logEvent`, `logBase`.
- **Exports**: New named exports: `logUtils` (singleton), `LogUtils` (class), `Logger`, `sanitize`, `createLogUtils`.
- **TypeScript**: Full type declarations for all new exports (`ConsoleLogger`, `LogUtils`, `LogApiOptions`, `LogEventOptions`, `LogBaseOptions`, `LogLevel`).
- **Documentation**: Updated README with `## Logger & LogUtils (v1.0.8+)` section.
- **Documentation**: Updated `docs/Usage.md` with Logger/LogUtils usage guide.
- **Example**: Added `examples/log-utils-built-in-usage.js` demonstrating all new APIs.

## v1.0.7
- **Feature**: Added `removeOriginalFieldsAfterMapping` config option (default: `true`) — removes original fields (`message`, `application`, `subaccount`) after BTP field mapping to prevent duplicates.
- **Enhancement**: Improved BTP Cloud Logging field mapping logic.
- **Fix** *(CRITICAL)*: Metadata override bug — user metadata was being overwritten by default values.
- **Fix**: TypeScript compilation errors for dynamic property assignments.
- **Fix**: Inconsistent field mapping behavior when metadata contains BTP fields.
- **Tests**: Added edge case test suite — null/undefined values, circular references, extreme string lengths, metadata override scenarios.
- **Breaking**: Default behavior now removes original fields after mapping. Set `removeOriginalFieldsAfterMapping: false` to keep old behavior.

## v1.0.6
- **Feature**: Initial BTP Cloud Logging field mapping integration.
- **Enhancement**: Basic SAP field mapping support (`message` → `msg`, `application` → `app_name`, `subaccount` → `organization_name`).

## v1.0.5
- **Feature**: Added BTP Cloud Logging field mapping transformation.
- **Enhancement**: Added `enableSAPFieldMapping` configuration option (default: true).
- **Enhancement**: Maps internal fields to Cloud Logging Standard Fields:
  - `message` → `msg` (for BTP Cloud Logging)
  - `application` → `app_name` (for BTP Cloud Logging)
  - `subaccount` → `organization_name` (for BTP Cloud Logging)
- **Enhancement**: Maintains backward compatibility - both old and new fields present.
- **Enhancement**: Preserves custom metadata and existing SAP fields.
- **Documentation**: Added BTP Cloud Logging guide and demo examples.
- **Tests**: Added comprehensive unit tests for field mapping functionality.

## v1.0.4
- **Documentation**: Updated README project structure and fixed Usage guide default values.
- **Refactor**: Excluded internal review docs from npm package to reduce size.
- **Enhancement**: Added `fatal` log level support to all `LogUtils` examples.
- **Fix**: Corrected `files` whitelist in `package.json` to include `examples/` and `docs/`.

## v1.0.3
- **Refactor**: Major code cleanup and refactoring of `CloudLoggingService`.
- **Fix**: Resolved issue with `BTP_LOG_LEVEL` environment variable not being read correctly.
- **Fix**: Removed duplicate endpoint checks to adhere to DRY principle.
- **Fix**: Corrected `WinstonTransport` metadata forwarding issue.
- **Fix**: Added missing `mtlsEndpoint` to `HealthStatus` type definition.

## v1.0.2
- **Feature**: Added support for `BTP_LOGGING_SRV_KEY_CRED` to allow single-variable configuration from Service Key JSON.
- **Docs**: Updated documentation with new configuration options.

## v1.0.1
- **Fix**: Initial bug fixes and stability improvements.

## v1.0.0
- **Initial Release**: Basic support for SAP BTP Cloud Logging with `createLogger`, `middleware`, and `WinstonTransport`.