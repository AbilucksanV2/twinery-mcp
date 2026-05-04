---

description: "Task list for feature 006 — HTTP transport mode"
---

# Tasks: HTTP Transport Mode — Connect-Once Dev Loop

**Input**: Design documents from `/specs/006-http-transport-mode/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Extending the existing `npm run smoke` runner to cover both
transports plus CLI failure paths. Pure-unit tests for `parseArgs()` are
marked optional and grouped at the foundational layer; the smoke parity is
the load-bearing test for this feature.

**Organization**: Tasks are grouped by user story so each story can be
implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Single-project TypeScript package, layout unchanged from v0.4. New files
under `src/server/`. Modifications to existing `src/server/index.ts`,
`src/smoke.ts`, and `package.json`. No tool-handler files are touched.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the SDK's HTTP transport classes are available and
import paths are stable. No new dependencies are added — this phase is
verification only.

- [ ] T001 Verify the SDK's `StreamableHTTPServerTransport` is importable from `@modelcontextprotocol/sdk/server/streamableHttp.js` and `StreamableHTTPClientTransport` from the matching client path; confirm constructor option types (`sessionIdGenerator`, `enableJsonResponse`) by reading `node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.d.ts` and the corresponding client `.d.ts`. Record the exact import strings in `specs/006-http-transport-mode/research.md` if they differ from R1's assumption.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: New CLI parser and HTTP listener modules. These are the building blocks every user-story phase depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Implement `src/server/cli.ts` exporting `RunConfig` (`{ transport: "stdio" | "http", host: string, port: number }`) and `parseArgs(argv: string[]): RunConfig`. Recognise `--transport`, `--port`, `--host`, `--help`. Reject unknown flags. Validate per `specs/006-http-transport-mode/data-model.md` "Validation rules summary" with the exact stderr message strings from `specs/006-http-transport-mode/contracts/cli-flags.json` `stderr_outputs`. Throw with structured error messages on bad input — `main()` catches and exits 2.
- [ ] T003 Implement `src/server/http_listener.ts` exporting `HttpHandle` (`{ url, port, close }`) and `startHttpServer(buildServer, { host, port })`. Construct `StreamableHTTPServerTransport` (sessionful via `sessionIdGenerator: () => randomUUID()` per R2), wire it into a `node:http` server, expose `handle.close()` for graceful shutdown. Handle `EADDRINUSE` with the exact stderr message from cli-flags.json (`stderr_outputs.port_in_use`) and exit 1. When `port === 0`, read `server.address()` after `listen()` resolves and log `[twinery-mcp-poc] http port: <n>` so test runners can grep it.

**Checkpoint**: Both new modules compile (`npx tsc`) and pass a manual import check; story phases can begin.

---

## Phase 3: User Story 1 — Connect-once dev loop (Priority: P1) 🎯 MVP

**Goal**: A maintainer starts the server with `--transport http`, an MCP client connects to its URL, and a tool call works. Editing the server, rebuilding, restarting only the server (not the client), and making another tool call shows the new behaviour without a client reload.

**Independent Test**: Run `node dist/server/index.js --transport http`. From a separate process, connect via the SDK's HTTP client transport. Call `tools/list` and a representative tool (`create_story` or `current_story_info`). Both succeed and return data identical in shape to stdio.

### Implementation tasks for User Story 1

- [ ] T004 [US1] Modify `src/server/index.ts` to call `parseArgs(process.argv.slice(2))` at startup and dispatch: `transport === "stdio"` → existing `StdioServerTransport` path (unchanged); `transport === "http"` → call `startHttpServer(buildServer, { host, port })`. Wrap the dispatch in try/catch so `parseArgs` errors print to stderr and exit 2; transport startup errors exit 1.
- [ ] T005 [US1] Replace the current single-line `[twinery-mcp-poc] connected over stdio` banner in `src/server/index.ts` with the contracted banners: stdio prints exactly the existing line; http prints `[twinery-mcp-poc] listening on http://<host>:<port>/mcp`; when `port === 0` also prints `[twinery-mcp-poc] http port: <resolved>`; when host is non-loopback also prints `[twinery-mcp-poc] WARNING: bound to <host> — reachable beyond loopback`. Match `specs/006-http-transport-mode/contracts/cli-flags.json` `stderr_outputs` exactly.
- [ ] T006 [US1] Add a smoke section to `src/smoke.ts` (or its HTTP variant — see T007) that proves the dev-loop path: spawn the server with `--transport http --port 0`, parse the resolved port from stderr, connect a `StreamableHTTPClientTransport` to `http://127.0.0.1:<port>/mcp`, run an `initialize` + `tools/list`, and assert all 15 tools are present.

**Checkpoint**: After T004–T006, `node dist/server/index.js --transport http` boots, an HTTP MCP client can list tools, and the dev-loop walkthrough in `specs/006-http-transport-mode/quickstart.md` works manually.

---

## Phase 4: User Story 2 — Tool behaviour parity (Priority: P1)

**Goal**: Same tool, resource, and clarification behaviour over HTTP as over stdio. Smoke runs in both modes; both pass.

