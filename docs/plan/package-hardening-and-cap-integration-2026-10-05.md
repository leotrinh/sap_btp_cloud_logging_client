# Package Hardening & SAP CAP Integration — 2026-10-05

Audit of `sap-btp-cloud-logging-client` v1.0.8 plus a phased remediation plan. Findings first, ranked by severity, each with file evidence. No code was changed during the audit.

Scope: every file under `lib/`, `index.js`, `package.json`, `test/`. Two questions drove it — what is unsafe or wrong today, and what is missing for SAP CAP applications.

## A. Findings

### A1 — HIGH: the package hijacks the host application's error handling, by default

`lib/CloudLoggingService.js` — `_setupGlobalErrorHandling()`

```js
process.removeAllListeners('uncaughtException');
process.on('uncaughtException', errorHandler);
```

Enabled unless the consumer explicitly passes `preventUncaughtExceptions: false` (`lib/CloudLoggingService.js:45`), so the default is on.

Consequences for any consumer:

- Every `uncaughtException` listener registered by the application, by CAP, by Sentry or any APM agent, and by any other library is **removed**. A logging library silently disables the host's crash reporting and graceful-shutdown hooks.
- Non-logging errors are forwarded only to `_originalHandlers.uncaughtException[0]` — the first handler captured at construction time. Every other handler is dropped permanently, and handlers registered *after* construction are never captured at all.
- The same pattern is applied to `unhandledRejection`.
- Classification is string matching on `error.message.includes('Cloud Logging')`, so an unrelated application error whose message happens to contain that phrase is swallowed and the process keeps running in an undefined state.

This is the most serious finding in the package. For a publicly published library, taking over process-level error handling without an explicit opt-in is not defensible.

**Fix:** default to `false`. Never call `removeAllListeners`. If the feature is kept at all, add a listener alongside the existing ones and let the host's handlers run.

### A2 — HIGH: the full Express request object is sent to the ingest endpoint

`lib/Middleware.js:44-47` passes the whole request:

```js
logger.info('Incoming request', { req: req });
```

`lib/LogFormatter.js:56-59` extracts a safe subset into `request`, but never removes the raw object:

```js
Object.assign(baseLog, metadata);        // baseLog.req = <Express Request>
if (metadata.req) {
  baseLog.request = this._formatRequest(metadata.req);   // no delete of baseLog.req
}
```

So `baseLog.req` survives into the payload that `HttpTransport` hands to axios. Two outcomes, both bad:

- Express requests are circular (`req.res.req`), so `JSON.stringify` throws. The throw is caught by `log()`, routed into `_handleError`, and retried with exponential backoff — meaning **every inbound HTTP request produces a failed send plus retries** when `logRequests` is on.
- If serialization does succeed in some shape, request headers travel to the log store — including `authorization` and `cookie`. `sanitize()` is not applied on this path (see A5), so nothing redacts them.

**Fix:** `delete baseLog.req` after extracting `request`; stop passing the raw request from the middleware.

### A3 — HIGH: concurrent failures silently discard all but the last log entry

`lib/CloudLoggingService.js:91-103`

```js
if (this.retryTimer) { clearTimeout(this.retryTimer); }
this.retryTimer = setTimeout(() => { this.log(level, message, metadata); }, delay);
```

`retryTimer` and `retryCount` are **instance-level, not per-entry**. When the endpoint is down and ten entries fail, each one cancels the previous entry's retry. Only the tenth is ever retried; the other nine vanish — no console fallback, no `onError`, because `_handleError` returns early on the retry path.

`retryCount` is also shared, so one successful send resets the backoff for everything, and ten concurrent failures burn through `maxRetries` in a single pass.

**Fix:** retry state belongs to the entry, not the service. The clean form is a bounded outbound queue with a single drain loop — which is the same machinery batching needs (A11), so build it once.

### A4 — HIGH: importing the package starts timers and attempts configuration

`lib/LogUtils.js` ends with `const logUtils = new LogUtils();`, and `index.js` requires that module eagerly.

So `require('sap-btp-cloud-logging-client')` — even to use only `sanitize` — constructs a `CloudLoggingService`, runs `ConfigManager.mergeConfig()`, and on failure schedules `setTimeout` retries (`lib/LogUtils.js:35-41`). Pending timers keep the event loop alive, which delays process exit for short-lived scripts, CLI tools and test runs.

