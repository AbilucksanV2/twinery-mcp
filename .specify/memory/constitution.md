<!--
SYNC IMPACT REPORT
==================
Version change: (unratified template) → 1.0.0
Bump rationale: Initial ratification. Template placeholders replaced with project-specific
principles; no prior semantic baseline existed, so this is the first MAJOR release.

Modified principles:
  - [PRINCIPLE_1_NAME] → I. Spec-Faithful Format Fidelity (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. MCP-Native & Model-Agnostic
  - [PRINCIPLE_3_NAME] → III. Graph-Integrity First (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. Native-Twine Export Parity
  - [PRINCIPLE_5_NAME] → V. Open-Source Licensing Discipline

Added sections:
  - Additional Constraints (tech stack, transport, encoding, dependency policy)
  - Development Workflow (review gates, fixture-based testing, release process)

Removed sections: none (all template slots filled).

Templates requiring updates:
  - .specify/templates/plan-template.md         ✅ aligned (Constitution Check slot
                                                   is generic; /plan will populate
                                                   with the five principles above)
  - .specify/templates/spec-template.md         ✅ aligned (no new mandatory sections)
  - .specify/templates/tasks-template.md        ✅ aligned (no new principle-driven
                                                   task category required)
  - .specify/templates/commands/*.md            ✅ no stale agent-specific references
  - CLAUDE.md                                   ✅ pointer to current plan, unchanged
  - README.md                                   ⚠ not present — create when project
                                                   work begins so it can cite the
                                                   constitution and license (MIT)

Follow-up TODOs: none. RATIFICATION_DATE set to 2026-04-23 (today, first adoption).
-->

# Twinery MCP Constitution

## Core Principles

### I. Spec-Faithful Format Fidelity (NON-NEGOTIABLE)

All story I/O MUST conform to the IFTF Twine specifications: **Twee 3**, **Twine 2
HTML Output**, and **Twine 2 JSON Output** (see `iftechfoundation/twine-specs`).
Parsing and emitting MUST be delegated to an upstream spec-maintained library
(`extwee` is the default; `Tweego` is acceptable as an opt-in shell-out for final
HTML compilation). The server MUST NOT invent or extend these formats — if a
capability requires format deviation, the deviation MUST be rejected or lowered
to a spec-compliant equivalent before reaching disk.

**Rationale:** Twine stories authored by the MCP server MUST be indistinguishable
from stories authored by the native Twine editor. Any drift in format (escape
handling, `tw-storydata` attributes, Twee header parsing) silently corrupts
interoperability with the Twine 2 desktop, web, and mobile UIs, which are the
primary human-facing editors.

### II. MCP-Native & Model-Agnostic

The server MUST expose its surface through the standard Model Context Protocol
primitives (**Tools**, **Resources**, **Prompts**) using an official MCP SDK
(`@modelcontextprotocol/sdk` for TypeScript; `python-sdk` if Python is chosen).
**stdio** is the default transport; additional transports (HTTP+SSE) MAY be
added but MUST NOT replace stdio. The runtime MUST NOT import any LLM-provider
SDK (Anthropic, OpenAI, Google, Cohere, etc.), MUST NOT call any model inference
endpoint, and MUST NOT branch on model identity, vendor, or capability flags.
Every tool MUST be driveable by any spec-compliant MCP client regardless of the
model on the other side.

**Rationale:** The value of the project is exposing Twine as a first-class,
model-agnostic MCP server. Leaning on standard MCP primitives means every
compliant client — Claude Desktop, VS Code's MCP client, local Llama setups,
future clients — can use the server without adaptation. Prompts and heuristics
tuned to a specific model create lock-in and bitrot the moment that model
changes, and they prevent reuse by the broader ecosystem.

### III. Graph-Integrity First (NON-NEGOTIABLE)

A Twine story is a directed graph whose edges are embedded inside passage text
via format-specific link syntax (`[[text->target]]`, `[[text|target]]`, etc.).
The server MUST treat the graph as the authoritative model and guarantee:

- `rename_passage` rewrites every incoming `[[...]]` reference across every
  passage in the story, matching the active story format's link syntax.
- `delete_passage` enumerates and reports every orphaned incoming reference
  before or at deletion time.
- `link_passages` emits link syntax that matches the story's declared format
  (Harlowe, SugarCube, Chapbook, Snowman).
- `validate_story` MUST detect: duplicate passage names, IFID shape violations,
  missing `Start` / `StoryData` / `StoryTitle`, broken `[[...]]` targets, and
  passages unreachable from the start passage.

Tools that mutate passage text MUST NOT bypass these guarantees by letting the
model freely rewrite raw text to perform renames, link insertions, or
deletions. These operations MUST be expressed as dedicated tools.

**Rationale:** Raw-text editing of `[[...]]` links is the single operation LLMs
most reliably get wrong (mismatched quotes, format confusion, missed
references). Enforcing graph invariants in server code — not in prompts —
eliminates an entire class of silent data-corruption bugs.

### IV. Native-Twine Export Parity

Every story the server writes MUST be openable in the official Twine 2 editor
(desktop, web at `twinery.org/2`, and any native-device Twine UI) and MUST
round-trip through that editor without loss of passage names, tags, position
metadata, size metadata, IFID, story format, format version, tag colors, zoom,
style block, or script block. The compiled HTML path MUST preserve play
behavior identical to a story compiled inside the native Twine editor for the
same declared story format and version.

The server MUST prefer upstream-maintained export paths (extwee emit, Tweego
shell-out) over custom emitters. If a tool cannot guarantee round-trip parity
for a given input, it MUST surface a warning to the client and MUST NOT silently
drop or rewrite fields.

**Rationale:** Twine already has excellent authoring UIs across platforms. The
MCP server is a complement, not a replacement: authors will move stories back
and forth between the MCP-driven workflow and the Twine editor. Any field loss
or behavioral drift on a single round-trip erodes that trust permanently.

### V. Open-Source Licensing Discipline

The project is released under the **MIT License**. All direct and transitive
runtime dependencies MUST carry OSI-approved licenses compatible with MIT
redistribution — specifically MIT, BSD-2/BSD-3, Apache-2.0, ISC, or MPL-2.0 at
the file level. Copyleft licenses (GPL, AGPL, LGPL) are prohibited as runtime
dependencies; they MAY appear only in developer-only tooling that is not
shipped. A `NOTICE` or `THIRD_PARTY_LICENSES` file MUST be maintained and
regenerated on every dependency change. Upstream libraries with overlapping
functionality (e.g. `extwee`, `Tweego`, `twine-utils`, `@modelcontextprotocol/sdk`)
MUST be used in preference to reimplementation; forking is permitted only when
the upstream project is unmaintained or materially blocks a principle above.

**Rationale:** Twine itself is open-source and community-maintained by IFTF.
An MCP server for Twine that is not freely redistributable would fragment that
community. License hygiene also prevents accidental GPL contamination that
would force future downstream users into terms they did not sign up for.

## Additional Constraints

**Technology Stack**
- Primary implementation: **Node.js (LTS) + TypeScript**, with `@modelcontextprotocol/sdk`
  and `extwee`. Python + `python-sdk` is a permitted alternative but MUST still
  satisfy every principle above.
- Default transport: **stdio**. HTTP+SSE is opt-in.
- Default story format: **Harlowe 3.x** (matches Twine UI default). All four
  story formats (Harlowe, SugarCube, Chapbook, Snowman) MUST be testable.
- Encoding: **UTF-8** on all inputs and outputs. File extensions: `.tw`,
  `.twee`, `.html`, `.json` — as specified by IFTF.

**Dependency Policy**
- A dependency is only added if it is (a) OSI-approved under a permissible
  license (see Principle V), (b) actively maintained, and (c) replaces code we
  would otherwise write ourselves.
- Twine format parsing / emission MUST use a spec-maintained library — never a
  hand-rolled parser — to preserve format fidelity (Principle I).

**State & Concurrency**
- Start with a single-story in-memory model persisted via `save_story`. A
  `story_id` parameter MAY be added later. Concurrent writes to the same
  passage MUST resolve as last-write-wins with an explicit warning emitted to
  the client.

## Development Workflow

**Constitution Check Gate**
- Every plan (`/speckit.plan`) MUST include a Constitution Check that
  enumerates how the five principles are satisfied (or, for unavoidable
  deviations, documents them in the plan's Complexity Tracking table with
  explicit justification).

**Testing Discipline**
- Fixture-based round-trip tests MUST cover all three formats (Twee 3 ↔
  Twine 2 HTML ↔ Twine 2 JSON) for at least one non-trivial story per story
  format (Harlowe / SugarCube / Chapbook / Snowman).
- Every mutation tool (create, update, rename, delete, link) MUST have a test
  that asserts the graph-integrity guarantees in Principle III.
- The compile path MUST be verified by opening the emitted HTML in a
  browser-backed test runner (or headless equivalent) and confirming the
  declared start passage renders.

**Review & Release**
- Every PR MUST verify: (a) no LLM-provider SDK has been imported, (b) no new
  runtime dependency violates the license policy, (c) `NOTICE` /
  `THIRD_PARTY_LICENSES` is up to date, (d) affected Twine formats still
  round-trip. CI MUST enforce (a) and (b) mechanically.
- Semantic versioning applies to the server as a whole; the MCP tool surface
  is part of the public contract — removing or renaming a tool is a MAJOR
  change.

## Governance

This Constitution supersedes ad-hoc convention. When a tool, dependency, or
design choice conflicts with a principle above, the principle wins and the
conflicting work MUST be revised, justified in a plan's Complexity Tracking
table, or the Constitution MUST be amended before the work merges.

**Amendment procedure:** Amendments are proposed via pull request that (a)
edits this file, (b) updates the Sync Impact Report comment at the top, (c)
propagates changes through `.specify/templates/*` and any affected runtime
guidance (`CLAUDE.md`, `README.md`, etc.), and (d) bumps the version per the
rules below. Amendments merge only after a human reviewer confirms the sync
impact is complete.

**Versioning policy (applies to this document's `Version` line):**
- **MAJOR** — a principle is removed, redefined in a backward-incompatible
  way, or the governance model changes.
- **MINOR** — a new principle or a new mandatory section is added, or an
  existing principle is materially expanded.
- **PATCH** — clarifications, wording, typo fixes, or non-semantic
  refinements.

**Compliance review:** Each `/speckit.analyze` run MUST cross-check the
feature's spec, plan, and tasks against every principle above and flag
violations. Runtime development guidance lives in `CLAUDE.md` and per-feature
plans; this Constitution is the source of truth when they disagree.

**Version**: 1.0.0 | **Ratified**: 2026-04-23 | **Last Amended**: 2026-04-23
