# Feature Specification: HTTP Transport Mode — Connect-Once Dev Loop

**Feature Branch**: `006-http-transport-mode`
**Created**: 2026-05-04
**Status**: Draft
**Input**: Maintainer-driven; promoted from backlog row `F-HTTPMODE` (parent
epic E06 cross-cutting infrastructure, P2 size M). Supersedes the older
deferred `F-T3-HTTP` entry, which was scoped under "Tier 3" deferred
v1.0 items as "alternate transport for non-CLI clients" — that framing
under-sold the actual dev-loop friction this feature removes.

The Twinery MCP server today only speaks **stdio**. Every MCP client
(Claude Desktop, VS Code MCP, etc.) spawns a fresh `node dist/server/index.js`
process per session. When the server's code changes, the client has to be
fully reloaded to pick up new behaviour — there's no in-place hot-edit. For
maintainers iterating on server features (every PR in this repo so far) that
reload tax is the largest source of session friction.

This feature adds an opt-in **Streamable-HTTP** transport, selectable at
server startup via a `--transport` CLI flag. Clients point at a long-running
server URL instead of a spawn command, so the dev loop becomes:
edit → rebuild → next tool call sees the new behaviour. No client reload.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Iterate on server code without reloading the client (Priority: P1)

A maintainer is working on a new tool or fixing a bug in an existing one.
They want to make a change, rebuild the server, and see the result in their
running MCP client (Claude Desktop, VS Code, or any MCP-compliant client) on
the very next tool call — without restarting the client, re-loading any
configuration, or re-establishing session state.

**Why this priority**: This is the entire motivation for the feature. Without
it, every server change still costs a full client-restart cycle, which is the
specific pain point the work is meant to eliminate.

**Independent Test**: Start the server in HTTP mode. Connect a client at the
printed URL. Make a tool call. Edit the server code (e.g. change a tool's
description text). Run `npm run build`. Make another tool call from the same
client without restarting it. The new behaviour appears in the response.

**Acceptance Scenarios**:

1. **Given** the server has been started with `--transport http` and an MCP
   client is connected to its URL, **When** the maintainer edits code, runs
   `npm run build`, restarts only the server process (not the client), and
   makes a tool call, **Then** the tool's response reflects the code change
   without any client-side action.
2. **Given** an MCP client config that points at the HTTP server URL,
   **When** the maintainer launches the client fresh, **Then** the client
   completes the MCP handshake, lists all 15 tools, and reads the
   `twinery://guide` resource exactly as it would over stdio.
3. **Given** an existing client config that uses the stdio command,
   **When** v0.5 is installed without changing that config, **Then** the
   client continues to work unchanged — HTTP mode is opt-in only.

---

### User Story 2 - Tool behaviour is identical across transports (Priority: P1)

The same registered tools, resources, clarification semantics, and error
shapes work identically whether the server is reached via stdio or HTTP.
Authors and the LLM should not be able to tell which transport is in use
from the tool responses alone.

**Why this priority**: Two parallel codepaths drift. If HTTP mode behaves
even subtly differently, every future tool change has to be re-verified
twice. Behaviour parity is the only sane way to keep the surface single.

**Independent Test**: Build a representative story end-to-end against
each transport using the same tool-call sequence. Diff the responses.
They match byte-for-byte (modulo timestamps and clarification UUIDs).

**Acceptance Scenarios**:

1. **Given** identical input args to any tool, **When** the call goes to
   a stdio server vs. an HTTP server with the same in-memory story state,
   **Then** the response payloads are equal modulo non-determinism
   (timestamps, UUIDs).
2. **Given** a tool call that triggers a clarification (e.g.
   `create_story` without `format`), **When** invoked over HTTP, **Then**
   the response carries `kind: "clarification_needed"` with the same
   shape as stdio mode; `respond_to_clarification` resolves it
   identically.
3. **Given** the `twinery://guide` resource, **When** read over HTTP,
   **Then** the contents are byte-identical to the stdio response and
   to `docs/GUIDE.md` on disk.

---

### User Story 3 - Choose where the HTTP server binds (Priority: P2)

A maintainer running multiple projects (or behind constrained network
policy) needs to control which port and which network interface the HTTP
server uses.

**Why this priority**: Necessary for real use beyond a fresh dev box —
port collisions and interface restrictions are routine. P2 because the
defaults cover the common case (loopback, fixed port).

**Independent Test**: Start the server with `--port 5500 --host 127.0.0.1`.
Verify via stderr banner and an actual connection that the server listens
on `127.0.0.1:5500`.

**Acceptance Scenarios**:

1. **Given** `--port 5500`, **When** the server starts, **Then** it binds
   to that port (or fails fast with a clear error if it's in use).
2. **Given** `--host 0.0.0.0`, **When** the server starts, **Then** the
   stderr banner includes a security note that the server is reachable
   beyond loopback.
3. **Given** `--port 0`, **When** the server starts, **Then** the system
   assigns a free port and the server logs the chosen port to stderr so
   the MCP client config can use it.

---

### User Story 4 - Invalid CLI flag fails fast (Priority: P3)

Misconfigured CLI flags produce a clear error and a non-zero exit, not a
silent fallback to a different mode.

**Why this priority**: UX polish for a rare path. P3 because users hitting
this case are already paying attention.

**Independent Test**: Run the server with `--transport http2` (typo).
Expect non-zero exit and a stderr message naming the valid values.

**Acceptance Scenarios**:

1. **Given** `--transport bogus`, **When** the server starts, **Then**
   it prints to stderr "invalid --transport: bogus (expected stdio or
   http)" and exits with a non-zero code.
2. **Given** `--port abc` (non-numeric), **When** the server starts,
   **Then** it prints a parse error and exits with a non-zero code.
3. **Given** any unrecognised flag, **When** the server starts, **Then**
   it prints help text listing the recognised flags and exits non-zero.

---

### Edge Cases

- **Two MCP clients connect to the same HTTP server.** Single-active-story
  model is preserved (Constitution); both clients see the same story
  state. Last-write-wins on concurrent mutations, with a warning emitted
  to the losing client.
- **Network drop or HTTP timeout mid-call.** The server returns a standard
  MCP error; idempotent reads (e.g. `list_passages`, `current_story_info`)
  can be safely retried. Mutation tools that surfaced a clarification
  before the drop keep that clarification valid for `respond_to_clarification`
  until the in-process expiry.
- **Server started in HTTP mode with no client ever connecting.** Process
  stays alive indefinitely (no idle shutdown for v1). Maintainer kills it
  with Ctrl+C.
- **Port already in use.** Hard fail at startup with a clear error
  referencing the port and the suggested resolution (`--port` or kill the
  conflicting process).
- **`--port 0` for auto-assignment.** System picks a free port; server
  prints the resolved port. Useful for parallel test runs.
- **`--host 0.0.0.0` (or any non-loopback).** Allowed but the startup
  banner includes a warning about broader network exposure.
- **Both `--transport http` and stdio expected by the same client config.**
  Not supported in v1 — one transport per server process. CLI flag picks one.
- **The `npm run start` command without flags.** Continues to launch
  stdio (default). Existing client configs that use this command keep
  working unchanged.
- **HTTP server killed while a client is mid-request.** The client sees
  a transport-level error; reconnecting at the same URL after restart
  works because there's no client-side state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The server MUST accept a `--transport` startup flag with
  values `stdio` (default) and `http`. Omitting the flag MUST behave
  identically to v0.4 (stdio).
- **FR-002**: The server MUST accept `--port <number>` and `--host <string>`
  flags that take effect only when `--transport http` is selected. Default
  port 4173, default host `127.0.0.1`.
- **FR-003**: When started in HTTP mode, the server MUST use the MCP
  Streamable-HTTP transport — not a custom HTTP layer, not the older
  HTTP+SSE transport. The transport MUST come from the official MCP SDK
  package already on the runtime dependency list.
- **FR-004**: The full tool and resource surface (currently 15 tools +
  `twinery://guide`) MUST be available identically under both transports
  with no behavioural divergence beyond non-determinism (timestamps,
  UUIDs).
- **FR-005**: Clarification semantics — `kind: "clarification_needed"`
  payload, `respond_to_clarification` replay, valid-answers enums — MUST
  work identically over HTTP.
- **FR-006**: The default `--host` MUST be `127.0.0.1` (loopback only),
  so a careless launch does not expose the server to other devices on the
  network. Setting `--host` to anything else MUST surface a security
  warning in the startup banner.
- **FR-007**: Invalid `--transport`, `--port`, or `--host` values MUST
  cause a non-zero exit with a clear stderr message naming the valid
  values or expected format.
- **FR-008**: The server MUST log to stderr at startup the chosen
  transport, host, and port (when applicable), and the URL clients should
  connect to. Stdout MUST remain reserved for MCP protocol traffic in
  stdio mode.
- **FR-009**: Switching transports MUST NOT require any change to the
  registered tools, resources, or clarification engine — the transport
  selector lives in the server entrypoint only. Tool authors should not
  need to know which transport is active.
- **FR-010**: The README MUST document both modes side-by-side, including
  copy-pasteable MCP client config snippets for each, and the
  dev-iteration workflow that motivated this feature.
- **FR-011**: The smoke test MUST exercise both transports — either as
  one runner that boots in each mode in turn, or as parallel `smoke:stdio`
  and `smoke:http` scripts. Both MUST pass every functional check that the
  v0.4 smoke covered.
- **FR-012**: Default behaviour (no flags, stdio) MUST be byte-identical
  to v0.4 for users who do not opt into HTTP mode.