**Fix:** lazy singleton behind a getter; the instance is created on first use, not on import.

### A5 — HIGH: cloud-logging failures are swallowed with no trace

`lib/LogUtils.js:68`

```js
try { this.cloudLogger[level](message, enrichedMetadata); } catch { /* fallback below */ }
```

An empty catch with no logging. If anything in the cloud path breaks — a bad config, a transport error, a renamed method — the consumer sees normal console output and has no signal that **nothing is reaching Cloud Logging**. This is the failure mode that takes longest to notice in production.

**Fix:** record the error once (`console.warn`, deduplicated), and surface it through `getHealthStatus()`.

### A6 — MEDIUM: `sanitize()` is applied on only one of two public paths

Redaction runs in `LogUtils.log()` (`lib/LogUtils.js:65`). It does **not** run in `CloudLoggingService.log()`, so a consumer using the documented `createLogger()` API gets no redaction at all. Two public entry points, two different security postures, no documentation of the difference.

**Fix:** apply redaction in `LogFormatter.format()` — the one place both paths pass through.

### A7 — MEDIUM: bogus `https` dependency

`package.json` declares `"https": "^1.0.0"`. Node's `https` is a built-in module; `require('https')` never resolves to this package. It is dead weight and an open supply-chain surface — an npm package of that name is installed into every consumer's tree for no reason.

**Fix:** remove it.

### A8 — MEDIUM: `winston` is a hard dependency for an optional integration

Only `lib/WinstonTransport.js` needs winston, yet `index.js` requires it eagerly, so every consumer installs the full winston tree whether or not they use it.

**Fix:** move to `peerDependencies` + `peerDependenciesMeta.optional`, and `require` it lazily inside the transport.

### A9 — MEDIUM: personal defaults shipped in a public package

`lib/LogUtils.js:62-63`

```js
subaccount: process.env.BTP_SUBACCOUNT_ID || 'LEO_DEV_PAYG',
application: process.env.BTP_APPLICATION_NAME || 'LEO_APP_DEV',
```

A consumer who forgets the env var gets the author's personal identifiers in their production logs. `ConfigManager.getDefaultConfig()` uses different fallbacks again (`'PAYG_DEVELOPMENT'` / `'unknown-app'`), so the two paths disagree.

**Fix:** one neutral default, defined once — `'unknown-subaccount'` / `'unknown-app'`.

### A10 — MEDIUM: unconditional double logging

`lib/LogUtils.js:67-71` always writes to console **and** to Cloud Logging. On Cloud Foundry the platform also captures stdout, so each entry is stored twice and billed twice. `config.fallbackToConsole` exists but this path ignores it.

**Fix:** console output only when the cloud path is unavailable, or when explicitly requested.

### A11 — MEDIUM: one HTTPS request per log line

`HttpTransport.send()` posts a single entry per `log()` call. `logBatch()` exists (`lib/CloudLoggingService.js:148`) and the transport already accepts an array, but nothing batches automatically.

Under CAP request load this is one TLS round trip per log line. It is also the fastest way to hit the ingest throughput ceiling, which is explicitly tight on the `dev` plan.

**Fix:** buffer entries, flush on size (default 100) or interval (default 2 s), whichever comes first. Shares the queue built for A3.

### A12 — MEDIUM: no flush on shutdown

`shutdown()` (`lib/CloudLoggingService.js:185`) clears the retry timer and prints to console. It does not wait for in-flight sends and has no handle on pending ones. Cloud Foundry sends `SIGTERM` on every restage and scale-down, so the final seconds of logs — often the most interesting ones — are lost. Becomes mandatory once A11 lands.

**Fix:** `shutdown()` drains the queue with a bounded timeout; register `SIGTERM`/`SIGINT` handlers only when the consumer opts in.

### A13 — MEDIUM: no runtime control of the log level

`minLogLevel` is computed once in the constructor (`lib/CloudLoggingService.js:42`) from `BTP_LOG_LEVEL`. There is no way to raise or lower it on a running app. `setLoggingLevel()` exists but is an empty no-op (`lib/LogUtils.js:109`), so consumers migrating from `cf-nodejs-logging-support` call it and silently get nothing.