**Independent Test**: `npm run smoke:stdio` and `npm run smoke:http` each pass all 24 functional checks. The tool responses for the same input are byte-equivalent across transports modulo non-determinism (timestamps, UUIDs).

### Implementation tasks for User Story 2

- [ ] T007 [US2] Refactor `src/smoke.ts` so the 24 existing sections call through a thin transport adapter rather than importing tool handlers directly. Adapter interface: `{ callTool(name, args), readResource(uri) }`. Add an in-process implementation (current behaviour, used when `SMOKE_TRANSPORT=stdio` or unset).
- [ ] T008 [US2] Add the HTTP-transport adapter inside `src/smoke.ts` (or `src/smoke_http.ts` if cleaner): when `SMOKE_TRANSPORT=http`, spawn `node dist/server/index.js --transport http --port 0`, wait for the `[twinery-mcp-poc] http port: <n>` line on stderr to capture the bound port, instantiate `StreamableHTTPClientTransport` against `http://127.0.0.1:<port>/mcp`, drive the same 24 sections through it. Tear down the spawned server on success/failure.
- [ ] T009 [P] [US2] Update `package.json` scripts: rename current `smoke` to `smoke:stdio` (sets `SMOKE_TRANSPORT=stdio`); add `smoke:http` (sets `SMOKE_TRANSPORT=http`); make a new `smoke` that runs `smoke:stdio` then `smoke:http` sequentially.
- [ ] T010 [US2] Run `npm run smoke` and verify both transports complete all 24 sections green. Investigate any divergence — the only acceptable differences are timestamp / UUID fields explicitly listed in `specs/006-http-transport-mode/contracts/cli-flags.json` `tool_surface_contract.non_deterministic_fields`.

**Checkpoint**: After T010, `npm run smoke` exercises full parity. SC-002, SC-005 satisfied.

---

## Phase 5: User Story 3 — Configure host and port (Priority: P2)

**Goal**: `--host` and `--port` flags work, default to `127.0.0.1:4173`, surface a warning when bound non-loopback, and give a clear error on EADDRINUSE.

**Independent Test**: Smoke sections covering `--port 5500`, `--port 0`, `--host 0.0.0.0`, and the in-use port path each pass; banners and stderr messages match `cli-flags.json` exactly.

### Implementation tasks for User Story 3

- [ ] T011 [P] [US3] Add a smoke section in `src/smoke.ts` (HTTP variant) that boots the server with an explicit `--port 5500` (or any free port chosen by the test), confirms the bound port appears in the listen banner exactly, and that an HTTP client can connect.
- [ ] T012 [P] [US3] Add a smoke section that boots with `--host 0.0.0.0 --port 0`, asserts the non-loopback warning banner is printed verbatim per `stderr_outputs.non_loopback_warning`, and that the server still accepts a connection on loopback.
- [ ] T013 [US3] Add a smoke section that boots two servers in sequence on the same explicit port; the second exits 1 with the exact `stderr_outputs.port_in_use` message naming the colliding port. The first server is torn down before the section ends.

**Checkpoint**: After T011–T013, the host/port surface is verified. SC-006, SC-007 satisfied.

---

## Phase 6: User Story 4 — Fail-fast on bad CLI (Priority: P3)

**Goal**: Misconfigured `--transport`, `--port`, or `--host`, plus unknown flags, all produce a clear stderr message and a non-zero exit (2 for parse errors).

**Independent Test**: A small CLI smoke runner spawns the server with each invalid form and asserts the exit code and stderr message against `cli-flags.json`.

### Implementation tasks for User Story 4

- [ ] T014 [P] [US4] Add CLI failure-mode checks (either a section in `src/smoke.ts` or a focused `src/smoke_cli.ts`) covering `--transport bogus`, `--transport ""`, and the missing-value form (`--transport` at end of argv). Each spawn must exit 2 with the exact `stderr_outputs.invalid_transport` text (substituting the actual offending value).
- [ ] T015 [P] [US4] Add CLI checks for `--port abc`, `--port -1`, `--port 99999` — each exits 2 with `stderr_outputs.invalid_port`. Add a check for `--host` with no value — exits 2 with `stderr_outputs.missing_host_value`.
- [ ] T016 [P] [US4] Add CLI checks for an unknown flag (`--bogus`) — exits 2 with `stderr_outputs.unknown_flag` plus the help text — and for `--help` alone — exits 0 with help text.

**Checkpoint**: After T014–T016, every misconfiguration path in `cli-flags.json` is exercised. SC-006 (already covered by US3) plus the contract clauses are now end-to-end verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, version bump, manual cross-platform verification.

