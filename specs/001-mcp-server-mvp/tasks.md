---
description: "Task list for Twinery MCP Server v1.0 MVP"
---

# Tasks: Twinery MCP Server — v1.0 MVP

> **POC status (2026-04-23)**: A minimum-viable POC covering a strict subset of
> these tasks is complete. Tasks with `[X]` are done in the POC; `[~]` indicates
> a task done in a POC-reduced form (the full v1.0 scope is broader than what
> was built). Everything else remains unstarted. Smoke test passes (`npm run
> smoke`) and the server responds to real MCP `initialize` + `tools/list`
> requests over stdio. See the top of `README.md` for POC limitations.

**Input**: Design documents from `/specs/001-mcp-server-mvp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The Constitution's Development Workflow mandates fixture-based
round-trip tests (all four story formats), mutation-integrity tests, and headless-
browser verification of compiled HTML. Contract tests precede implementation within
each user story (TDD).

**Organization**: Tasks are grouped by user story so each story can be implemented
and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single-project TypeScript package. Paths below are repository-relative, matching
`plan.md` § Project Structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialisation and basic structure

- [X] T001 Initialise npm project — create `package.json` with name `@twinery/mcp-server`, version `0.1.0`, type `module`, bin entry `twinery-mcp` → `dist/server/index.js`, and scripts (`build`, `test`, `lint`, `typecheck`, `license-check`)
- [X] T002 [P] Install runtime dependencies: `@modelcontextprotocol/sdk`, `extwee`, `zod`
- [ ] T003 [P] Install dev dependencies: `typescript`, `vitest`, `@vitest/coverage-v8`, `puppeteer`, `@types/node`, `license-checker`, `eslint`, `@typescript-eslint/*`, `prettier`
- [X] T004 [P] Create `LICENSE` at repo root with MIT license text
- [X] T005 [P] Create `tsconfig.json` (strict, ES2022 target, NodeNext module, rootDir `src`, outDir `dist`)
- [ ] T006 [P] Create `vitest.config.ts` (node environment, include `tests/**/*.test.ts`)
- [ ] T007 [P] Create `.eslintrc.cjs` + `.prettierrc` with TypeScript rules
- [X] T008 [P] Create `.gitignore` covering `node_modules/`, `dist/`, `coverage/`, `stories/`, `.DS_Store`
- [X] T009 [P] Create empty directory tree: `src/{server/{tools,resources},twine,graph,images,guide,lib}`, `tests/{fixtures/{harlowe,sugarcube,chapbook,snowman},contract,integration,unit}`, `scripts/{bash,powershell}`, `docs/`
- [ ] T010 Create GitHub Actions CI workflow at `.github/workflows/ci.yml` — jobs: lint, typecheck, test, license-check, no-LLM-SDK-grep; matrix over ubuntu-latest, macos-latest, windows-latest; fails if any runtime dep's license is outside `MIT/BSD-2/BSD-3/Apache-2.0/ISC/MPL-2.0`; fails if any `import` references known LLM-provider SDK packages (`@anthropic-ai/sdk`, `openai`, `@google/generative-ai`, `cohere-ai`, `@mistralai/mistralai`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T011 Implement `src/twine/formats.ts` — `StoryFormat` enum (Harlowe/SugarCube/Chapbook/Snowman), default versions map (Harlowe 3.3.8, SugarCube 2.36.1, Chapbook 2.1.0, Snowman 2.0.2), per-format link-syntax descriptors (`arrow` for Harlowe/Chapbook, `pipe` for SugarCube/Snowman)
- [X] T012 Implement `src/twine/adapter.ts` — thin wrapper around `extwee` for parse (Twee → Story), emit (Story → Twee), compile (Story → HTML with bundled runtime), and spec-valid IFID auto-generation; all parsing delegated to extwee, zero hand-rolled format code (Constitution Principle I)
- [X] T013 [P] Implement `src/lib/slug.ts` — `storySlug(name: string) → string` producing URL-safe kebab-case
- [ ] T014 [P] Implement `src/lib/path.ts` — `assetsDir(storyDir, storySlug)` and `placeholderPath(storyDir, storySlug, label, ext)`
- [ ] T015 [P] Implement `src/lib/logger.ts` — structured stderr logger (stdout is reserved for MCP protocol)
- [X] T016 Implement `src/server/state.ts` — single active `Story` in memory (Constitution single-story model); getters, setters, mutation lock for last-write-wins with warning emission
- [~] T017 Implement `src/guide/registry.ts` — central `ToolRegistry` API where each tool registers `{ name, description, inputSchema, outputSchema, clarificationTriggers, examples }`; exported for the guide generator and the server wiring
- [~] T018 Implement `src/server/clarification.ts` — `ClarificationRequest` factory, session-init capability probe (sets transport to `elicitation` if the client advertises it, else `fallback`), elicitation invocation path via MCP SDK, fallback path returning `{ kind: "clarification_needed", clarification }`; in-memory map of `clarification_id → originating { tool, args }` for replay (R1)
- [X] T019 Implement `src/server/index.ts` — MCP server entrypoint; creates the SDK server, attaches stdio transport, reads client capabilities on init, registers all tools from `ToolRegistry`, registers all resources, wires `clarification.ts`
- [ ] T020 [P] Create `tests/fixtures/harlowe/simple.twee` — 3-passage Harlowe story with one decision point, fixture for round-trip and integration tests
- [ ] T021 [P] Create `tests/fixtures/sugarcube/simple.twee` — same structure for SugarCube
- [ ] T022 [P] Create `tests/fixtures/chapbook/simple.twee` — same structure for Chapbook
- [ ] T023 [P] Create `tests/fixtures/snowman/simple.twee` — same structure for Snowman
- [ ] T024 [P] Contract test in `tests/contract/shared.clarification.test.ts` — validate `ClarificationRequest` instances against `specs/001-mcp-server-mvp/contracts/shared.clarification.json`
- [ ] T025 [P] Round-trip test in `tests/contract/roundtrip-harlowe.test.ts` — parse Harlowe fixture, emit, reparse, assert deep-equal
- [ ] T026 [P] Round-trip test in `tests/contract/roundtrip-sugarcube.test.ts`
- [ ] T027 [P] Round-trip test in `tests/contract/roundtrip-chapbook.test.ts`
- [ ] T028 [P] Round-trip test in `tests/contract/roundtrip-snowman.test.ts`
- [ ] T029 [P] Create `scripts/bash/no-llm-sdk-grep.sh` and `scripts/powershell/no-llm-sdk-grep.ps1` — fail if repo source references any LLM-provider SDK package (wired into T010)
- [ ] T030 [P] Create `scripts/bash/license-check.sh` and `scripts/powershell/license-check.ps1` — run `license-checker` and fail on non-permissive licenses (wired into T010)

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 — Author a branching decision-point story end-to-end (Priority: P1) 🎯 MVP

**Goal**: Any MCP-compliant client can drive the server to build a branching Twine
story with decision-point links, save it, and produce playable HTML that opens in
a browser AND round-trips through the native Twine 2 editor.

**Independent Test**: Run `tests/integration/us1_end_to_end.test.ts` — it builds
the "Locked Door" story from `quickstart.md`, saves, opens the HTML in headless
Chromium, and asserts every passage is reachable and the graph matches.

### Graph-integrity helpers for User Story 1

> **NOTE: Constitution Principle III NON-NEGOTIABLE — these operations must live in
> code, not in LLM prompts.**

- [X] T031 [US1] Implement `src/graph/link.ts` — `insertLink(sourcePassage, targetName, displayText?, insertionIndex?)` emitting format-specific syntax via `formats.ts`
- [X] T032 [US1] Implement `src/graph/rename.ts` — `renamePassage(oldName, newName)` that rewrites every incoming `[[...]]` across all passages AND updates `story.start_passage` when applicable; atomic
- [ ] T033 [US1] Implement `src/graph/delete.ts` — `deletePassage(name, strategy)` that finds incoming links, applies the chosen strategy (`remove_link_markup` | `leave_dangling`), and returns the affected-passage list

### Contract tests for User Story 1 tools

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T034 [P] [US1] Contract test in `tests/contract/tool.create_story.test.ts` — validate inputs/outputs against `contracts/tool.create_story.json`; covers missing-format → clarification trigger
- [ ] T035 [P] [US1] Contract test in `tests/contract/tool.create_passage.test.ts`
- [ ] T036 [P] [US1] Contract test in `tests/contract/tool.update_passage.test.ts`
- [ ] T037 [P] [US1] Contract test in `tests/contract/tool.rename_passage.test.ts` — asserts incoming links rewritten, start_passage updated when applicable
- [ ] T038 [P] [US1] Contract test in `tests/contract/tool.delete_passage.test.ts`
- [ ] T039 [P] [US1] Contract test in `tests/contract/tool.link_passages.test.ts` — asserts arrow vs pipe syntax per format
- [ ] T040 [P] [US1] Contract test in `tests/contract/tool.set_start_passage.test.ts`
- [ ] T041 [P] [US1] Contract test in `tests/contract/tool.list_passages.test.ts`
- [ ] T042 [P] [US1] Contract test in `tests/contract/tool.get_passage.test.ts`
- [ ] T043 [P] [US1] Contract test in `tests/contract/tool.validate_story.test.ts` — asserts detection of broken links, orphans, duplicate names, IFID shape, start validity, format-mismatch passages
- [ ] T044 [P] [US1] Contract test in `tests/contract/tool.save_story.test.ts` — asserts files written and `assets/<slug>/` directory created

### Implementation tasks for User Story 1

- [X] T045 [P] [US1] Implement `src/server/tools/create_story.ts` — registers with `ToolRegistry`, uses `twine/adapter` for IFID generation, surfaces clarification on missing `format`
- [X] T046 [P] [US1] Implement `src/server/tools/create_passage.ts` — auto-positions when `position` omitted, sets as start if first passage or `set_as_start: true`, clarifies on duplicate name
- [ ] T047 [P] [US1] Implement `src/server/tools/update_passage.ts` — reconciles image placeholders when their emitted HTML is removed from text, clarifies on format-mismatch link syntax
- [X] T048 [US1] Implement `src/server/tools/rename_passage.ts` — thin wrapper around `graph/rename.ts` (T032); clarifies on name collision or unknown old name
- [ ] T049 [US1] Implement `src/server/tools/delete_passage.ts` — thin wrapper around `graph/delete.ts` (T033); clarifies on incoming-link strategy when `handle_incoming_links="ask"`
- [X] T050 [US1] Implement `src/server/tools/link_passages.ts` — thin wrapper around `graph/link.ts` (T031); clarifies on unknown target (no silent creation)
- [ ] T051 [P] [US1] Implement `src/server/tools/set_start_passage.ts`
- [X] T052 [P] [US1] Implement `src/server/tools/list_passages.ts`
- [ ] T053 [P] [US1] Implement `src/server/tools/get_passage.ts`
- [ ] T054 [P] [US1] Implement `src/server/tools/validate_story.ts`
- [~] T055 [US1] Implement `src/server/tools/save_story.ts` — writes `<slug>.twee` + compiled `<slug>.html` via `twine/adapter`, creates sibling `assets/<slug>/` directory (empty is fine), returns `pending_image_drops` list
- [ ] T056 [P] [US1] Implement `src/server/resources/story_summary.ts` — serves `twinery://story/current/summary`
- [ ] T057 [P] [US1] Implement `src/server/resources/story_graph.ts` — serves `twinery://story/current/graph`
- [ ] T058 [P] [US1] Implement `src/server/resources/story_twee.ts` — serves `twinery://story/current/twee`

