# Implementation Plan: HTTP Transport Mode — Connect-Once Dev Loop

**Branch**: `006-http-transport-mode` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-http-transport-mode/spec.md`

## Summary

Add a CLI-flag-selectable Streamable-HTTP transport to the v0.4 server so
maintainers can iterate on server code without reloading the MCP client.
Stdio remains the default (zero behaviour change for existing users); HTTP
mode is opt-in via `--transport http` plus optional `--port` / `--host`. The
transport selector lives in `src/server/index.ts` only — every registered
tool, resource, and clarification path is unchanged. The MCP SDK already
ships `StreamableHTTPServerTransport` for Node.js; this feature consumes it
rather than rolling a custom HTTP layer. Net new dependencies: zero.

## Technical Context

**Language/Version**: Unchanged — TypeScript 5.4+ on Node.js 20 LTS.
**Primary Dependencies**: Unchanged — `@modelcontextprotocol/sdk` (ships
`StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`),
`extwee`, `zod`. Stdlib `node:http` for the HTTP listener.
**Storage**: Unchanged — single active story in memory (Constitution).
**Testing**: `npm run smoke` extended to cover both transports — either as one
runner that boots in each mode in turn, or as parallel `smoke:stdio` /
`smoke:http` scripts. The test client in HTTP mode uses the SDK's
`StreamableHTTPClientTransport` so the wire-format is exercised end-to-end.
**Target Platform**: Unchanged — Node.js 20 LTS, cross-platform.
**Project Type**: Unchanged — single TypeScript package with one server
binary.
**Performance Goals**: First tool call after a fresh client connect completes
in ≤ 5 s on a developer laptop (matches SC-004). Smoke test for both
transports completes in ≤ 60 s wall-clock total (SC-005).
**Constraints**: Constitution principles unchanged. Streamable HTTP is the
modern MCP HTTP transport — the legacy SSE transport is explicitly out of
scope. Default bind 127.0.0.1 (loopback) so a careless launch can't expose
the server beyond the maintainer's machine.
**Scale/Scope**: Same as v0.4 — single active story, one or two concurrent
clients in practice during dev iteration. No multi-story workspace.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| **I. Spec-Faithful Format Fidelity (NON-NEGOTIABLE)** | ✅ | This feature is transport-only; format parsing/emit is untouched (still extwee). |
| **II. MCP-Native & Model-Agnostic** | ✅ | The HTTP transport comes from the official MCP SDK (`StreamableHTTPServerTransport`). No custom HTTP wire layer; no LLM-provider SDK introduced. The CLI flag dispatches between two SDK-provided transports — both are first-class MCP citizens. |
| **III. Graph-Integrity First (NON-NEGOTIABLE)** | ✅ | Tool surface unchanged. The dirty-flag, clarification, and link-rewrite invariants are all enforced inside tool handlers, which run identically over either transport. |
| **IV. Native-Twine Export Parity** | ✅ | Round-trip behaviour is unaffected — the same `save_story` / `load_story` paths run regardless of transport. |
| **V. Open-Source Licensing Discipline** | ✅ | No new dependencies. SDK and `node:http` are already in the dependency tree under permissive licenses. |

**Result**: No violations. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-http-transport-mode/
├── plan.md
├── spec.md
├── research.md         (Phase 0)
├── data-model.md       (Phase 1)
├── quickstart.md       (Phase 1)
├── contracts/
│   └── cli-flags.json  (Phase 1 — CLI surface contract)
└── checklists/
    └── requirements.md
```

### Source Code (changes from v0.4 baseline)

```text
src/
├── server/
│   ├── index.ts                              (modified)
│   │   # parseCli() reads --transport / --port / --host from process.argv
│   │   # buildServer() unchanged
│   │   # main() now dispatches: stdio (default) → StdioServerTransport
│   │   #                       http            → StreamableHTTPServerTransport
│   │   #                                          + node:http listener
│   │   # startup banner prints transport, host, port, and (for http)
│   │   # the connection URL on stderr
│   ├── cli.ts                                (new)
│   │   # parseArgs() — pure function consuming process.argv.slice(2);
│   │   # returns { transport: "stdio"|"http", host, port } or throws
│   │   # with a clear message on bad input. Unit-tested independently.
│   └── http_listener.ts                      (new)
│       # createHttpServer(transport, host, port): wires the SDK transport's
│       # handleRequest() into a node:http server; returns the Server so
│       # callers can wait on listen, log the bound port (for --port 0),
│       # and close on shutdown.
└── smoke.ts                                  (modified — parameterised over
                                                transport, or split into
                                                stdio + http variants)

package.json                                  (modified)
  # adds smoke:stdio (current behaviour) and smoke:http; the bare
  # `smoke` script runs both in sequence
```

**Structure Decision**: Same single-package layout as v0.4. The new files
(`src/server/cli.ts`, `src/server/http_listener.ts`) keep responsibilities
separated so `index.ts` stays small. `smoke.ts` either moves to a
parameterised runner that takes a transport argument or splits into
`smoke.ts` + `smoke_http.ts` — Phase 1 design picks the structure.

