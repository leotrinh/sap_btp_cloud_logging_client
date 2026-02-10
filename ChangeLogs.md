# Changelogs

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