### Integration tests for User Story 1

- [ ] T059 [US1] Integration test in `tests/integration/us1_build_locked_door.test.ts` — replays the quickstart 7-tool sequence, asserts passages/links/start match
- [ ] T060 [US1] Integration test in `tests/integration/us1_rename_preserves_graph.test.ts` — builds a story with 3 incoming links to "Hallway," renames to "Corridor," asserts 0 broken links post-rename (Constitution Principle III)
- [ ] T061 [US1] Integration test in `tests/integration/us1_html_playable.test.ts` — compiles HTML, launches headless Chromium via puppeteer, asserts start passage renders, clicking each link reaches the target passage (US1 scenario 2)
- [ ] T062 [US1] Integration test in `tests/integration/us1_twine_editor_roundtrip.test.ts` — saves story, reloads the HTML via `twine/adapter.parseHtml`, asserts deep-equal with the original state (US1 scenario 3, Constitution Principle IV)

**Checkpoint**: User Story 1 should be fully functional and testable independently — this is the MVP slice.

---

## Phase 4: User Story 2 — Server asks instead of assuming (Priority: P1)

**Goal**: When a tool call is missing required info, the server surfaces a
clarification via MCP elicitation (when supported) or a structured
`clarification_needed` payload + `respond_to_clarification` replay. Never a silent
default.

