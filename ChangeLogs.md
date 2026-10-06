# Changelogs

## v1.2.0

Delivery-correctness pass. **No breaking change** — no default changes, no call signature moves, and no field is removed from the payload.

### Fixed
- **A rejected entry is no longer counted as delivered.** `HttpTransport` used `validateStatus: status < 500`, so any 4xx — a wrong credential, a rejected payload — was treated as a successful send. `getHealthStatus()` reported `healthy: true` through an unbounded run of rejections while every line was discarded server-side, which is the longest-to-notice failure a logging client can have. Responses are now classified: 2xx delivered, 4xx reported and dropped, 5xx retried. Verified against a real ingest endpoint — a deliberately wrong credential now reports `HTTP 401` on the console and sets `healthy: false`, where it previously stayed silent and healthy.
- **A 4xx is no longer retried.** The server will reject the same entry again, so retrying spent the budget on a guaranteed failure and delayed the console fallback that would have revealed the problem.
- **The retry window is no longer silent.** `_handleError()` returned without output while backing off, so the package said nothing exactly while a problem was still recoverable, then became noisy once it was not. Retries are now reported, throttled to one line per distinct problem per minute.
- **An entry that cannot be formatted is dropped instead of retried.** `sanitize()` throws if a metadata getter throws; that escaped `format()` into the transport's catch, which could not distinguish a formatting failure from a network one, so an entry that could never be built was retried with exponential backoff. Formatting now runs outside the transport boundary and such an entry is reported, passed to `onError`, and dropped.
- **A malformed service key no longer destroys working configuration.** `JSONUtils.getEnvJSONObject()` returned `{}` on a parse failure; `{}` is truthy, so an empty object was spread over configuration that was valid. A `BTP_LOGGING_SRV_KEY_CRED` truncated by a line-oriented `.env` reader — the shape `cf service-key` output takes — therefore wiped correct `BTP_LOGGING_*` variables and failed with a message naming the credentials, which were fine, rather than the key, which was not. An unparseable key is now ignored with a warning that names it, and the discrete variables are used.
- **An incomplete service key says what it is missing.** A parseable key is a deliberate selection, so it is used as given rather than quietly completed from unrelated variables — which would ship logs under a credential the operator did not know they had chosen.
- **Placeholder defaults are neutral and defined once.** `LogUtils` fell back to the author's personal identifiers while `ConfigManager` used different values again, so the same unconfigured application reported a different origin depending on which entry point it used. Both are now `unknown-subaccount` / `unknown-app`. No entry in the production index carried any of the previous defaults, so nothing observable changes.
- **A logging call still never throws into caller code.** A rejected entry is reported and dropped rather than raised: business code can do nothing useful with a logging credential fault, and turning one into an application fault would be worse than the silence this release removes.

### Added
- **`fatal()` on `LogUtils` and on the console fallback.** `CloudLoggingService` has always supported the FATAL level, but `LogUtils` mapped only info/error/warn/debug, so the level was unreachable through the documented domain logger.

### Removed
- **The `https` dependency.** Node's `https` is a built-in module and `require('https')` never resolved to that package; it was dead weight and an unnecessary supply-chain surface in every consumer's tree.

### Docs
- `docs/searching.md` — new. Finding entries in the Cloud Logging dashboard: query syntax, which fields exist, what the platform adds, and what to check when nothing comes back.
- `docs/version-control.md` — new. What the three version numbers mean and which changes force a major release.

### Tests
- 91 → 104. New `test/ConfigResolution.test.js` covering service-key resolution and the placeholder defaults; new cases for rejection handling, retry suppression and formatting failures.

## v1.1.0

Hardening pass. **No breaking change** — every default is preserved and no call signature moved. Audit and remediation plan: `docs/plan/package-hardening-and-cap-integration-2026-10-05.md`.

### Fixed
- **The package no longer replaces the application's process listeners.** `_setupGlobalErrorHandling()` previously called `process.removeAllListeners('uncaughtException')` and `removeAllListeners('unhandledRejection')`, silently discarding every handler registered by the application, by CAP, and by any APM or crash reporter, then forwarding only to the first handler captured at construction time. Listeners are now added alongside existing ones and never removed. Applications that had their own handler get it back. Applications that had none see no change either: an error that is not ours is re-thrown when no other listener is registered, so the process still crashes exactly as it would without this package — Node keeps a process alive while any listener exists, so returning silently there would have left a zombie behind an unrelated bug.
- **Process listeners are registered once per process, not once per instance.** Creating several `CloudLoggingService` instances added a pair of listeners each time. The previous `removeAllListeners` call hid this by wiping the slate on every construction; without it the leak would surface as Node's `MaxListenersExceededWarning` after ten instances.
- **The raw request object no longer reaches the shipped payload.** `LogFormatter` extracted a safe subset into `request` but left the original `req` on the entry, so each log either failed to serialize (HTTP request objects are circular) and burned the retry budget, or shipped request headers — `authorization` and `cookie` included — to the log store.
- **Metadata keyed `req` that is not a request is preserved instead of crashing.** `_formatRequest()` called `req.get(...)` unconditionally, so a consumer logging `{ req: 'GET /orders' }` hit a `TypeError`. Non-request values now stay ordinary metadata.
- **Cloud logging failures are no longer swallowed silently.** `LogUtils.log()` caught every error from the cloud path with an empty `catch {}`, so a consumer saw healthy console output while nothing reached Cloud Logging. Failures are now reported through the console fallback, throttled to one message per minute per distinct error. Asynchronous rejections from the cloud methods — which never reached that `catch` at all — are captured too.

### Added
- **`correlation_id` is now emitted alongside `correlationId`.** Cloud Logging reads `correlation_id` semantically: it strips the hyphens and derives a W3C trace-context `trace_id`, which is what lets an entry join a trace. The same value under `correlationId` was stored but inert, so entries from this package have never been traceable. Verified against the live index — an entry written under the new name now carries `trace_id`. Nothing is removed: `correlationId` is still emitted so existing dashboards, saved searches and alerts keep working. It is marked `@deprecated` in `types/index.d.ts` and is removed in 2.0.0, which is also when `timestamp` becomes `written_at` and `stack` becomes an array named `stacktrace`.

### Changed
- **Redaction now applies to both public entry points.** `sanitize()` ran only inside `LogUtils`; the documented `createLogger()` path performed no redaction at all. It now runs in `LogFormatter.format()`, which both paths pass through.
- **New `sanitizeMetadata` option** (default `true`, env `BTP_LOGGING_SANITIZE_METADATA`). Escape hatch for consumers whose own field names collide with the substring-matched redaction list — for example `tokenCount` or `passwordPolicy` — and who need the raw values on the `createLogger()` path.

### Deprecated
- **`preventUncaughtExceptions` still defaults to `true`, and that default becomes `false` in 2.0.0.** Process-level error handling belongs to the application. Set the option explicitly to pin current behaviour across the 2.0.0 upgrade. Note that while enabled, Node will not terminate on an uncaught exception, because a listener is registered.

### Tests
- Added `test/Logger.test.js`, `test/LogUtils.test.js` and `test/ProcessSafety.test.js` — `sanitize` and `LogUtils` previously had no test coverage despite holding most of the package's logic. Suite grew from 53 to 85 tests.
- Replaced the `NetworkErrorHandling` assertion on `_originalHandlers`, which covered the listener-replacement mechanism that has been removed, with one asserting that application listeners survive.

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