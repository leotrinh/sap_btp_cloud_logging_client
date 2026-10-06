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

### A16 — HIGH: a 4xx response is counted as a successful send

`lib/Transport.js:58` sets `validateStatus: (status) => status < 500`, and the 4xx branch prints one `console.warn` then returns normally. Consequences, in order of how long they take to notice:

- A wrong credential produces a 401 per log line and nothing else. `isHealthy` stays `true`, `retryCount` stays `0`, `getHealthStatus()` reports a healthy client, and every line is discarded by the server. There is no state anywhere in the package that distinguishes this from working.
- A payload the endpoint rejects with a 400 — a wrong field shape, an oversize body — is indistinguishable from an accepted one. **This also means the package cannot be used as evidence that the ingest contract is correct**: a successful-looking run proves only that nothing threw. Raised with the Java package on 2026-10-05, which had been inferring the wire contract from this file.
- 4xx is not retried, which is right, but it is also not reported through `onError` or counted anywhere, which is not.

**Fix:** treat 2xx as success, 4xx as a non-retryable drop (counted, reported once per distinct status per throttle window), 5xx as retryable. Lands with the counters in Phase 4.

**Ingest contract — partially verified 2026-10-06, by the Java package against the real central instance.** `POST https://<ingest-host>` with no path suffix, `Content-Type: application/json`, basic auth from the service key, and a **JSON array** body returned **HTTP 200**, status code read directly. Credentials came through the same three discrete variables this client reads, so the envelope is confirmed for our configuration path too: bare host, no suffix, basic auth header, array body.

**The gap that remains is ours alone: our default path does not send an array.** Captured from a local server receiving real traffic from this client:

| Caller | Body |
|---|---|
| `log()` — every `logger.info()` / `.error()` call | `{"timestamp":…}` — a **bare object** |
| `logBatch()` | `[{…}]` — an array, the verified shape |

So the shape proven to be accepted is the one almost no consumer currently produces, and the shape every consumer produces today is unverified. A `validateStatus` of `status < 500` means a 400 rejecting the bare object would be invisible: one `console.warn` per line, `isHealthy` still true, logs silently discarded server-side. That combination — unverified default shape plus blindness to rejection — is why this finding is HIGH rather than MEDIUM.

Verifying it is one request for whoever holds credentials: POST a bare object to the ingest endpoint and read the status code. If it is rejected, the fix is to have `HttpTransport.send()` always wrap a single entry in an array, which is non-breaking and would ship in the same phase.

Still unverified after this, for both packages: **queryability**. A 200 means the endpoint accepted the bytes, not that the entry is searchable with the field names under negotiation. Only the dashboard settles that — send an entry with a known `correlation_id`, then search for it and report which field names actually came back, watching for a dropped field, a coerced type, or `stacktrace` arriving as something other than an array.

### A17 — MEDIUM: the retry window is completely silent

`_handleError()` returns immediately after scheduling a retry, with no output. A sustained outage therefore produces nothing on the console until `maxRetries` is exhausted — and because `retryCount` is only reset on success, every entry after that point goes straight to the console fallback, one line each. The package is silent exactly while the problem is recoverable and noisy once it is not. Same class as the empty catch fixed in 1.1.0 (A5), on a different path; reuse `CLOUD_FAILURE_THROTTLE_MS` rather than adding a second throttle.

### A18 — MEDIUM: an unformattable entry is retried as though it were a network failure

`sanitize()` throws if any metadata getter throws — verified: `sanitize({ password: 'p', nested: { get boom() { throw ... } } })` propagates. The throw escapes `LogFormatter.format()` into `CloudLoggingService.log()`'s catch, which cannot tell a formatting failure from a transport failure, so the entry is retried with exponential backoff and fails identically every time.

Redaction itself is **fail-closed** — `sanitize()` builds a new object and never returns its input, so no partially-redacted value can escape. Only the error routing is wrong.

**Fix:** format outside the transport try, or tag the error, so a formatting failure is reported once and dropped instead of retried.