**Independent Test**: Run `tests/integration/us2_no_silent_defaults.test.ts` —
deliberately omit required fields across every mutation tool; assert 100% produce
a clarification and 0% apply a default.

> **NOTE**: Foundational task T018 already implements the clarification engine.
> This phase adds the user-visible replay tool and verifies every mutation tool
> produces the right triggers.

### Contract tests for User Story 2

- [ ] T063 [P] [US2] Contract test in `tests/contract/tool.respond_to_clarification.test.ts` — asserts the tool replays the originating call with the merged answer and chains further clarifications when needed

### Implementation for User Story 2

- [X] T064 [US2] Implement `src/server/tools/respond_to_clarification.ts` — looks up `clarification_id` in `clarification.ts`'s in-memory map, merges `answer` into stored `originating_args`, reinvokes the originating tool

### Integration tests for User Story 2

- [ ] T065 [P] [US2] Integration test in `tests/integration/us2_create_story_missing_format.test.ts` — `create_story({name: "X"})` with no format → `clarification_needed` + enumerated valid answers; no state change
- [ ] T066 [P] [US2] Integration test in `tests/integration/us2_link_to_nonexistent.test.ts` — `link_passages` to a missing target → clarification; silent creation never occurs
- [ ] T067 [P] [US2] Integration test in `tests/integration/us2_save_without_output.test.ts` — `save_story({})` → clarification asking for destination
- [ ] T068 [P] [US2] Integration test in `tests/integration/us2_elicitation_path.test.ts` — mock MCP client that advertises `elicitation`; verify the SDK elicitation primitive is invoked and tool resumes inline
- [ ] T069 [P] [US2] Integration test in `tests/integration/us2_fallback_replay.test.ts` — mock client without elicitation; verify `clarification_needed` payload, then `respond_to_clarification` replay yields the same final result as the elicitation path
- [ ] T070 [P] [US2] Integration test in `tests/integration/us2_no_silent_defaults.test.ts` — matrix over every mutation tool; asserts SC-004 (0% silent defaults)

