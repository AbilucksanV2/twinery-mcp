# Data Model: HTTP Transport Mode

**Feature**: 006-http-transport-mode
**Date**: 2026-05-04

This feature is transport-only — no persistent or in-memory data structures
change shape. The active story, dirty flag, image-placeholder list, and
clarification map all stay exactly as v0.4 defined them. The only new
runtime data lives in CLI argument parsing and the HTTP listener handle.

## New entities

### `RunConfig` (server-internal)

Resolved CLI configuration handed from `parseArgs()` to `main()`.

| Field | Type | Required | Source | Validation |
|-------|------|----------|--------|------------|
| `transport` | `"stdio" \| "http"` | yes | `--transport`; default `"stdio"` | exact match against the two allowed values; otherwise throw |
| `host` | `string` | yes | `--host`; default `"127.0.0.1"` | non-empty string; passed verbatim to `node:http` `listen()` |
| `port` | `number` | yes | `--port`; default `4173` | integer in `[0, 65535]`; `0` means OS-assigned |

Lifecycle: constructed at startup, immutable for the life of the process.

**Invariants**:
- `host` and `port` are present even when `transport === "stdio"`. They are
  ignored by the stdio path; storing them anyway keeps the shape uniform
  for tests and logging.
- `parseArgs` throws with a message naming the offending flag and the
  expected format on any validation failure. `main()` catches and prints
  help text, then exits 2 (FR-007).

### `HttpHandle` (server-internal)

Returned by `startHttpServer()` to the caller. Captures the listening
state and provides clean shutdown.

| Field | Type | Notes |
|-------|------|-------|
| `url` | `string` | Full URL the client connects to, e.g. `http://127.0.0.1:4173/mcp`. Logged in the startup banner. |
| `port` | `number` | Resolved port. Equals `cfg.port` unless `cfg.port === 0`, in which case it's the OS-assigned port. |
| `close` | `() => Promise<void>` | Cleanly shuts down the listener (closes existing connections, stops accepting new ones). Called from SIGTERM / SIGINT handlers. |

Lifecycle: created on `startHttpServer()` resolve, lives until `close()` is
called or the process exits.

## Unchanged entities (referenced for completeness)

The following entities defined in v0.1–v0.4 stay exactly as they are. Tools
do not need to know which transport delivered a call.

- **Active Story** (`src/server/state.ts` — extended in v0.4):
  `{ story, slug, format, lastSavedPath, lastSavedAt, dirty,
  imagePlaceholders }`. Transport-agnostic.
- **Tool registry** (`src/guide/registry.ts`): list of 15 tools with
  metadata. Read identically by both transports.
- **Clarification map** (`src/server/clarification.ts`): in-memory map of
  `clarification_id → { tool, replay }`. Per-process; survives across
  HTTP requests within the same process lifetime.
- **Image placeholder records**: tracked on the active story; transport-
  agnostic.

## Relationships

```text
RunConfig 1───1 transport choice (stdio | http)
RunConfig 1───1 HttpHandle  (only when transport === "http")
HttpHandle 1───1 node:http Server (wrapped)
HttpHandle 1───1 StreamableHTTPServerTransport (wrapped)
McpServer 1───* RegisteredTool   (15 tools, unchanged)
```

No cross-cutting persistence is added. Disk artifacts written by
`save_story` and read by `load_story` are unchanged.

## State transitions

There are no new state machines. The only transitions worth naming:

- **`parseArgs(argv)`**: pure function. Either returns a `RunConfig` or
  throws. No side effects, no state.
- **`startHttpServer(...)`**: creates a `node:http` server, binds it,
  resolves with an `HttpHandle`. The transition `unbound → listening` is
  atomic from the caller's perspective; failures are reported via
  rejection.
- **Process shutdown**: SIGINT or SIGTERM → handler calls `handle.close()`
  → in-flight requests complete or time out → process exits 0. A crash
  during a request results in exit 1 (FR-014 implied via process default).

## Validation rules summary

Pulled together for the test plan:

| Input | Valid form | Invalid examples | Behaviour on invalid |
|---|---|---|---|
| `--transport <x>` | `stdio` or `http` | `http2`, empty, missing value | throw with message "--transport must be 'stdio' or 'http' (got '...')" |
| `--port <n>` | integer 0–65535 | `abc`, `-1`, `99999` | throw with message "--port must be an integer 0–65535 (got '...')" |
| `--host <s>` | non-empty string | empty, missing value | throw with message "--host requires a value" |
| Unknown flag | n/a | `--bogus` | throw with message "unknown flag: --bogus" |
| `--help` | n/a (no value) | n/a | print help text, exit 0 |