- [ ] T017 [P] Update `README.md` with a "Run modes" section that mirrors `specs/006-http-transport-mode/quickstart.md`: stdio (default, unchanged) and HTTP (opt-in) side-by-side, copy-pasteable client config snippets, the dev-iteration loop walkthrough, and the failure-mode table. Update the "Verify locally" section to reference both `smoke:stdio` and `smoke:http`.
- [ ] T018 [P] Bump `package.json` `version` to `0.5.0` and refresh `description` to mention the HTTP transport mode and the dev loop. No dependency changes — verify `npm install` is a no-op.
- [ ] T019 Run `npm run build` and `npm run smoke` (full both-transport run) one last time on the merged feature branch; capture wall-clock time for SC-005 (target ≤60 s combined). Verify the MCP `tools/list` response over HTTP is byte-identical (modulo ids) to stdio's.
- [ ] T020 Manual cross-platform spot check: start the HTTP server on macOS, Linux, and Windows; connect from Claude Desktop or another MCP client at the printed URL; make one tool call. Confirm SC-004 (≤5 s first call). Document any platform-specific notes in `README.md` if they emerge.
- [ ] T021 Final Constitution Check sweep — re-read `.specify/memory/constitution.md`, confirm all five principles still pass post-implementation, and confirm `tracking/backlog.csv` F-HTTPMODE row is updated to status `done` with the merge commit hash and PR number filled in once the PR ships.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 has no dependencies — can run first.
- **Foundational (Phase 2)**: T002 has no dependencies. T003 depends on T002 (imports `RunConfig` types). Both must complete before any user-story phase begins.
- **User Story 1 (Phase 3)**: depends on T002 + T003.
- **User Story 2 (Phase 4)**: depends on T002 + T003 + US1 (the smoke runner needs working HTTP transport from US1).
- **User Story 3 (Phase 5)**: depends on US2 (the smoke runner shape needs to be parameterised before adding more HTTP-mode sections).
- **User Story 4 (Phase 6)**: depends on T002 (CLI parser exists) but is otherwise independent of US1/US2/US3 — CLI smoke checks spawn a fresh server per check.
- **Polish (Phase 7)**: depends on every story being green.

### Within Each User Story

- US1: T004 → T005 → T006 (sequential — index.ts edits, then banner edits, then smoke section).
- US2: T007 → T008 → T009 (parallel) → T010.
- US3: T011 / T012 / T013 are all parallelisable smoke additions (different sections, different file edits don't collide).
- US4: T014 / T015 / T016 are all parallelisable smoke additions.

### Parallel Opportunities

- T011, T012, T013 inside US3 — three independent smoke sections.
- T014, T015, T016 inside US4 — three independent CLI smoke groups.
- T017, T018 in Polish — README and package.json are different files.
- US4 can run in parallel with US3 in principle (both depend only on US2's smoke runner shape), though sequencing US3 first matches priority order.

---

## Parallel Example: US3 + US4 smoke additions

```bash
# After Phase 4 (US2) finishes, the smoke adapter exists. The four
# CLI/host/port smoke groups can land in parallel since they touch
# different sections (or different files) and only depend on T002+T010.

T011: --port custom value smoke section
T012: --host non-loopback warning smoke section
T013: EADDRINUSE smoke section
T014: invalid --transport CLI smoke
T015: invalid --port and missing --host CLI smoke
T016: unknown flag and --help CLI smoke
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 + Phase 2 (verify imports + write cli.ts + http_listener.ts).
2. Complete Phase 3 (wire dispatch + banner + one smoke section).
3. **STOP and validate**: `node dist/server/index.js --transport http` boots; an MCP client at the URL gets a working `tools/list`. The dev-loop walkthrough succeeds manually.
4. Decide whether to ship a v0.5-rc or continue.

### Incremental Delivery

1. Phase 1 + 2 → foundation ready.
2. Phase 3 (US1) → MVP; ships as v0.5-rc1 if desired.
3. Phase 4 (US2) → smoke parity proves both transports stay in lockstep.
4. Phase 5 (US3) → host/port surface verified.
5. Phase 6 (US4) → fail-fast paths verified.
6. Phase 7 → docs + version bump → v0.5.0 release.

### Parallel Team Strategy

With multiple contributors after Foundational:

- Contributor A: US1 (T004 → T005 → T006).
- Contributor B: US2 (T007 → T008 → T009 → T010), starting once T004 lands.
- Contributor C: US4 (T014 / T015 / T016 in parallel) — depends only on T002 so can start almost immediately.
- US3 sequenced after US2 so the smoke runner shape is settled.

---

## Notes

- Tasks follow the strict `- [ ] TxxX [P?] [Story?] Description with file path` format.
- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label applied only to tasks inside a user-story phase (Phases 3–6). Setup, Foundational, and Polish carry no story label.
- The smoke runner is the load-bearing test artefact. CLI parser unit tests are not strictly required; if added, they live alongside `src/server/cli.ts` and are run from `package.json`'s test script (which currently doesn't exist as a separate command — would be added under `F-CI` / cross-cutters).
- Commit after each task or coherent group; the project has an optional `/speckit.git.commit` hook available.
- Do not skip the parity check (T010). It's the single test that prevents the two transports from drifting.
- Do not skip the manual cross-platform check (T020). The Constitution mandates Windows / macOS / Linux parity, and the HTTP listen path can surface platform-specific quirks (e.g., port-bind behaviour on Windows).