**Checkpoint**: US1 + US2 both work independently on any MCP client.

---

## Phase 5: User Story 3 — Image placeholders with deterministic file drop (Priority: P2)

**Goal**: Author adds image placeholders; server reports the exact
`assets/<story-slug>/<label>.<ext>` path where the image file must land; played
HTML loads the image from that path and renders a labeled dashed-border fallback
when the file is missing.

**Independent Test**: Run `tests/integration/us3_placeholder_flow.test.ts` — adds
a placeholder, saves, inspects reported path, verifies compiled HTML in puppeteer
both with and without the image file present.

### Image engine

- [ ] T071 [US3] Implement `src/images/render.ts` — emit the `<div class="twinery-mcp-image" data-label="...">` + `<img>` + `<span class="missing-label">` HTML block per R3; function to inject/update the shared CSS in `story.style` so `.twinery-mcp-image.missing` renders as a dashed-border labeled box
- [ ] T072 [US3] Implement `src/images/placeholder.ts` — `addImagePlaceholder(passageName, label, extension?, insertionIndex?)` validating the label regex, checking uniqueness across the story (triggers clarification on collision), deriving `expected_filename` and `expected_folder`, inserting the emitted HTML via `render.ts`

### Contract tests for User Story 3

- [ ] T073 [P] [US3] Contract test in `tests/contract/tool.add_image_placeholder.test.ts` — validates inputs/outputs against `contracts/tool.add_image_placeholder.json`; asserts `path_is_final: false` pre-save and `true` post-save