### A20 — MEDIUM: mTLS is reachable by exactly one route, and no test has ever executed it

Prompted by the Java package discovering its own mTLS path was unreachable dead code (2026-10-06). Ours is not dead, but it is unexercised, and two of the three ways a consumer would try to reach it fail.

| Route | Result |
|---|---|
| `BTP_LOGGING_SRV_KEY_CRED` + `BTP_LOGGING_SRV_AUTH_TYPE=mtls` | **works** — `MtlsAuthStrategy` selected, endpoint resolved from the service key, `https.Agent` built, request reaches OpenSSL |
| constructor option `{ authType: 'mtls' }` | strategy and agent are built, but `ingestMtlsEndpoint` defaults to `''` and has no env source, so `send()` throws `Cloud logging ingest endpoint is not configured` |
| discrete `BTP_LOGGING_*` env vars | impossible — `authType` is hard-coded `'basic'` in `getDefaultConfig()` and `BTP_LOGGING_SRV_AUTH_TYPE` is read **only** inside `fromServiceKey()` (`lib/ConfigManager.js:111`) |

Verified by running each route: the working one failed at `error:0480006C:PEM routines::no start line` with synthetic certificates, which is proof the wiring reaches TLS rather than stopping short of it.

Two defects fall out:

- **`README.MD:129` documents `BTP_LOGGING_SRV_AUTH_TYPE` as a general switch** (`allow: basic,mtls`). It is honoured on the service-key path only. A consumer configuring by discrete env vars who sets it is silently ignored — no warning, no error, logs simply keep flowing over basic auth.
- **There is no env variable for the mTLS endpoint at all.** `getDefaultConfig()` hard-codes `ingestMtlsEndpoint: ''`, so the discrete-env path could not do mTLS even if `authType` were settable there.

**No test executes it.** `test/CloudLoggingService.test.js:228` asserts `validateConfig` throws when certificates are missing, and `:239` asserts `fromServiceKey` maps the endpoint. Nothing constructs `MtlsAuthStrategy`, builds an agent, or sends through one. The validate test is precisely the negative-without-a-positive-twin pattern the Java package flagged in A19: it proves the guard rejects a bad config, and nothing proves a good config works. It has never run against a real mTLS endpoint either.

**Recommendation: neither delete nor promote — stop claiming it until a test exercises it.** The capability is two small classes and one working route, so deleting costs more than it saves. But `docs/Architecture.md` currently lists the mTLS lane as "yes, via `MtlsAuthStrategy`" alongside basic auth, which reads as equal support, and that is not evidence-backed. Mark it experimental, fix the two defects above, and add an offline test — a self-signed fixture and an HTTPS stub requiring client auth prove mTLS *works* without a real endpoint; only the ingest contract needs the real one.

Operational context, unchanged by any of this: ingest username and password do not expire, while Cloud Logging client certificates do. `README.MD:129` says the key is valid 180 days; the Java package's owner states 90. Either way mTLS imposes a rotation cycle on every consuming project for no current gain, which is why nobody has used it.

### A19 — notes from the Java package's adversarial review (2026-10-05)

Failure classes it hit that do **not** apply here, recorded so nobody re-derives them:

| Their finding | Status here |
|---|---|
| Reinit leaves the logger "started" but dead | clean — `LogUtils._initializeWithRetry()` assigns `cloudLogger` only after construction succeeds. Inverse weakness: once the three retries are exhausted it never re-initialises for the life of the process |
| Logging from inside the HTTP client re-enters the logger | clean today — axios does not log, and failure reports go to `console` directly, not back through the logger |
| Request context leaking across reused execution | clean today — no `AsyncLocalStorage`, no module-level correlation state; correlation rides on `req.headers` |
| Redaction fails open on malformed input | inverted — fails closed, see A18 |

The three "clean today" rows are clean only because the integration that creates the hazard does not exist yet. **Phase 5 design constraints**, carried from their empirical findings:

- A recursion guard must test the **call path and the source module independently** — they verified a name-based guard alone was insufficient, because the HTTP client spawned a thread it could not name that logged from outside the guard.
- Whatever sets per-request context must clear it on the **error** path, not only the success path. The question is not whether a clear exists but whether it runs when the handler throws.
- Reporting a cloud failure through `cds.log` would re-enter the logger that just failed; failure reporting must stay on a path that cannot route back.

Also adopted from them: the four-counter drop split (`droppedOnOverflow`, `droppedNonRetryable`, `droppedOnError`, `failedBatches`) with a required `queued == sent + dropped` invariant, for Phase 4; and the test rule that every "X never happens" assertion needs a paired test proving X happens when it should. Applying that rule here found one soft spot — `test/ProcessSafety.test.js`, "never ships the authorization header or cookie", passes because the raw request is dropped wholesale and would still pass with redaction disabled. It tests a real property but not the one its name claims.

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

#### Verified field contract against the Java package (2026-10-05)

Both columns are measured from bytes each package actually shipped, not read from code. The Java reference entry, verbatim:

```json
{"msg":"order 4711 processed","tenant_id":"acme-tenant","level":"INFO","user_id":"alice","cds_event":"READ","written_ts":"1791204311205820100","logger":"ROOT","correlation_id":"corr-4711","cds_service":"CatalogService","written_at":"2026-10-05T12:45:11.198Z","thread":"main","type":"log"}
```

| Field | Java (reference) | Node today | Resolution |
|---|---|---|---|
| `msg` | log message only, never decorated with exception text | identical — `message` is deleted after mapping, only `msg` ships | matches, no work |
| `level` | upper-case | upper-case | matches, no work |
| `correlation_id` | snake_case, top-level | `correlationId` | rename in 2.0.0 |
| `stacktrace` | **JSON array of strings**, one element per frame, leading tab preserved on `at` lines | `stack`, a single `\n`-joined string — and it is the *formatter's* call stack, not the error's (A15a) | rename **and** retype in 2.0.0; no working field is lost, since the current one is already wrong |
| `exception_type`, `exception_message` | separate top-level strings | **absent** — an `Error` in metadata serializes to `{}`, because `message` and `stack` are non-enumerable, so exception text is silently dropped today | adopt both in 2.0.0 |
| `type` | the constant `"log"`, always emitted by the SAP encoder | same key, incompatible values — `API` / `EVENT` / `BASE` from `LOG_TYPES` in `lib/LogUtils.js`, and absent entirely on the `createLogger()` path | **collision.** Both are strings so the index mapping survives, but a `type:log` dashboard filter excludes every Node entry. Proposed: `type` becomes `"log"` on both sides, our record kind moves to `record_kind` |
| `organization_name` | resolved from env/VCAP, not yet written to the payload — "will match", not "matches" | emitted, but carries the **subaccount ID**, mapped from `subaccount` which is then deleted | **collision pending confirmation.** If the Java value is the CF organization name, one key would hold two different concepts and we need two keys |
| `app_name` | resolved from env/VCAP, not yet written to the payload | emitted from the application name | same meaning; matches once Java emits it |
| `written_at` | ISO-8601 with `Z` | `timestamp`, same content | rename in 2.0.0 |
| `written_ts` | epoch **nanoseconds as a string** | absent | Node has no wall-clock nanosecond source; padding milliseconds with six zeros is precision theatre. Proposed Java-only unless the shared dashboard needs it from both |
| `tenant_id`, `user_id`, `cds_service`, `cds_event` | top-level MDC keys, absent when unsupplied | absent (no CAP integration yet) | Phase 5, under the omit-when-empty rule above |
| `environment`, `hostname`, `pid` | not emitted | emitted | additive, assumed harmless |

Every rename above is breaking and belongs in the single 2.0.0 batch, not in 1.1.0.

### B4 — No service-binding resolution, in a landscape built on service bindings