## Phase 0 — Research notes

Five micro-decisions worth recording. None of them are NEEDS CLARIFICATION
(the spec deliberately defaulted them); they're documented here so the
implementation has a single referent.

### R1 — SDK transport class and import path

**Decision**: Use `StreamableHTTPServerTransport` from
`@modelcontextprotocol/sdk/server/streamableHttp.js`. Confirmed present in
the v1.29 SDK already in `package.json`. Constructor takes
`{ sessionIdGenerator, enableJsonResponse, ... }`; instance exposes
`handleRequest(req, res, body)` that we plumb into a `node:http` server.

**Rationale**: This is the SDK's modern HTTP transport (post-SSE spec).
Web-runtime variants (`WebStandardStreamableHTTPServerTransport` for
Cloudflare Workers / Deno) exist but our target is Node, so the
Node-specific wrapper is the right choice — accepts `IncomingMessage` and
`ServerResponse` directly.

**Alternatives considered**:
- *Legacy `SSEServerTransport`*: rejected — superseded by Streamable HTTP
  in newer MCP spec revisions; Constitution principle II prefers current
  spec primitives.
- *Custom HTTP wrapper around the bare `Transport` interface*: rejected
  — would duplicate logic the SDK already maintains and is a Constitution
  principle II violation in spirit.
- *Web-standard variant*: rejected for v1 — no need to leave Node, and the
  Node wrapper is one fewer translation layer.

### R2 — Session model: stateless vs stateful

**Decision**: Stateful single-session for v1. Pass
`sessionIdGenerator: () => randomUUID()` so the SDK assigns a session id
the first time a client hits the endpoint and rejects mismatched session
ids on subsequent requests in the same flight.

**Rationale**: The MCP server still holds a single active story in memory
(Constitution single-story model). A stateful single-session matches that
shape — the active story is implicitly the "session" — without doing any
new session-state work.

**Alternatives considered**:
- *Stateless* (`sessionIdGenerator: undefined`): rejected for v1 because
  the existing in-memory state would still be implicitly shared across
  "stateless" requests, creating the same multi-client semantics with no
  guarantees. Last-write-wins per Constitution still applies, but stateful
  surfaces the implicit guarantee instead of hiding it.
- *Multi-session with per-session state*: rejected — that's the
  F-T3-MULTI feature (multi-story workspace), explicitly out of scope.

### R3 — CLI argument parsing

**Decision**: Hand-rolled `parseArgs()` in `src/server/cli.ts`. Just
iterates `process.argv.slice(2)`, recognises `--transport`, `--port`,
`--host`, `--help`. No third-party dependency.

**Rationale**: Three flags. A 50-line hand-rolled parser is shorter than
configuring `commander` or `yargs` and avoids a new runtime dep
(Constitution principle V — keep the dependency tree lean).

