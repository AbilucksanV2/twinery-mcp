---
description: "Spec for feature 009 — HTTP listener session-recovery hygiene"
---

# Feature 009 — HTTP listener session-recovery hygiene (bug fix)

**Branch**: `009-http-session-recovery` | **Date**: 2026-05-04 | **Type**: bug fix on top of feature 006

## Why

Feature 006 (HTTP transport) introduced per-session `StreamableHTTPServerTransport`s
keyed by `mcp-session-id`. That fix correctly handles the "second client
arrives at a long-lived server" case. It does **not** handle the inverse:
a client (e.g. `mcp-remote` bridging Claude Desktop or claude.ai web Cowork)
holding a session id from before a server restart, then sending a tool
call. Today the server replies:

```
400 Bad Request: missing or unknown session id, and body is not an initialize request
```

— same response as the genuine "no session id provided + not initialize"
case. The client UX surfaces this as "Tool result could not be submitted.
The request may have expired." (observed in claude.ai web Cowork
2026-05-04).

Per the MCP Streamable-HTTP spec, the canonical signal for a stale
session id is **HTTP 404 Not Found**. Returning 400 conflates two
distinct error categories and gives well-behaved clients no way to tell
the difference.

## What changes

`src/server/http_listener.ts` distinguishes:

1. **Session id provided + unknown to us** → **404 Not Found** with a
   JSON-RPC error body indicating the session is gone.
2. **No session id and body is not an initialize request** → 400 (kept,
   unchanged — this is a genuinely malformed request).

Plus one smoke regression test in `src/smoke_cli.ts` that POSTs with a
synthetic stale session id and asserts the 404 response.

## What does NOT change

- `mcp-remote` does not auto-reinitialize on 404 today (verified by
  reading its source); that's the client's call. This change is
  spec-compliance plumbing — clients that DO auto-reinitialize will now
  recover from a server restart cleanly.
- For the user-visible dev loop today: after restarting the server
  during an active session, restarting Claude Desktop (or refreshing
  Cowork) is still the manual workaround. Documented in README under
  the HTTP run-mode section.

## Acceptance criteria

- POST `/mcp` with header `mcp-session-id: <unknown>` and a
  non-initialize body returns **404** with a JSON-RPC error body.
- POST `/mcp` with no `mcp-session-id` header and a non-initialize
  body still returns **400** (existing behavior preserved).
- POST `/mcp` with no `mcp-session-id` header and an `initialize` body
  still creates a fresh session and returns 200 (existing behavior
  preserved).
- New smoke section `T013b` in `smoke_cli.ts` exercises the 404 path.
- `npm run smoke` (and CI) stay green.

## Out of scope

- Auto-reinitialization on the client side — owned by the MCP SDK /
  `mcp-remote` upstream. Tracked as a future follow-up if and when that
  capability lands and we want to lean on it.
- A full "session resume" protocol where the server somehow recovers a
  prior session's state. We don't persist session state; per the
  v1 single-active-story model, restarting just means the server starts
  empty. That's expected.