The deployment topology (`docs/Architecture.md`) has every application outside the entitlement-holding subaccount reaching the central instance through a **UPS or binding**. This package reads no binding at all — `grep VCAP` across `lib/`, `index.js` and `types/` returns nothing. Its three resolution sources are:

1. `userConfig` passed to the constructor
2. `BTP_LOGGING_SRV_KEY_CRED` — the whole service-key JSON in one env var, parsed by `ConfigManager._resolveBaseConfig()` and mapped by `fromServiceKey()`
3. discrete `BTP_LOGGING_*` env vars

So the prescribed deployment mechanism is the one path not supported. A consumer must lift the UPS credentials into an env var by hand, which in Cloud Foundry means either a manifest `env:` block holding the ingest password — defeating the point of the UPS, since the secret then sits in the manifest and in `cf env` output instead of only in the binding — or a bespoke startup script that parses `VCAP_SERVICES` for them.

The fix is small because the shapes already line up: a UPS is created from the service key (`cf cups CENTRAL-LOGGING -p '<service-key-json>'`), so its `credentials` object is exactly what `fromServiceKey()` already accepts. Add a resolution source that scans `VCAP_SERVICES` — `user-provided` entries **and** any managed `cloud-logging` binding — for a credentials object carrying `ingest-endpoint`, and feed it through the existing mapper. Additive and non-breaking: it sits below `userConfig` and above nothing, firing only where today the package finds no configuration at all.

Related finding from the Java package (2026-10-05): its resolver read only the managed `cloud-logging` label, so in this topology it silently resolved nothing for three of the four subaccounts. Ours cannot have that specific bug — it never looks at `VCAP_SERVICES` — but the user-visible symptom is the same, and worse here, because there is no binding path to be wrong about. Checked while reviewing this: the `console.error` on a malformed `BTP_LOGGING_SRV_KEY_CRED` does **not** echo credential content — verified against truncated, unquoted and trailing-garbage service-key JSON on Node 22, where the parse error carries no snippet of the input.

**Phase 2**, alongside the other configuration and boot work.

### B2 — No volume control of any kind

A loop that logs inside a request handler can saturate the ingest quota, and on a shared instance it evicts other applications' data through size-based curation. `grep` for any size cap across `lib/` and `types/` returns nothing: no truncation, no rate limit, no dedup, no per-field length cap.

The shape below is **agreed with the Java package** (2026-10-05) so the two behave identically where they can. Their implementation landed first; what follows is the semantics, plus the three places Node diverges.

**Three mechanisms, two of them off by default.** A logging library that silently discards entries nobody asked it to discard is a worse surprise than the volume it saves. Truncation is the exception, because it bounds memory rather than content.

| Mechanism | Default | Bounds |
|---|---|---|
| Truncation | **on** | memory and per-entry size |
| Byte budget | off | sustained throughput against the shared quota |
| Repeat suppression | off | a single statement flooding the index |

**1. Truncation.** Cap each top-level string value individually (`maxValueChars` 8192, `maxEntryChars` 32768) — never cut the serialized entry at an offset, because a malformed entry breaks the ingest parse for the whole batch and takes unrelated entries down with it. Never cut into a number or a nested structure; their length comes from their shape. Always mark the cut (`...[truncated N chars]`) — an entry silently halved reads as complete data. The hard-cap fallback produces a fresh valid object, not a fragment.

It must run **before the entry is buffered**, not at send time. A queue bounded by entry *count* makes no claim about memory: 10 000 entries × a 500 KB payload is 5 GB. This is the Java package's correction of its own README, and it lands here before Phase 3 writes the queue rather than after. In Node the rule reads "synchronously, in the caller's tick, before the first `await`" — which `format()` already satisfies, since it runs before `await this.transport.send()` and `sanitize()` already returns a deep copy. That also closes the caller-mutation window: the consumer cannot mutate the metadata object between the call and serialization.

