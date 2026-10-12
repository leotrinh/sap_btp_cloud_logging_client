# BTP Cloud Logging Field Mapping

## Overview

Field mapping renames the package's internal field names to the ones SAP BTP Cloud Logging and the sibling Java package both use, so entries from either source are queried the same way.

## Field mapping

Controlled by `enableSAPFieldMapping` (default `true`). The original field is removed afterwards unless `removeOriginalFieldsAfterMapping: false`.

| Internal field | Shipped as | Description |
|---|---|---|
| `message` | `msg` | the log message |
| `application` | `app_name` | application name |
| `subaccount` | `organization_name` | subaccount identifier |

## Fields renamed in 2.0.0

These are not part of the mapping above — they are the names the formatter writes directly, and they changed in `2.0.0`:

| Was | Now | Note |
|---|---|---|
| `timestamp` | `written_at` | when the client produced the entry |
| `correlationId` | `correlation_id` | the platform derives `trace_id` from this name only |
| `request.userAgent` | `request.user_agent` | |
| `request.correlationId` | `request.correlation_id` | |
| `type: "API"/"EVENT"/"BASE"` | `record_kind: "api"/"event"/"base"` | `type` is now reserved to the constant `"log"` |

Input is unchanged: `{ correlationId }`, `{ correlation_id }` and `{ requestId }` all produce `correlation_id`.

## Fields the platform adds

Never send these — Cloud Logging writes them on arrival:

| Field | Meaning |
|---|---|
| `@timestamp` | arrival time, and what the dashboard sorts on by default |
| `trace_id` | derived from `correlation_id` with the hyphens stripped |
| `_cls_parse_ts` | platform parse time |

## Configuration

```javascript
const logger = createLogger({
  applicationName: 'MyApp',
  enableSAPFieldMapping: true,              // default: true
  removeOriginalFieldsAfterMapping: true    // default: true
});
```

## Behaviour

- Backward compatible within a major version — mapping adds the standard name and, by default, drops the internal one.
- Custom metadata is preserved untouched, except for keys the formatter consumes (`correlationId`, `correlation_id`, `requestId`, `req`, `type`).
- Works identically on both entry points, `createLogger()` and `logUtils`.

See [searching.md](searching.md) for what each field looks like in the dashboard.