Turning on debug for a live incident currently requires `cf set-env` plus a restage — losing the state being debugged.

**Fix:** implement `setLevel(level)` on both classes; optionally a periodic re-read of the env var so `cf set-env` takes effect on the next interval without a restart.

### A14 — MEDIUM: `engines.node >= 14`

Node 14 reached end of life in April 2023. Supporting it blocks `crypto.randomUUID()`, modern syntax, and current security baselines.

**Fix:** `>= 18` in the 1.1.0 major-ish bump, called out in `ChangeLogs.md`.

### A15 — LOW

| | Finding | Evidence |
|---|---|---|
| a | `_getStackTrace()` builds a `new Error()` at log time, so the stack is the **logger's** call stack, not the error's. Misleading on every `ERROR` entry when `includeStackTrace` is on | `lib/LogFormatter.js:84` |
| b | `uuid` is a dependency used only for correlation IDs; `crypto.randomUUID()` is built in | `lib/Middleware.js:1` |
| c | `LogUtils.log()` injects `application` / `subaccount` / `timestamp` that `LogFormatter` sets and then deletes — wasted work, and a confusing read | `lib/LogUtils.js:59-64` vs `lib/LogFormatter.js:105-110` |
| d | `CloudLoggingService.fatal()` is unreachable through `LogUtils`, which only maps `info`/`error`/`warn`/`debug` | `lib/LogUtils.js:76-108` |
| e | `res.end` monkey-patching assumes a three-argument signature; fragile with compression and streaming middleware | `lib/Middleware.js:52-65` |
| f | No tests for `ConfigManager`, `Transport`, `LogUtils`, or `sanitize` — the four files holding the most logic | `test/` holds four files, none covering these |

## B. Feature gaps for SAP CAP

### B1 — No CAP integration exists

The only framework integration shipped is Express middleware. A CAP application gets nothing automatic: no CAP-internal logs, no correlation, no tenant.

What a CAP-native integration provides:

| Capability | Mechanism |
|---|---|
| CAP framework logs (db, odata, auth, messaging) reach Cloud Logging | Plug a custom logger into the `cds.log` facade instead of letting it write to stdout |
| Per-request correlation without the consumer passing anything | Read `cds.context` — `id`, `tenant`, `user`, `locale` — at format time |
| Per-module levels (`cds.log('sql', 'debug')`) honoured | Map CAP's level model onto `minLogLevel` |
| Multitenant separation | `tenant` as a first-class field, not an ad-hoc metadata key |

This is the largest missing piece and the one with the clearest value. It should be a separate entry point (`sap-btp-cloud-logging-client/cap`) so non-CAP consumers never load it and CAP never becomes a dependency.

**Cross-package constraint on `tenant_id`** (agreed with the Java package, 2026-10-05): when this field is emitted, **omit the key entirely when there is no tenant — never write `""`**. The Java reference implementation was verified empirically against `cf-java-logging-support` 3.7.1: an unset MDC field is absent from the shipped JSON, not null and not empty, and that behaviour is pinned by an assertion on their side. An absent field and an empty one are different things in OpenSearch: `exists:tenant_id` only stays meaningful if nobody writes empties, and a permanently-empty column reads as "this request had no tenant" rather than "this runtime has no concept of tenants". The field is **optional** in the contract — emitted when the runtime supplies it, absent otherwise — so it creates no work before Phase 5.

### B2 — No sampling or rate limiting

A loop that logs inside a request handler can saturate the ingest quota, and on a shared instance it evicts other tenants' data through size-based curation. A simple per-level token bucket with a `logs dropped` counter would bound the damage.

### B3 — No health/diagnostics surface worth the name

`getHealthStatus()` returns `isHealthy`, `retryCount` and endpoints. It cannot answer the question operators actually ask: are logs arriving? Add counters — sent, failed, dropped, queue depth, last error, last success timestamp.

## C. Remediation plan

Ordered by risk removed per unit of work, not by section number.