### Implementation for User Story 3

- [ ] T074 [US3] Implement `src/server/tools/add_image_placeholder.ts` — thin wrapper around `images/placeholder.ts` (T072); clarifies on label collision (no silent rename) and unknown passage
- [ ] T075 [US3] Extend `src/server/tools/save_story.ts` (T055) to: (a) create `assets/<slug>/` directory, (b) walk the filesystem and return `pending_image_drops` for every placeholder whose expected file is missing

### Integration tests for User Story 3

- [ ] T076 [P] [US3] Integration test in `tests/integration/us3_expected_path.test.ts` — `add_image_placeholder("Forest", "ancient-tree")` in story "Locked Door" → returns `assets/locked-door/ancient-tree.png` (US3 scenario 1)
- [ ] T077 [P] [US3] Integration test in `tests/integration/us3_image_renders.test.ts` — drop PNG at reported path, compile HTML, load in puppeteer, assert image element visible (US3 scenario 2)
- [ ] T078 [P] [US3] Integration test in `tests/integration/us3_missing_fallback.test.ts` — no file dropped, compile HTML, load in puppeteer, assert `.twinery-mcp-image.missing` renders a labeled dashed-border box and no broken-image icon (US3 scenario 3, SC-009)
- [ ] T079 [P] [US3] Integration test in `tests/integration/us3_label_collision.test.ts` — two placeholders with the same label → clarification; no silent rename (edge case, FR-007)
- [ ] T080 [P] [US3] Integration test in `tests/integration/us3_path_report_matches_html.test.ts` — reported `expected_path` equals the `src` attribute the compiled HTML actually requests (SC-008)

**Checkpoint**: US1 + US2 + US3 all work independently.

---

## Phase 6: User Story 4 — LLM-facing guide + README always current (Priority: P2)

**Goal**: Every server start exposes `twinery://guide` whose content lists every
registered tool. `docs/GUIDE.md` is byte-identical to the resource body. A CI
drift gate blocks releases if the guide or README falls out of sync with the
tool surface.

**Independent Test**: Run `tests/contract/guide-drift.test.ts` and
`tests/contract/readme-drift.test.ts` — both must pass. Add a fake tool without
updating docs and confirm they fail.

### Guide generator

- [ ] T081 [US4] Implement `src/guide/build.ts` — generate GUIDE.md markdown from `ToolRegistry` (T017) + each tool's zod schemas; sections: overview, clarification mechanism, image placeholder convention, per-tool reference, end-to-end example
- [ ] T082 [US4] Implement `src/server/resources/guide.ts` — serves `twinery://guide` returning the bytes of `docs/GUIDE.md` (not regenerated per-request, per R6)

### Contract tests for User Story 4

- [ ] T083 [P] [US4] Contract test in `tests/contract/resource.guide.test.ts` — validates the resource envelope against `contracts/resource.guide.json` and asserts the content-contract items (every tool in registry is mentioned, image path convention documented, clarification mechanism explained)
- [ ] T084 [US4] Drift test in `tests/contract/guide-drift.test.ts` — regenerates the guide in memory via `guide/build.ts` and byte-compares to `docs/GUIDE.md`; fails on any diff (R6)
- [ ] T085 [US4] Drift test in `tests/contract/readme-drift.test.ts` — parses `README.md`'s tool table and asserts every `ToolRegistry` entry appears exactly once, no stale entries remain

### Authoring tasks for User Story 4

- [ ] T086 [US4] Run `guide/build.ts` (T081) once in a build script and commit the generated `docs/GUIDE.md`
- [ ] T087 [US4] Write `README.md` at repo root — sections: what it is, install (macOS/Linux/Windows), MCP client config snippet, minimal example from `quickstart.md`, full tool table (generated or hand-authored so that T085 passes), link to `docs/GUIDE.md`, license
- [ ] T088 [US4] Write `docs/quickstart.md` mirroring `specs/001-mcp-server-mvp/quickstart.md` with any end-user framing adjustments; linked from README
- [ ] T089 [US4] Implement `scripts/bash/generate-notice.sh` + `scripts/powershell/generate-notice.ps1` — runs `license-checker` and writes `NOTICE` with third-party attributions; wired into the build step
- [ ] T090 [US4] Wire T084 + T085 into CI workflow (extend T010 with additional test invocations)