**2. Byte budget.** Token bucket over **bytes**, not lines — volume is what is paid for and retained. Burst capacity 10× the sustained rate; refill continuously from elapsed time, and **only advance the clock when the refill is non-zero**, or a fast caller discards the sub-byte fraction on every call and the bucket never refills (a real bug on their side, whose first test passed while measuring nothing).

The decision that matters more than the algorithm: **shed by level, least important first — `DEBUG` → `INFO` → `WARN`, and `ERROR` is never shed.** Entries burst exactly when something is going wrong, so a plain bucket preferentially discards the evidence explaining the incident. `ERROR` may overdraw the bucket; later low-severity entries repay it. Count each shed level separately.

**3. Repeat suppression.** LRU 100, 5 repetitions, bounded cache so a million distinct statements cannot grow it into a leak, an evicted statement starts counting again rather than being silenced for process life, and the suppressed count is reported — fifty thousand copies are less diagnostic than "this fired fifty thousand times". Suppression applies **only on the path that costs money**; stdout stays complete for an operator shelled into the container.

**The Node divergence that cannot be papered over.** Logback keys the cache on the *unsubstituted message pattern* — `log.warn("order {} rejected", id)` is one statement regardless of the id. Node has no pattern at our boundary: by the time `logger.info(\`order ${id} rejected\`)` reaches us the template is already a finished string, so keying on what we receive sees every id as a distinct statement and suppresses nothing. The trick does not transfer. Options, in order of preference:

1. Key on a **normalized** form of the message — digits, UUIDs and hex runs replaced by placeholders — accepting that normalization is heuristic and will occasionally merge two genuinely different statements.
2. Accept an explicit `messageKey` in metadata, used as the cache key when present. Exact, but only for consumers who opt in.
3. Skip suppression in the Node package and rely on the byte budget alone.

**Decided (2026-10-06): option 1 plus option 2 as an override.** Normalize the message — digits, UUIDs and hex runs only, nothing clever — and use an explicit `messageKey` from metadata as the key when the consumer supplies one. Option 3 concedes too much: the dominant noise source in Node *is* a templated message in a loop, so without normalization suppression does nothing at all.

Two conditions, both from the Java package and both adopted:

- **Name the counter `suppressedSimilar`, not `suppressedDuplicates`.** Theirs means "this exact statement fired N times"; ours means "this statement *shape* fired N times, with a heuristic deciding what a shape is". Different things deserve different names, and the name is read at the point of use while a doc is not.
- **Put the normalized key in the suppression summary**, e.g. `suppressed 48213 of "order <num> rejected"`. It makes the heuristic auditable — an operator can see whether the merge was right, which a bare count never shows.

The earlier concern that an operator would compare the two packages' numbers side by side was overweighted: their counter is exposed per application on an actuator endpoint, not shipped as a log field, so nobody reads both in one index.

**Units: characters for truncation, bytes for the budget — deliberately different, because they bound different resources.** Truncation bounds heap, and a JS string's memory cost tracks its UTF-16 length, so caps in characters are the correct unit there. The budget bounds egress, which is billed and retained in bytes. The mismatch is intentional and documented so it does not read as an oversight; the Java package reached the same split from the JVM side.

**Three Node-specific hazards**, all instances of `coding.C5`:

- A byte budget must measure **bytes**, not `str.length`, which counts UTF-16 units. The gap depends entirely on the content, so size it against the content the landscape actually carries — English and German — rather than the worst case. Measured ratios: plain English and plain German **1.000**, umlaut-dense German **1.10**, a realistic whole German JSON entry **1.04**, Vietnamese **1.42**. So on today's data `.length` under-counts by a few percent, not by half. The fix is still right, but on a correctness argument rather than an urgent one: free text reaching a log line — customer names, addresses, supplier records out of the backend — is not confined to the language the application was written in, and a budget that is only accidentally close on today's data drifts the moment the data changes.
- Truncation must cut on codepoint boundaries. `'ab🚀cd'.slice(0, 3)` yields a lone surrogate; `[...s].slice(0, 3).join('')` is correct.
- **Charge the budget against the serialized form, not the raw string.** JSON escaping changes the byte count and `Buffer.byteLength(raw)` therefore disagrees with the wire. Measured overheads: a real stack trace +2.9%, a quote-heavy string (embedded JSON, SQL) +29%, `a\tb\\c` +75%. The divergence is largest on exactly the payloads that threaten the budget. Serialize once, charge the result, send the same bytes — not least because serializing twice doubles the CPU on a per-log-call path.

