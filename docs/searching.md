# Finding Your Logs

How to search entries this package ships, in the SAP Cloud Logging OpenSearch dashboard. Field names and platform behaviour below were measured against a real instance, not inferred from source.

## Opening the dashboard

The dashboard URL and its credentials come from the Cloud Logging service key, as `dashboards-endpoint`, `dashboards-username` and `dashboards-password` — the same key that provides your ingest credentials.

Open **Discover** and select the index pattern **`logs-json-*`**.

## Two things that waste the most time

**The time range defaults to the last 15 minutes.** An entry written an hour ago is not missing — it is outside the window. This is the most common "my logs aren't arriving" false alarm. Widen the range before concluding anything.

**Use the search box, not the "Add filter" dropdown.** The dropdown lists only fields already *mapped* in the index, so a field nobody has written yet simply does not appear. "Field missing from the dropdown" and "log missing" look identical from there. The search box queries the documents themselves and will find a field the dropdown cannot offer you.

## Query syntax

The search box uses DQL. A bare word searches the whole document; `field: value` searches one field.

```
order submitted                                     any entry containing both words anywhere
msg: "order submitted"                              the message field specifically
app_name: "my-service"
level: "ERROR"
app_name: "my-service" and level: "ERROR"
app_name: "my-service" and (level: "ERROR" or level: "WARN") and not msg: "health"
correlation_id: "3f8a1c42-9b07-4d6e-a5f1-2c8e7b40d913"
hostname: "api-*"                                   wildcards work on values
timestamp >= "2026-10-06T00:00:00Z" and level: "ERROR"    ranges work on date fields
```

`and`, `or`, `not` and parentheses all work.

**The one worth memorising** is `correlation_id`. One request, end to end, across every service that logged it:

```
correlation_id: "<the id from the failing request>"
```

## Fields this package ships

| Field | Notes |
|---|---|
| `msg` | the log message. `message` is removed after field mapping, so search `msg` |
| `level` | upper-case: `DEBUG` `INFO` `WARN` `ERROR` `FATAL` |
| `timestamp` | ISO-8601, set by the client. Date-mapped, so ranges work |
| `app_name` | from `BTP_APPLICATION_NAME` |
| `organization_name` | from `BTP_SUBACCOUNT_ID` |
| `correlation_id` | set when you pass `correlationId` or `requestId` in metadata |
| `correlationId` | **deprecated**, still emitted for compatibility — see below |
| `environment`, `hostname`, `pid` | added automatically. `pid` is numeric |
| `request` | the safe subset of an HTTP request, when the Express middleware is used |
| anything else | your own metadata keys, passed through as-is |

### Fields the platform adds

| Field | Notes |
|---|---|
| `@timestamp` | added on arrival, and **what the dashboard sorts on by default** — not your `timestamp`. The two differ by the delivery delay, normally sub-second. If ordering matters more than arrival time, sort explicitly |
| `trace_id` | derived from `correlation_id`, see below |
| `_cls_parse_ts` | platform parse time |

## `correlation_id` and tracing

Cloud Logging reads `correlation_id` **semantically**. It strips the hyphens and derives a W3C trace-context `trace_id`:

```
correlation_id : 3f8a1c42-9b07-4d6e-a5f1-2c8e7b40d913
trace_id       : 3f8a1c429b074d6ea5f12c8e7b40d913      <- derived, nothing sends it
```

Both forms are searchable, so either spelling of the id finds the entry.

**The same value written under `correlationId` is stored but not recognised.** It receives no `trace_id` and cannot join a trace. Versions before 1.1.0 emitted only the camelCase spelling, so entries from those versions are not traceable — this is why the field was added, and why `correlationId` must not be "tidied" back into place. It remains emitted for compatibility with existing dashboards and is removed in 2.0.0.

## A warning about `type`

**Do not use `type` to narrow a dashboard.** The field has no owner. Measured across one production index on 2026-10-06, it held five distinct values: three that this package writes through its `logApi()` / `logEvent()` / `logBase()` helpers, one constant written by SAP's own Java encoder, and one that came from neither — a consumer had passed their own value as ordinary metadata and the formatter passed it straight through.

The consequence is that any `type:` filter silently excludes entries you meant to include, and the proportions are not intuitive: in that index the SAP constant accounted for well under one percent of all entries. **Filter on `app_name` instead.** A later release moves this package's own values to a different field, but that alone will not make `type` trustworthy, because nothing stops the next consumer writing a sixth value into it.

## When nothing comes back

In order of how cheap each is to check:

1. **The time range.** Still the most common cause.
2. **Search on the message rather than a field.** A field that has never been written is not in the mapping, so a `field:` query against it returns nothing even when the entry exists. A bare-word search covers the whole document.
3. **Widen to `app_name:` with no other term.** Entries come back → the narrower query was wrong. Nothing comes back → the problem is upstream of the index.
4. **Check whether the application is shipping at all.** This is the step that currently cannot be answered from inside the package: an empty result looks identical whether the application is simply quiet, its credentials were revoked, its configuration never resolved, or the query is wrong. `getHealthStatus()` exists but does not settle it — it reports `healthy: true` even while every entry is being rejected, because a 4xx response is presently counted as a successful send. Treat it as unreliable. A real delivery readout — counters that separate "we chose not to send this" from "we could not send this", and a flag for whether any configuration resolved at all — is planned; until it lands, confirm delivery by writing an entry with a known `correlation_id` and searching for exactly that id.

## A note on shared instances

Several applications across several subaccounts commonly ship into one Cloud Logging instance. Two consequences when searching:

- `organization_name` is the only thing separating sources, and it carries whatever each application was configured with. Prefer a prefix match such as `organization_name: account_*` over listing exact values — an equality list silently misses any value added later, including entries from a developer machine configured by hand.
- If `BTP_SUBACCOUNT_ID` or `BTP_APPLICATION_NAME` is left unset, the entry ships with a placeholder default and becomes indistinguishable from every other unconfigured application. Set both per deployment.
