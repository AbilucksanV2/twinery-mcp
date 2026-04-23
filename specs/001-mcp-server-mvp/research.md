# Phase 0 Research: Twinery MCP Server v1.0 MVP

**Feature**: 001-mcp-server-mvp
**Date**: 2026-04-23
**Inputs**: [spec.md](./spec.md), [../../.specify/memory/constitution.md](../../.specify/memory/constitution.md),
[../../RESEARCH.md](../../RESEARCH.md) (foundational Twine / MCP research from 2026-04-17).

The project-root `RESEARCH.md` covers the Twine fundamentals (formats, story
formats, upstream libs, MCP SDK choice). This document resolves only the
**feature-specific** questions Technical Context raised; each has a Decision,
Rationale, and Alternatives Considered block per the Spec Kit template.

---

## R1 — MCP elicitation vs. structured fallback (for FR-006)

**Decision**:
- At stdio session initialisation, read the client's advertised capabilities.
- If `elicitation` is present, use the MCP SDK's elicitation request primitive to
  ask clarifying questions mid-tool-call and receive the author's answer inline.
- If `elicitation` is absent, return a `CallToolResult` whose structured content is
  a `ClarificationNeeded` object (see data-model.md) with `isError: false`. The
  client surfaces the question to the LLM, which relays it to the author and then
  calls the dedicated `respond_to_clarification` tool to resume.
- Internally, both paths converge on the same `ClarificationRequest` object, so the
  tool implementations do not branch on transport.

**Rationale**:
- Elicitation delivers the best UX where supported (native client prompt, no LLM
  relay), but it is not universal in clients at time of writing.
- A structured fallback keeps the server usable on every MCP-compliant client, so
  FR-011 ("integration requires no code changes") remains achievable.
- Funnelling both paths through one internal object keeps the contracts testable
  and matches Constitution principle II (model-agnostic, no client-specific
  branching in tool logic).

**Alternatives considered**:
- *Elicitation-only (Q1 option C)*: rejected — blocks users on clients that have
  not adopted elicitation yet, contradicting FR-011.
- *Structured-only (Q1 option B)*: rejected — sacrifices native-prompt UX on
  modern clients for a marginal simplification.
- *Raise an MCP "error" response*: rejected — conflates error with "need info,"
  which makes it indistinguishable from real failures in client UIs.

---

## R2 — `extwee` API coverage for v1.0 needs

**Decision**: Use `extwee` (npm `extwee`) as the single Twine-format library.
Route the following operations through it:
- Parse `.twee` / `.tw` → in-memory story JSON
- Emit `.twee` from in-memory story
- Compile in-memory story → Twine 2 HTML, bundling the named story format's runtime
- Validate IFID shape and auto-generate spec-valid IFIDs when absent

**Rationale**:
- `extwee` covers all three IFTF formats (Twee 3, Twine 2 HTML, Twine 2 JSON) in
  both directions, which satisfies Principle I with zero hand-rolled parsing.
- It is actively maintained and MIT-licensed (checked during research).
- It bundles the four Twine story-format runtimes (Harlowe / SugarCube / Chapbook /
  Snowman) needed to produce playable HTML, so we do not need to shell out to
  Tweego for v1.0 (simpler install story).

**Alternatives considered**:
- *Tweego shell-out*: rejected for v1.0 because it requires users to install a
  separate binary, violating the "easy integration" spirit of FR-011. May be added
  as an opt-in path in a later release for users who already have Tweego.
- *Hand-rolled parser*: rejected — directly prohibited by Constitution principle I.
- *`twine-utils` (klembot)*: viable alternative but more fragmented API; `extwee`
  is the lower-surface-area choice.

---

## R3 — Image placeholder rendering across all four story formats

**Decision**: Emit an HTML `<img>` with a wrapping fallback `<div>` directly into
the passage text. The block looks like:

```html
<div class="twinery-mcp-image" data-label="ancient-tree">
  <img src="assets/locked-door/ancient-tree.png"
       alt="ancient-tree"
       onerror="this.style.display='none';this.parentNode.classList.add('missing')">
  <span class="missing-label">ancient-tree</span>
</div>
```

A single global stylesheet block is injected into the story's `style` field (via
`create_story` and refreshed on each image placeholder add) that styles
`.twinery-mcp-image.missing` as a dashed-border labeled box.

**Rationale**:
- All four IFTF story formats (Harlowe, SugarCube, Chapbook, Snowman) pass raw
  HTML through by default (verified from format docs during Phase 0). So one
  emission strategy works everywhere.
- The `onerror` hook gives us the missing-file fallback without any runtime JS
  framework — satisfies FR-007's "labeled `<div>` fallback" with zero extra
  dependencies and zero format-specific macro code.
- Placing the stylesheet in the story's `style` block means it survives round-
  trips through the native Twine editor (Constitution Principle IV).

**Alternatives considered**:
- *Format-specific macros* (`{embed}` in Chapbook, Harlowe `(display:)` tricks):
  rejected — multiplies surface area by 4 without UX gain, and the Harlowe path
  in particular is awkward.
- *External script injected into each story*: rejected — adds a script tag the
  user sees in the Twine editor and needs to maintain.