A related correctness note rather than a volume one: an unpaired surrogate costs **1 byte** on the Java side, because the JDK encoder substitutes `?`. In Node it is neither 1 nor the 3 that `Buffer.byteLength` reports — `JSON.stringify('\ud83d')` emits the six-character escape `\ud83d`, so the wire carries 6 bytes inside the quotes. Another reason the count has to come from the serialized form.

**Counters stay separate from the shipper's drop counters** (A16/B3): "we chose not to send this" and "we could not send this" are different problems with different fixes. `truncatedEntries`, `shedDebug`, `shedInfo`, `shedWarn`, `budgetBytesAvailable`, `suppressedDuplicates`.

One implementation note for Phase 7: truncation walks every string in the entry, and `sanitize()` already walks the same tree. Fold truncation into that traversal rather than adding a second full pass.

**Reference point, measured by the Java package:** SAP's own `cf-java-logging-support` ships exactly one knob — `JsonEncoder.setMaxStacktraceSize`, default 56320 bytes, truncating head-and-tail so the exception and the `Caused by` both survive. No rate limiting, sampling or dedup anywhere in it.

### B3 — No health/diagnostics surface worth the name

`getHealthStatus()` returns `isHealthy`, `retryCount` and endpoints. It cannot answer the question operators actually ask: are logs arriving? Add counters — sent, failed, dropped, queue depth, last error, last success timestamp.

## C. Remediation plan

Ordered by risk removed per unit of work, not by section number.

| Phase | Content | Findings closed | Breaking? |
|---|---|---|---|
| **0** ✅ | Test net: `LogUtils` and `sanitize` characterization tests against v1.0.8 — both files had none. `ConfigManager` and `Transport` coverage deferred to Phase 2, which is where they are first touched | A15f (partial) | no |
| **1** ✅ | Safety fixes, shipped as `1.1.0`: stop calling `removeAllListeners`; register process listeners once per process; keep the raw request out of the payload; preserve non-request metadata keyed `req`; move `sanitize()` into `LogFormatter` behind a `sanitizeMetadata` opt-out; replace the empty catch with throttled reporting. The `preventUncaughtExceptions` default flip is **deferred to 2.0.0** and marked deprecated | A1 (non-breaking half), A2, A5, A6 | **no** |
| **2** | Dependency hygiene: drop `https`; `winston` to optional peer + lazy require; drop `uuid` for `crypto.randomUUID()`; `engines >= 18`; lazy `LogUtils` singleton; resolve configuration from `VCAP_SERVICES` bindings | A4, A7, A8, A14, A15b, B4 | yes — peer dep |
| **3** | Outbound queue: single bounded queue with per-entry retry, size/interval batching, drain on `shutdown()`, formatting failures separated from transport failures | A3, A11, A12, A18 | no |
| **4** | Operability: `setLevel()` on both classes, real `setLoggingLevel()`, status-class handling (2xx success / 4xx drop / 5xx retry), the four drop counters and their sum invariant in `getHealthStatus()`, throttled reporting while retrying, neutral defaults, console only on fallback | A9, A10, A13, A16, A17, B3 | yes — A10 changes output volume |
| **5** | CAP integration as a separate entry point, with its own tests and docs | B1 | no — additive |
| **6** | Polish: real error stacks, remove the redundant enrichment, expose `fatal`, harden the `res.end` patch | A15a, A15c, A15d, A15e | no |
| **7** | Volume control: truncation (on), byte budget and repeat suppression (off), per-mechanism counters | B2 | no |

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
