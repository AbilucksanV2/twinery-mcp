# Implementation Plan: Variable management tools

**Branch**: `011-variables` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-variables/spec.md`

## Summary

Six new MCP tools (`declare_variable`, `set_variable`, `read_variable`,
`list_variables`, `delete_variable`, `insert_variable_reader`) that
let an LLM introduce state into a Twine story without hand-writing
format-specific macro syntax. The tools share one helper module
(`src/twine/variables.ts`) which knows how to **emit** and **extract**
setter / reader expressions for each of the four supported story
formats (Harlowe, SugarCube, Chapbook, Snowman). The active-story
singleton from v0.4 gains a `variables` registry — populated by tool
calls in this session AND by `load_story` parsing existing setters
out of loaded passage text (FR-004a, from clarify session 2026-05-15).
Net new runtime dependencies: zero.

## Technical Context

**Language/Version**: TypeScript 5.4+ on Node.js 20 LTS (unchanged from v0.5).
**Primary Dependencies**: Unchanged — `@modelcontextprotocol/sdk`, `extwee@^2.2.0`, `zod@^3.23.8`. extwee already stores passage text as opaque strings on the `Passage` object, so setter/reader syntax round-trips through `parseTwee` / `toTwee` / `parseTwine2HTML` / `toTwine2HTML` / `parseJSON` / `toJSON` without any extwee API extension.
**Storage**: Unchanged — single active story in process memory. Variables registry lives next to `imagePlaceholders` on the `ActiveStory` shape. No new on-disk artifact; setters / readers are persisted as part of the passage text itself, which already round-trips per F-FIXTURES.
**Testing**: Existing `npm run smoke` extended with one new section (`23c`) that exercises declare → set → reader → save → reload across at least one format. F-FIXTURES round-trip suite extended in a follow-up task to include one variable per format (SC-002).
**Target Platform**: Unchanged — Node.js 20 LTS, cross-platform (ubuntu / macos / windows via existing CI matrix).
**Project Type**: Unchanged — single TypeScript package.
**Performance Goals**: Each tool call completes in ≤ 200 ms on a developer laptop (matches the latency budget of existing tools).
**Constraints**: Constitution principles unchanged; principle I (spec-faithful format fidelity) is the tightest constraint — every emitted setter and reader MUST be exactly the format's published macro syntax, verbatim, with no whitespace drift that would prevent the format runtime from parsing it.
**Scale/Scope**: Single active story; expected variable count per story ≤ 50 in practice (no hard cap enforced).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| **I. Spec-Faithful Format Fidelity (NON-NEGOTIABLE)** | ✅ | Every setter / reader is the format's published macro syntax verbatim (Harlowe `(set: $X to Y)` / `$X`, SugarCube `<<set $X to Y>>` / `<<= $X>>`, Chapbook `X: Y` in vars section / `{X}`, Snowman `<% s.X = Y %>` / `<%= s.X %>`). No inventions, no extensions. Emit and extract logic lives in one module (`src/twine/variables.ts`) per format so the contract is auditable in one place. |
| **II. MCP-Native & Model-Agnostic** | ✅ | Six new MCP tools registered through the existing `@modelcontextprotocol/sdk` server surface; no LLM-provider SDK import. The tools work identically over stdio and the v0.5 HTTP transport. The CI `check-no-llm-sdk.mjs` gate catches accidental violations. |
| **III. Graph-Integrity First (NON-NEGOTIABLE)** | ✅ | `delete_variable` removes every setter and every reader atomically — same graph-integrity-first contract as `rename_passage` (which rewrites every incoming link atomically) and `delete_passage` (which handles incoming links via clarification). `delete_passage` is extended to also strip variable references owned by the deleted passage from the registry. |
| **IV. Native-Twine Export Parity** | ✅ | Variables live in passage text. `save_story` writes the passage text verbatim; the Twine 2 editor opens the `.html` and plays the variable semantics natively. SC-003 requires this end-to-end check for at least Harlowe + SugarCube before the feature ships. |
| **V. Open-Source Licensing Discipline** | ✅ | Zero new dependencies. The `check-licenses.mjs` allowlist gate continues to pass unchanged. |

**Result**: No violations. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-variables/
├── plan.md                                      # this file
├── spec.md                                      # /speckit.specify + /speckit.clarify
├── research.md                                  # Phase 0 — six micro-decisions
├── data-model.md                                # Phase 1 — registry shape
├── contracts/
│   └── tools.json                               # Phase 1 — input/output schemas for all 6 tools
├── quickstart.md                                # Phase 1 — author-flow walkthrough
├── checklists/
│   └── requirements.md                          # /speckit.specify quality gate
└── tasks.md                                     # /speckit.tasks (not produced by /speckit.plan)
```

### Source Code (changes from v0.5 baseline)

```text
src/
├── server/
│   ├── tools/
│   │   ├── declare_variable.ts                  (new)
│   │   ├── set_variable.ts                      (new)
│   │   ├── read_variable.ts                     (new)
│   │   ├── list_variables.ts                    (new)
│   │   ├── delete_variable.ts                   (new)
│   │   ├── insert_variable_reader.ts            (new)
│   │   ├── load_story.ts                        (modified — extract setters on load → populate registry, FR-004a)
│   │   └── delete_passage.ts                    (modified — strip variable refs owned by the deleted passage)
│   └── state.ts                                 (modified — ActiveStory gains `variables` registry next to imagePlaceholders)
├── twine/
│   └── variables.ts                             (new — format-aware emit + extract for setters and readers)
├── guide/
│   └── registry.ts                              (modified — register 6 new tools; guide regenerates via `npm run guide:generate`)
└── smoke.ts                                     (modified — new section 23c exercises declare → set → reader → save → reload)

docs/
└── GUIDE.md                                     (regenerated; CI guide-drift gate enforces)

fixtures/                                        (touched in a separate follow-up task per SC-002 —
                                                  one variable added per format to the existing
                                                  source.twee fixtures; runner already structurally
                                                  compares passage text so no fixture runner change)
```

**Structure Decision**: Same single-package TypeScript layout as v0.5. All new tool files follow the established `description / clarificationTriggers / example / inputSchema / handler` export shape so they wire into the guide registry without ceremony. The one shared helper (`src/twine/variables.ts`) keeps the per-format syntax in one auditable place — same pattern as `src/twine/formats.ts` for link syntax. No new top-level directories.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

No violations.