**Checkpoint**: Every exposed tool is discoverable by both LLMs (via MCP resource)
and humans (via README), and drift is impossible at release time.

---

## Phase 7: User Story 5 — Cross-platform install and run (Priority: P3)

**Goal**: Maintainers on Windows, macOS, and Linux can install and launch the
server with a single platform-appropriate script. MCP client config snippet in
the README works everywhere with at most one OS-specific substitution.

**Independent Test**: Manual walkthrough of README install steps on each of
ubuntu-latest, macos-latest, windows-latest (automated via CI matrix where
feasible). Zero script edits required.

### Scripts

- [ ] T091 [P] [US5] Implement `scripts/bash/install.sh` — verify Node.js ≥ 20, run `npm ci`, print ready-to-paste MCP client config snippet (npx form)
- [ ] T092 [P] [US5] Implement `scripts/bash/run.sh` — launch the built server via `node dist/server/index.js` over stdio
- [ ] T093 [P] [US5] Implement `scripts/powershell/install.ps1` — same behaviour as T091, Windows idioms
- [ ] T094 [P] [US5] Implement `scripts/powershell/run.ps1` — same as T092

### CI + packaging for User Story 5

- [ ] T095 [US5] Confirm `package.json` `bin` entry from T001 produces a working `twinery-mcp` command after `npm install -g` (smoke test in CI on each matrix OS)
- [ ] T096 [US5] Extend CI (T010) matrix to run `tests/integration/**` on ubuntu-latest, macos-latest, and windows-latest; flag any OS-specific failures
- [ ] T097 [P] [US5] Integration test in `tests/integration/us5_npx_snippet.test.ts` — spawn the server via the README's recommended `npx -y @twinery/mcp-server` command (using a local file path in test mode), run a tool-list MCP request, assert non-empty tool list

**Checkpoint**: Install and first successful tool call work on all three platforms
with zero manual patching (SC-005).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and release readiness

- [ ] T098 [P] Performance benchmark in `tests/unit/perf.graph-ops.test.ts` — build a 500-passage fixture story and assert every graph-mutation tool call completes in ≤ 200 ms (Technical Context perf goal)
- [ ] T099 [P] Performance benchmark in `tests/unit/perf.save-compile.test.ts` — assert `save_story` with HTML compile completes in ≤ 2 s for the 500-passage fixture
- [ ] T100 [P] Startup benchmark in `tests/integration/perf.startup.test.ts` — cold stdio handshake to ready in ≤ 500 ms
- [ ] T101 [P] Security / isolation test in `tests/integration/no-network.test.ts` — assert the server process makes zero outbound network calls during a full tool suite run (uses process-level network mock)
- [ ] T102 [P] Accessibility check in `tests/integration/us3_a11y_fallback.test.ts` — assert the missing-image fallback `<div>` carries `aria-label` equal to the placeholder label
- [ ] T103 Final Constitution Check sweep — reread `.specify/memory/constitution.md`, re-run `/speckit.analyze`, verify every principle is satisfied in the implemented code; document any accepted deviations in `plan.md` Complexity Tracking (expected: none)
- [ ] T104 Human-verification pass on each platform — walk through `specs/001-mcp-server-mvp/quickstart.md` on Windows, macOS, and Linux; confirm SC-001 (branching story in under 15 minutes), SC-005 (install under 10 minutes per platform)
- [ ] T105 Tag release candidate v1.0.0-rc1 — ensure `CHANGELOG.md` reflects every tool and user-visible change (FR-009); publish to npm dry-run to verify packaging before a live publish (live publish is out of scope for this tasks.md and requires human approval)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP slice
- **User Story 2 (Phase 4)**: Depends on Foundational (T018 clarification engine). Can run in parallel with US1 once foundational is complete, though several US2 integration tests exercise US1 tools
- **User Story 3 (Phase 5)**: Depends on US1 (needs a functioning story + passage tools + save). Can run in parallel with US4 once US1 is complete
- **User Story 4 (Phase 6)**: Depends on ALL prior user-story tool implementations being registered in `ToolRegistry`. The drift test cannot pass until every tool exists; finishing US4 is effectively the final gate before US5 and Polish
- **User Story 5 (Phase 7)**: Depends on the server building and running (post-US1). Script content can be drafted earlier
- **Polish (Phase 8)**: Depends on all user stories being complete