| Phase | Content | Findings closed | Breaking? |
|---|---|---|---|
| **0** ✅ | Test net: `LogUtils` and `sanitize` characterization tests against v1.0.8 — both files had none. `ConfigManager` and `Transport` coverage deferred to Phase 2, which is where they are first touched | A15f (partial) | no |
| **1** ✅ | Safety fixes, shipped as `1.1.0`: stop calling `removeAllListeners`; register process listeners once per process; keep the raw request out of the payload; preserve non-request metadata keyed `req`; move `sanitize()` into `LogFormatter` behind a `sanitizeMetadata` opt-out; replace the empty catch with throttled reporting. The `preventUncaughtExceptions` default flip is **deferred to 2.0.0** and marked deprecated | A1 (non-breaking half), A2, A5, A6 | **no** |
| **2** | Dependency hygiene: drop `https`; `winston` to optional peer + lazy require; drop `uuid` for `crypto.randomUUID()`; `engines >= 18`; lazy `LogUtils` singleton | A4, A7, A8, A14, A15b | yes — peer dep |
| **3** | Outbound queue: single bounded queue with per-entry retry, size/interval batching, drain on `shutdown()` | A3, A11, A12 | no |
| **4** | Operability: `setLevel()` on both classes, real `setLoggingLevel()`, counters in `getHealthStatus()`, neutral defaults, console only on fallback | A9, A10, A13, B3 | yes — A10 changes output volume |
| **5** | CAP integration as a separate entry point, with its own tests and docs | B1 | no — additive |
| **6** | Polish: real error stacks, remove the redundant enrichment, expose `fatal`, harden the `res.end` patch | A15a, A15c, A15d, A15e | no |
| **7** | Sampling / rate limiting | B2 | no |

### Versioning — no release may break a consumer

The package is published publicly and its consumers are unknown and uncontactable. That makes "does this break someone" the only question that decides a version number, and it outranks tidiness.

**Shipped as `1.1.0` (no breaking change):** every fix whose effect on an existing consumer is either nothing or a repair — removing the listener hijack, fixing the per-instance listener leak, keeping the raw request out of the payload, preserving non-request metadata keyed `req`, and surfacing swallowed cloud failures. Redaction on the `createLogger()` path changes log *content*, so it ships with the `sanitizeMetadata` opt-out rather than as a silent change.

**Deferred to `2.0.0`:** everything that can break a running application — flipping the `preventUncaughtExceptions` default, `winston` becoming a peer dependency, `engines >= 18`, and the field renames the cross-package contract requires (`correlationId` → `correlation_id`, `stack` → `stacktrace`). Batching these into one major means consumers read one migration note, not three.

The A1 split is the key move: the dangerous half of that finding — the package deleting the application's error handlers — is fixed with **zero** breakage, because an application that had its own handler was already broken by the old behaviour and is repaired by the fix. Only the default flip breaks anyone, and only applications with no handler of their own. That half waits.

### Acceptance

- Phase 0 tests stay green across every later phase; any intentional change is a deliberate edit to that file with a `ChangeLogs.md` entry.
- Phase 1: a test asserting the package registers **no** `uncaughtException` listener by default, and another asserting no raw `req` object survives into the formatted payload.
- Phase 3: endpoint down, 100 entries logged → every entry is either delivered after recovery or reported through the fallback; none disappears.
- Phase 5: a CAP sample project where `cds.log('sql').debug(...)` reaches the ingest endpoint carrying `cds.context.id` as the correlation id.

## D. Open questions

1. Are there consumers outside the author's control on v1.0.x today? It decides whether Phase 1 can ship as 2.0.0 immediately or needs a deprecation window first.
2. Should the CAP integration target CAP Node.js only, or also expose the shape the Java package will need? Worth settling before Phase 5 so field names stay identical across the two packages.
3. Is double logging (A10) intentional — some consumers may rely on stdout being captured by the platform as a safety net.

## E. Sources

- [SAP Help — What is SAP Cloud Logging](https://help.sap.com/docs/cloud-logging/cloud-logging/what-is-sap-cloud-logging)
- [SAP Community — From Application Logging to Cloud Logging](https://community.sap.com/t5/technology-blog-posts-by-sap/from-application-logging-to-cloud-logging-service-innovation-guide/ba-p/13938380)
- [CAP — Observability (Java)](https://cap.cloud.sap/docs/java/operating-applications/observability)