- *CSS `::before` for the label*: rejected — does not play well with screen
  readers and is harder to label per-placeholder.

---

## R4 — CLI packaging for cross-platform easy integration (FR-010, FR-011)

**Decision**: Publish to npm as `@twinery/mcp-server` with a `bin` entry that
becomes `twinery-mcp` on `PATH` after install. MCP client configs use
`npx -y @twinery/mcp-server` as the command, which requires only Node.js 20+ to be
installed on the host. Platform install scripts (`scripts/bash/install.sh`,
`scripts/powershell/install.ps1`) verify the Node version, run `npm ci`, and print
the ready-to-paste MCP client config snippet.

**Rationale**:
- `npx -y` is the lowest-friction cross-platform pattern — works identically on
  Windows, macOS, and Linux and is a well-understood convention in the MCP
  ecosystem (Filesystem, Fetch, and other reference servers ship this way).
- A single binary name on `PATH` matches how UnityMCP and the Godot MCP servers
  invite users to integrate (one executable, one args list) per the user's
  reference.
- The install scripts are wrappers, not logic — they exist only because the user
  asked for a platform-native on-ramp. They must not diverge in behavior.

**Alternatives considered**:
- *Standalone native binary via `pkg` / `nexe`*: rejected — adds a build matrix
  (Windows / macOS / Linux) for no tangible benefit to npm-enabled users, and
  complicates license compliance for bundled deps.
- *`uvx`-style Python entrypoint*: rejected — Python would require porting
  `extwee` or a separate parser; Node.js is already the ecosystem where `extwee`
  lives.
- *`npm install -g`*: permitted, but not the default. The quickstart will show
  `npx -y` first and mention `-g` as an opt-in for offline/air-gapped use.

---

## R5 — UnityMCP / Godot MCP tool-design patterns to borrow

**Decision**: Adopt the three patterns these servers have converged on:
1. **Narrow verb-noun tools** (`create_entity`, `set_property`, `delete_entity`)
   rather than one fat `do_anything` tool. Our surface (`create_story`,
   `create_passage`, `rename_passage`, …) follows this directly.
2. **Always-available read tools** so the LLM can inspect state cheaply
   (`list_passages`, `get_passage`) without mutations.
3. **Every write surfaces a structured result** (e.g., after `rename_passage`:
   `{ renamed: true, incoming_links_rewritten: 3, affected_passages: [...] }`)
   so the LLM can narrate what happened to the author without re-reading the
   graph.

Tools that can only complete with human input return clarifications (per R1)
rather than guessing — this is the Twinery-specific addition on top of the
UnityMCP / Godot MCP patterns.

**Rationale**:
- The user specifically cited UnityMCP and Godot MCP as the integration model.
- Narrow verb-noun tools play better with smaller-context LLMs and with JSON
  Schema validation, so tool calls fail fast and informatively (reinforces FR-015).

**Alternatives considered**:
- *Godot-Editor-MCP-style "execute_command" meta-tool that accepts a DSL*:
  rejected — moves parsing back into the LLM, which is exactly the class of bug
  Constitution Principle III exists to prevent.
- *Fewer coarser tools*: rejected for the same reason.

---

## R6 — Guide-as-MCP-resource: URI, format, and drift gate

**Decision**:
- Static file: `docs/GUIDE.md` in the repo, checked in. Written by the guide
  generator (`src/guide/build.ts`) from the tool registry (`src/guide/registry.ts`)
  and the zod schemas of each tool's inputs and outputs.
- MCP resource: served at URI `twinery://guide` with MIME type `text/markdown`.
  The resource handler returns the byte-identical contents of `docs/GUIDE.md`
  (not regenerated per-request) so the LLM and a human reviewer see the same
  document.
- Drift gate: a test (`tests/contract/guide-drift.test.ts`) that regenerates the
  guide in memory and compares to `docs/GUIDE.md`; it fails if they differ. The
  same test cross-checks that every exported tool appears in `README.md`'s tool
  table, and that no removed tool still appears.

**Rationale**:
- Single source of truth (tool registry + zod schemas) → both the guide and
  client-side validation are driven from one place, satisfying FR-015.
- Markdown is the format LLMs consume most fluently and the format humans already
  read in repos; no reason to invent a second format.
- A byte-identical test (not a semantic diff) keeps the gate cheap and
  unambiguous — there is no "did I update the generator?" failure mode.

**Alternatives considered**:
- *YAML/JSON guide*: rejected — worse human readability, no practical LLM gain.
- *Guide served live from the registry, not the static file*: rejected — divides
  the source of truth and makes PR review of guide changes impossible.
- *Semantic diff gate*: rejected — harder to reason about and to fix when it
  fails.

---

## Open questions deferred to later releases

None are blocking for v1.0. The following are explicitly out of scope for this
plan and should be re-examined at v1.1 planning time:
- Loading existing `.twee` / `.html` / `.json` files into the server (`open_story`).
- Multi-story concurrent editing via `story_id` parameters.
- HTTP / SSE transport.
- Tweego shell-out path for users who prefer it.
- SVG image placeholder support.

No entries in Technical Context remain marked `NEEDS CLARIFICATION`.
