# Implementation Plan: Twinery MCP Server — v1.0 MVP

**Branch**: `001-mcp-server-mvp` | **Date**: 2026-04-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-mcp-server-mvp/spec.md`

## Summary

Build a stdio-transport MCP server in TypeScript/Node.js that lets any MCP-compliant
client drive authoring of branching Twine 2 stories — create, mutate, link, save,
compile to playable HTML, and place image placeholders that report expected file
paths to the author. The server exposes a machine-readable guide as an MCP resource
(and maintains it as a static file in the repo) so LLMs pick up the tool surface on
turn one. All Twine format parsing and emission is delegated to `extwee`; graph
mutations that change passage names rewrite all incoming links in server code so
LLMs cannot silently corrupt a story by editing raw text. Missing-input tool calls
never silently default — they surface via MCP elicitation when the client supports
it, otherwise via a structured `clarification_needed` payload. The project ships
under MIT with OSI-permissive runtime deps; install and run scripts are provided in
both bash (macOS / Linux) and PowerShell (Windows) flavors.

## Technical Context

**Language/Version**: TypeScript 5.4+ targeting Node.js 20 LTS (the current active
LTS line across macOS, Linux, and Windows).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP server + stdio transport);
`extwee` (IFTF-spec parser/emitter for Twee 3, Twine 2 HTML, Twine 2 JSON; also
auto-generates spec-valid IFIDs); `zod` (tool input schemas, from which JSON Schema
is derived for MCP and for the guide).
**Storage**: In-memory single active story (per Constitution); persisted to the
filesystem by `save_story` as a `.twee` source plus (optionally) a compiled `.html`.
No database.
**Testing**: `vitest` for unit + contract tests; `puppeteer` (headless Chromium) for
HTML render / play-time verification including image-placeholder fallback rendering.
Fixture stories per story format live under `tests/fixtures/`.
**Target Platform**: Node.js 20 LTS on Windows 10/11, macOS 13+, and current Debian /
Ubuntu / Fedora. No native compilation — pure JavaScript deps only.
**Project Type**: Single project — an installable MCP server binary published to npm
as `@twinery/mcp-server` with a CLI entrypoint.
**Performance Goals**: Graph-mutation tool calls return in ≤ 200 ms for stories up
to 500 passages. `save_story` with HTML compile completes in ≤ 2 s for the same
size. Startup (stdio handshake to ready) in ≤ 500 ms on a cold Node.js process.
**Constraints**: stdio transport only for v1.0 (HTTP/SSE deferred). Zero imports of
any LLM-provider SDK (Anthropic, OpenAI, Google, Cohere, etc.) in any code path —
enforced by a CI grep check. All runtime dependencies under OSI-permissive licenses
(MIT / BSD-2 / BSD-3 / Apache-2.0 / ISC / MPL-2.0) — enforced by a CI license-check
step. Story round-trip parity with native Twine 2 editor v2.12.0+.
**Scale/Scope**: v1.0 targets single-author workflows, one active story, up to ~500
passages per story. Concurrency: last-write-wins with warning (per Constitution).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| **I. Spec-Faithful Format Fidelity (NON-NEGOTIABLE)** | ✅ | All parsing and emission delegated to `extwee`; no hand-rolled Twine format code in this project. IFID generation uses extwee's spec-compliant generator. |
| **II. MCP-Native & Model-Agnostic** | ✅ | Server uses `@modelcontextprotocol/sdk` directly. No LLM-provider SDKs imported. stdio is default transport. CI enforces both via grep + license-check. |
| **III. Graph-Integrity First (NON-NEGOTIABLE)** | ✅ | `rename_passage`, `delete_passage`, `link_passages`, `validate_story` implemented as dedicated tools; link rewriting lives in server code (`src/graph/`). Mutation tools never pass raw text edits through. |
| **IV. Native-Twine Export Parity** | ✅ | `save_story` routes through extwee's emit path. Round-trip fixture tests for all four story formats gate the release. `puppeteer` verifies the compiled HTML boots. |
| **V. Open-Source Licensing Discipline** | ✅ | MIT license; `NOTICE` generated from `package.json`. CI fails if any runtime dep carries a non-permissive license. No LLM-provider SDKs in the runtime dep tree. |

**Additional Constraints (Tech Stack, Dependency Policy, State & Concurrency)**: All
satisfied by the choices in Technical Context.

**Development Workflow (Testing Discipline, Review & Release)**:
- Fixture-based round-trip tests per format ✅ (Phase 1 design captures this in
  `tests/fixtures/`).
- Mutation tools have integrity tests ✅ (planned under `tests/contract/`).
- Compile-path verification via headless browser ✅ (`puppeteer` in devDependencies).
- Guide-drift release gate ✅ (a test reconciles `tools/` exports against
  `docs/GUIDE.md` and `README.md`).

**Result**: No violations. Complexity Tracking table is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-server-mvp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output — one JSON-Schema file per tool + per resource
└── checklists/
    └── requirements.md  # Spec-quality checklist (from /speckit.specify)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── index.ts              # CLI entrypoint; wires stdio transport
│   ├── tools/                # One file per MCP tool (thin handler around src/graph, src/images)
│   ├── resources/            # MCP resource handlers (guide, summary, graph, twee)
│   └── clarification.ts      # MCP elicitation + structured `clarification_needed` fallback
├── twine/
│   ├── adapter.ts            # Thin wrapper around `extwee` parse/emit/compile
│   └── formats.ts            # Story-format identifiers, link syntax per format
├── graph/
│   ├── rename.ts             # rename_passage with incoming-link rewrite
│   ├── delete.ts             # delete_passage with incoming-link reporting
│   └── link.ts               # link_passages with format-aware syntax
├── images/
│   ├── placeholder.ts        # add_image_placeholder, slug + filename + folder rules
│   └── render.ts             # Fallback <div> markup emitted into passage text
├── guide/
│   ├── build.ts              # Generates GUIDE.md from tool registry + zod schemas
│   └── registry.ts           # Tool metadata source of truth
└── lib/                      # Shared utilities (slug, path, logging)

tests/
├── fixtures/
│   ├── harlowe/
│   ├── sugarcube/
│   ├── chapbook/
│   └── snowman/
├── contract/                 # Per-tool JSON-schema conformance + round-trip tests
├── integration/              # End-to-end stories matching US1, US2, US3, US4, US5
└── unit/

scripts/
├── bash/
│   ├── install.sh            # Cross-distro: checks Node.js 20, runs `npm ci`
│   └── run.sh                # Launches the server (stdio)
└── powershell/
    ├── install.ps1
    └── run.ps1

docs/
├── GUIDE.md                  # LLM-facing guide (also served as MCP resource)
└── quickstart.md             # Human-facing getting-started (linked from README)

README.md                     # Human-facing overview + install + minimal example
LICENSE                       # MIT
NOTICE                        # Generated third-party attributions
package.json
tsconfig.json
.github/workflows/ci.yml      # Lint, tests, license-check, no-LLM-SDK grep
```

**Structure Decision**: Single-project TypeScript package published to npm. Matches
the project classification in Technical Context (one MCP server binary, not a
split frontend/backend). All source under `src/`, tests under `tests/`, platform
scripts under `scripts/bash/` and `scripts/powershell/` per FR-010.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table intentionally empty.