### Within Each User Story

- Contract tests written BEFORE implementation (Constitution Dev Workflow)
- Graph helpers (T031, T032, T033) before the tool wrappers that depend on them (T048, T049, T050)
- `images/render.ts` (T071) before `images/placeholder.ts` (T072) before the tool wrapper (T074)
- Integration tests after all implementation tasks in the story

### Parallel Opportunities

- All Setup tasks marked [P] (T002–T009) can run in parallel after T001
- All Foundational fixture creation (T020–T023) and round-trip tests (T025–T028) can run in parallel after T012
- Within US1: T034–T044 (contract tests) are all [P]; T045–T054, T056–T058 (tool and resource impls) are mostly [P] except where they depend on graph helpers
- Within US2: integration tests T065–T070 are all [P]
- Within US3: integration tests T076–T080 are all [P]
- Within US5: all four scripts (T091–T094) are [P]
- Polish: T098–T102 are all [P]

---

## Parallel Example: User Story 1 Contract Test Batch

```bash
# After foundational phase completes, launch the US1 contract-test tranche together:
T034: tests/contract/tool.create_story.test.ts
T035: tests/contract/tool.create_passage.test.ts
T036: tests/contract/tool.update_passage.test.ts
T037: tests/contract/tool.rename_passage.test.ts
T038: tests/contract/tool.delete_passage.test.ts
T039: tests/contract/tool.link_passages.test.ts
T040: tests/contract/tool.set_start_passage.test.ts
T041: tests/contract/tool.list_passages.test.ts
T042: tests/contract/tool.get_passage.test.ts
T043: tests/contract/tool.validate_story.test.ts
T044: tests/contract/tool.save_story.test.ts
# All eleven files touch different paths and can be authored in parallel.
# Each asserts its contract JSON and is expected to FAIL until the matching
# implementation task (T045–T055) lands.
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run `tests/integration/us1_*.test.ts`; manually drive the
   Locked Door story from an MCP client; open the HTML in a browser and in Twine 2
5. Decide whether to ship v0.1 or continue to US2

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add User Story 1 → MVP; ships as v0.1 if desired
3. Add User Story 2 → clarification flow hardened; v0.2
4. Add User Story 3 → image placeholders; v0.3
5. Add User Story 4 → guide + README drift gate; v0.4 (required before public
   release because it enforces discoverability)
6. Add User Story 5 → cross-platform install; v0.5
7. Polish → v1.0.0

### Parallel Team Strategy

With multiple contributors:

1. Team completes Setup + Foundational together (Phase 1 + Phase 2). Fixtures and
   round-trip tests (T020–T028) are highly parallelisable
2. Once Foundational is done:
   - Contributor A: User Story 1 (the big one; may be split — graph helpers vs.
     tool wrappers vs. resources)
   - Contributor B: User Story 2 integration tests + `respond_to_clarification`
   - Contributor C: User Story 5 scripts (these are independent of story tools)
3. Once US1 lands, Contributors B and C fold into US3 (images) and US4 (guide)
4. Polish phase is end-of-project

---

## Notes

- Tasks follow the strict `- [ ] TxxX [P?] [Story?] Description with file path`
  format.
- [P] tasks = different files, no dependencies.
- [Story] label applied only to tasks inside a user-story phase (Phases 3–7).
- Setup / Foundational / Polish tasks carry no [Story] label.
- Verify contract tests fail before implementing the matching tool.
- Commit after each task or coherent group; the project has an optional
  `/speckit.git.commit` hook available.
- Do not skip the Constitution Principle III helpers (T031–T033) and try to do
  link rewriting in tool bodies directly — that's exactly the bug class the
  helpers exist to prevent.
- Do not skip the drift gates (T084, T085); FR-009 is not a best-effort.