**Alternatives considered**:
- *Node 20+ `node:util.parseArgs`*: viable, but the error messages are
  generic ("Unknown option") and we want specific guidance ("--transport
  must be 'stdio' or 'http'"). Hand-rolling lets us tailor the messages.
- *commander / yargs*: rejected — too much surface for three flags.

### R4 — Default port choice

**Decision**: Default `--port 4173`. Override with `--port` (or `--port 0`
for OS-assigned).

**Rationale**: 4173 is unused by common dev tooling (Vite uses 5173 for
dev, 4173 for preview — but the MCP server is unlikely to clash with a
preview server in the same shell session). Documented in `quickstart.md`
so a maintainer who hits a clash knows to override. `--port 0` exists for
parallel test runs (the smoke runner uses it).

**Alternatives considered**:
- *Random by default*: rejected — discoverability matters; a maintainer
  who restarts the server should not have to re-read the banner each
  time.
- *3000 / 8080*: rejected — too commonly bound by other tools.

### R5 — Default host and the security banner

**Decision**: Default `--host 127.0.0.1`. Any non-loopback override
(`--host 0.0.0.0`, `--host 192.168.x.x`, etc.) MUST surface a single-line
warning to stderr at startup naming the host and noting the broader
exposure.

**Rationale**: The dev-iteration motivation only needs loopback. Anything
beyond loopback is opt-in and worth flagging because there's no auth in
v1 (per spec assumptions). The banner is a soft guard; a hard block on
non-loopback would frustrate legitimate use cases (e.g., container dev
environments where the loopback is the container's, not the host's).

**Alternatives considered**:
- *Hard-block non-loopback*: rejected — makes container/VM workflows
  painful for no real safety win (any user determined to expose the
  server can still do so by reverse-proxying loopback).
- *Silent allow*: rejected — gives no chance to notice an accidental
  override.

### R6 — Smoke runner shape (parameterised vs split)

**Decision**: Parameterise the existing `smoke.ts`. Add an optional
`SMOKE_TRANSPORT` env var (or argv flag) and a small adapter at the top
that constructs the right MCP client. Pre-existing tool calls go through
the adapter without other changes.

**Rationale**: The test logic — 24 sections of "call tool, assert
response" — is identical across transports. Parameterising avoids
duplicating that logic in two files that would drift. Adapter pattern is
the smaller change.

**Alternatives considered**:
- *Two separate files*: rejected — diff drift risk.
- *Move smoke into a vitest test suite*: out of scope for this feature;
  belongs in F-CI / cross-cutters.

## Phase 1 — Design notes

### CLI contract (also captured in `contracts/cli-flags.json`)

```text
twinery-mcp-poc [OPTIONS]

Options:
  --transport <stdio|http>   Transport mode. Default: stdio.
  --host <string>            HTTP bind host. Default: 127.0.0.1.
                             Only used when --transport http.
  --port <number>            HTTP bind port. Default: 4173. Use 0 for
                             OS-assigned. Only used when --transport http.
  --help                     Print this help text and exit 0.

Exit codes:
  0   Server stopped cleanly (Ctrl+C in stdio; SIGTERM in http).
  1   Server crashed.
  2   Invalid CLI args.
```

### State and runtime additions

Compared to v0.4, the runtime adds two small modules and modifies
`index.ts`. No persistent state changes — the active story, dirty flag,
and image-placeholder list are all transport-agnostic.

```ts
// src/server/cli.ts
export type Transport = "stdio" | "http";
export interface RunConfig {
  transport: Transport;
  host: string;     // valid for transport==="http"
  port: number;     // valid for transport==="http"
}
export function parseArgs(argv: string[]): RunConfig;     // throws on bad input

// src/server/http_listener.ts
export interface HttpHandle {
  url: string;        // e.g. "http://127.0.0.1:4173/mcp"
  port: number;       // resolved port (matters when --port 0)
  close: () => Promise<void>;
}
export async function startHttpServer(
  buildServer: () => Promise<McpServer>,
  cfg: { host: string; port: number },
): Promise<HttpHandle>;
```

`index.ts` then becomes:

```ts
const cfg = parseArgs(process.argv.slice(2));
if (cfg.transport === "stdio") {
  const server = await buildServer();
  await server.connect(new StdioServerTransport());
  console.error(`[twinery-mcp-poc] connected over stdio`);
} else {
  const handle = await startHttpServer(buildServer, cfg);
  console.error(`[twinery-mcp-poc] listening on ${handle.url}`);
  if (cfg.host !== "127.0.0.1" && cfg.host !== "localhost") {
    console.error(`[twinery-mcp-poc] WARNING: bound to ${cfg.host} — reachable beyond loopback`);
  }
}
```

### Smoke-test parameterisation

Adapter at the top of `smoke.ts`:

```ts
async function getClient(): Promise<{ callTool: (...) => ... }> {
  const mode = process.env.SMOKE_TRANSPORT ?? "stdio";
  if (mode === "stdio") {
    // existing in-process tool calls (current smoke approach)
    return inProcessAdapter();
  }
  // http: spawn server, wait for ready line, build SDK HTTP client
  return spawnAndConnect();
}
```

The 24 existing sections call through the adapter rather than importing
tool handlers directly. The stdio path can keep the in-process shortcut
(faster, fewer moving parts) since it already exercises the tool surface
end-to-end. The http path uses the real wire format.

`package.json` scripts:

```json
"smoke": "npm run smoke:stdio && npm run smoke:http",
"smoke:stdio": "SMOKE_TRANSPORT=stdio node dist/smoke.js",
"smoke:http":  "SMOKE_TRANSPORT=http  node dist/smoke.js"
```

### Edge-case handling

- **Port already in use**: `node:http`'s `listen()` errors with `EADDRINUSE`;
  catch in `http_listener.ts`, print "Port {port} is already in use. Pass
  --port to choose another port", exit 1.
- **`--port 0`**: after `listen()` resolves, read `server.address()` for
  the assigned port and log it in a stable format
  (`[twinery-mcp-poc] http port: 4287`) so the smoke runner can grep it.
- **Non-loopback `--host`**: warning banner per R5.
- **SIGINT / SIGTERM in http mode**: `handle.close()` called from the
  signal handler so the listener shuts down gracefully.
- **Unknown CLI flag**: `parseArgs` throws with the unknown-flag name;
  `main()` catches and prints help text with exit code 2 (matches FR-007).

### Quickstart shape (`quickstart.md`)

Three sections, mirroring the spec's user stories:

1. **Stdio (default)** — copy/paste of the existing v0.4 client config; no
   change.
2. **HTTP (opt-in)** — start the server with `npm run start -- --transport
   http`; copy/paste of the MCP client config snippet for HTTP; the dev-loop
   workflow (edit → build → restart server only → next call sees change).
3. **Verifying** — `npm run smoke` exercises both modes; if either fails,
   the failure mode and remediation.

## Out of scope (tracked elsewhere)

Pulled forward from `spec.md`'s "Out of scope" section so the plan is
self-contained:

- HTTP authentication / authorization — roadmap if multi-machine
  workflows appear.
- Running stdio + http simultaneously in one process.
- Legacy SSE-based HTTP transport.
- Idle shutdown and connection limits.
- Per-client state (multi-story workspace) — that's the deferred
  `F-T3-MULTI` feature.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations.