- **FR-013**: When `--port 0` is passed, the server MUST resolve to a
  free port assigned by the OS and log the chosen port to stderr in a
  machine-parseable form (so test runners can pick it up).

### Key Entities

- **Transport mode**: enum (`stdio`, `http`), resolved from
  `--transport` at startup.
- **Run config**: `{ transport, host, port }`, populated from CLI args
  with defaults applied.
- **HTTP listen URL**: derived from host + port, displayed in the
  startup banner; the value an MCP client config uses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer makes 5 sequential code changes (e.g. tweak a
  tool's description, add a new tool, change a clarification message) and
  verifies each via the next tool call from the *same* running MCP client.
  100% of the changes are reflected without any client restart. Total
  iteration time per change is dominated by `npm run build` (typically
  under 10 seconds).
- **SC-002**: A representative end-to-end smoke run produces byte-equivalent
  responses for every tool call between stdio and HTTP transports, modulo
  fields explicitly identified as non-deterministic (timestamps, UUIDs).
  100% of compared payloads match.
- **SC-003**: A user installing v0.5 without reading the changelog and
  using their existing v0.4 client config sees no behaviour change. Stdio
  mode (the default) remains identical to v0.4.
- **SC-004**: A maintainer who copies the README's HTTP-mode config
  snippet into their MCP client gets a working connection on the first
  attempt. First tool call after the client connects completes within 5
  seconds end-to-end on a developer laptop.
- **SC-005**: The smoke test passes in both transports. Total wall-clock
  runtime for the combined `npm run smoke` is under 60 seconds.
- **SC-006**: 100% of invalid `--transport`, `--port`, and `--host` value
  cases produce a non-zero exit and a stderr message naming the valid
  values or expected format. 0% silent fallbacks.
- **SC-007**: Startup banner names the active transport, host, and port
  in 100% of HTTP-mode launches; stdio mode prints the existing
  "connected over stdio" banner unchanged.

## Assumptions

- **Default port 4173** is unused on common dev setups (Vite uses 5173;
  4173 is Vite's preview port but the MCP server is unlikely to clash
  with a dev preview running at the same time). Authors who hit a
  collision use `--port`.
- **Default host 127.0.0.1** keeps the server reachable only from the
  same machine. Crossing that boundary is an explicit opt-in via
  `--host` and triggers the security warning.
- **No authentication** on the HTTP endpoint in v1. The loopback default
  combined with the single-machine dev-iteration use case makes this
  safe enough; auth is roadmapped if a real multi-machine workflow
  emerges.
- **Single transport per server process** in v1. Running stdio and HTTP
  simultaneously from one process is out of scope (would complicate the
  state model and the lifecycle).
- **Single active story** unchanged from v0.4. Multiple HTTP clients see
  the same story state. Concurrent mutations resolve via the existing
  last-write-wins-with-warning model in the Constitution.
- **No idle shutdown.** The HTTP server runs until killed. This matches
  the dev-loop expectation (start it once, leave it running for the
  session).
- **Streamable-HTTP transport is the canonical modern MCP HTTP
  transport** — single endpoint speaking JSON-RPC, optional streaming
  responses. The legacy SSE-based HTTP transport (in older MCP spec
  revisions) is not in scope.
- **Cross-platform parity preserved.** Node's `http` module and the MCP
  SDK behave identically on Windows, macOS, and Linux; no shell-script
  changes are required.
- **Constitution alignment unchanged.** Principle II (MCP-Native &
  Model-Agnostic) is satisfied because the HTTP transport comes from
  the official SDK. No new dependencies are introduced. The other four
  principles are unaffected — graph-integrity, format fidelity, native-
  Twine round-trip, and licensing discipline are all transport-agnostic.

## Dependencies

- **MCP SDK Streamable-HTTP server transport**: already a runtime
  dependency via `@modelcontextprotocol/sdk` (v0.4 ships v1.29). The
  SDK exports a server transport for Streamable-HTTP; this feature
  consumes it. No new package added.
- **Node `http` module**: built-in.
- **Smoke runner**: extended from the existing `npm run smoke` to cover
  both transports. Test client uses the SDK's HTTP client transport
  symmetrically.

## Out of scope (tracked elsewhere)

- **Authentication / authorization on the HTTP endpoint.** Roadmap if a
  multi-machine workflow appears; not v0.5 scope.
- **Running stdio and HTTP simultaneously** in the same process. Not
  needed for the dev-iteration motivation.
- **HTTP+SSE legacy transport.** Modern Streamable HTTP only.
- **Idle shutdown / connection limits.** v1 keeps the server running
  forever and accepts unbounded clients (in practice 1–2 in dev).
- **Distinguishing per-client state** (multi-story workspace). That's
  the deferred F-T3-MULTI feature.
