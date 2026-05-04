# Phase 0 Research: HTTP Transport Mode

**Feature**: 006-http-transport-mode
**Date**: 2026-05-04
**Inputs**: [spec.md](./spec.md), [plan.md](./plan.md),
[../../.specify/memory/constitution.md](../../.specify/memory/constitution.md).

This document is a more detailed companion to [`plan.md` § Phase 0 — Research
notes](./plan.md). The plan has the brief versions of these decisions; this
file expands the rationale where it matters and resolves the SDK-API
specifics that the plan references in passing.

---

## R1 — SDK transport class and import path

**Decision**: Use `StreamableHTTPServerTransport` from
`@modelcontextprotocol/sdk/server/streamableHttp.js` (the Node-specific
wrapper). Its constructor takes:

```ts
new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),  // see R2
  enableJsonResponse: false,               // default — streaming on
})
```

The instance exposes `handleRequest(req, res, body)` accepting Node's
`IncomingMessage` and `ServerResponse`. We plumb that into a `node:http`
server in `src/server/http_listener.ts`.

**Rationale**:
- Modern (post-SSE) MCP HTTP transport; matches the user's stated intent
  ("streamable HTTP").
- Node-specific wrapper accepts native `IncomingMessage` / `ServerResponse`
  — one fewer translation layer than the web-standard variant.
- Already shipped in the SDK version on `package.json` (verified via
  `node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.d.ts`).

**Alternatives considered**:
- *Legacy `SSEServerTransport`*: superseded by Streamable HTTP. Rejected.
- *Custom HTTP wrapper around the bare `Transport` interface*: duplicates
  SDK logic; Constitution Principle II violation in spirit. Rejected.
- *`WebStandardStreamableHTTPServerTransport`* (for Cloudflare Workers /
  Deno / Bun): rejected for v1 — target is Node, web-standard is one extra
  translation.

---

## R2 — Session model: stateful single-session

**Decision**: Pass `sessionIdGenerator: () => randomUUID()` so the SDK
mints a session id on the first request and rejects mismatched session ids
on subsequent requests within the same connection lifetime.

**Rationale**:
- The MCP server still holds a single active story in memory (Constitution
  single-story model). A stateful single-session matches that shape — the
  session-id ↔ active-story binding is implicit and "true by construction"
  rather than enforced separately.
- Stateless mode (`sessionIdGenerator: undefined`) is functionally
  equivalent given the in-memory state but makes the implicit shared-state
  guarantee invisible to clients. Stateful makes it explicit.
- Multi-session with per-session state is the F-T3-MULTI feature
  (multi-story workspace). Out of scope for this feature.

**Alternatives considered**:
- *Stateless*: rejected — see above.
- *Multi-session*: rejected — different feature.

---

## R3 — CLI argument parsing (no new dependency)

**Decision**: Hand-rolled `parseArgs()` in `src/server/cli.ts`. Iterates
`process.argv.slice(2)`, recognises `--transport`, `--port`, `--host`,
`--help`. ~50 lines including error messages.

**Rationale**:
- Three flags. A 50-line parser is shorter than a configured `commander` /
  `yargs` setup, and avoids introducing a new runtime dep (Constitution
  Principle V — keep the dependency tree lean).
- Tailored error messages: "--transport must be 'stdio' or 'http' (got
  'http2')" beats `commander`'s generic "Unknown option" wording.
- `node:util.parseArgs` (built-in, Node 18.3+) is a viable alternative but
  produces the same generic errors as third-party parsers. Hand-rolling
  costs ~10 lines extra to get specificity worth having.

**Alternatives considered**:
- *`node:util.parseArgs`*: viable, error messages too generic for v1's UX
  goals (FR-007 wants "clear stderr message naming the valid values or
  expected format"). Could revisit if surface grows.
- *`commander` / `yargs`*: rejected — too much surface for three flags.

---

## R4 — Default port 4173

**Decision**: `--port 4173` is the default. Override with `--port <n>`.
`--port 0` means OS-assigned (used by parallel test runs).

**Rationale**:
- 4173 is unused by typical dev tooling on a developer machine. It's
  Vite's preview port, but the MCP server is unlikely to clash with a
  preview server in the same shell session — and if it does, `--port`
  exists.
- Discoverability beats randomness: a maintainer who restarts the server
  shouldn't have to re-read the banner each time to know where it's
  bound.
- `--port 0` exists so the smoke runner can run multiple server instances
  in parallel without collision.

**Alternatives considered**:
- *3000 / 8080*: too commonly bound by other tools.
- *Random by default*: rejected for the discoverability reason above.
- *MCP-specific port like 31415*: cute, but not memorable enough to be
  better than a "boring" choice.

---

## R5 — Default host loopback + warning on override

**Decision**: Default `--host 127.0.0.1`. Any non-loopback override
(`--host 0.0.0.0`, `--host <lan-ip>`, etc.) triggers a single-line stderr
warning at startup naming the host and noting that the server is now
reachable beyond loopback.

**Rationale**:
- The dev-iteration motivation only needs loopback. Default-loopback makes
  a careless `npm run start -- --transport http` safe.
- Anything non-loopback is a deliberate opt-in. No auth in v1 (per spec
  Assumptions), so the warning is the soft guard.
- Hard-blocking non-loopback would frustrate legitimate use cases like
  container/VM dev environments where the loopback the user means is the
  container's, not the host's.

**Alternatives considered**:
- *Hard-block non-loopback*: rejected; container-friendly cases exist.
- *Silent allow*: rejected; loses the chance to notice an accidental
  override.
- *Require an explicit `--allow-non-loopback` flag*: rejected — too
  ceremonial for a dev-targeted feature.

---

## R6 — Smoke runner shape (parameterise existing)

**Decision**: Parameterise `smoke.ts` via a `SMOKE_TRANSPORT` env var (or
argv). Existing 24 sections call through a thin adapter; the adapter
returns an in-process tool runner for stdio (current behaviour) or a real
SDK HTTP client for http. `package.json` adds `smoke:stdio`, `smoke:http`,
and a top-level `smoke` that runs both.

**Rationale**:
- The 24 test sections are identical in intent across transports; copying
  them into a separate file invites drift.
- Stdio in-process keeps fast feedback; HTTP exercises the wire format
  end-to-end.

**Alternatives considered**:
- *Two separate files*: rejected — diff drift risk.
- *Move smoke into vitest*: out of scope; tracked under cross-cutting
  infrastructure (`F-CI`).

---

## Summary of resolved unknowns

The spec deliberately defaulted these (no NEEDS CLARIFICATION markers).
After this Phase 0 pass:

| Topic | Resolved as | Source |
|---|---|---|
| Transport class | `StreamableHTTPServerTransport` (Node wrapper) | R1 |
| Session model | Stateful single-session via `sessionIdGenerator` | R2 |
| CLI parser | Hand-rolled `parseArgs()` in `src/server/cli.ts` | R3 |
| Default port | 4173 | R4 |
| Default host | `127.0.0.1` with warning on override | R5 |
| Smoke shape | Parameterised single file | R6 |

No items remain blocked.
