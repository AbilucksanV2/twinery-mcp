# Implementation Plan: Session Persistence — Open / Inspect / Save loop

**Branch**: `004-session-persistence` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-session-persistence/spec.md`

## Summary

Add the open/inspect/save loop the v0.3 server is missing: a `load_story` tool
that parses a `.twee` file via `extwee.parseTwee` and replaces the active
story, a `current_story_info` read-only state probe, and dirty-flag tracking
so mutations and saves move the flag in lockstep. As a small co-requirement,
`save_story` defaults its `output_dir` to the active story's last-saved path
(the `lastSavedDir` field already exists in `state.ts` and is currently
unused). All three changes plug into the existing tool registry so they appear
in `docs/GUIDE.md` automatically.

## Technical Context

**Language/Version**: Unchanged from v0.3 — TypeScript 5.4+ on Node.js 20 LTS.
**Primary Dependencies**: Unchanged — `@modelcontextprotocol/sdk`, `extwee`,
`zod`. `extwee.parseTwee` (already imported by the type shim) is used directly
by the new `load_story` tool.
**Storage**: Unchanged — single active story in memory.
**Testing**: `npm run smoke` extended with checks covering load/dirty/info
flows and a save-then-load round-trip across at least Harlowe (and SugarCube
once we have a fixture). No new test framework.
**Target Platform**: Unchanged — Node.js 20 LTS, cross-platform via `npx -y`.
**Project Type**: Unchanged — single TypeScript package.
**Performance Goals**: `current_story_info` returns in <5 ms for 500-passage
stories (it's a struct copy, not a graph walk). `load_story` parses + validates
a 500-passage `.twee` in <500 ms (extwee's parser is the hot path; we don't
optimise it here).
**Constraints**: Same Constitution principles as v0.3 — no LLM-provider SDKs,
permissive licenses only, parsing delegated to extwee.
**Scale/Scope**: Same as v0.3 — single active story, ~500 passages target.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| **I. Spec-Faithful Format Fidelity (NON-NEGOTIABLE)** | ✅ | `load_story` calls `extwee.parseTwee` directly. No hand-rolled parsing. The validate-on-load path reuses the existing `validate_story` engine. |
| **II. MCP-Native & Model-Agnostic** | ✅ | Two new tools register through the existing registry; no LLM-provider SDKs introduced. |
| **III. Graph-Integrity First (NON-NEGOTIABLE)** | ✅ | Loading replaces the entire active story atomically — there is no partial-load state. The dirty flag is per-story, not per-tool, so there's no integrity gap between a tool's mutation and the flag flip. |
| **IV. Native-Twine Export Parity** | ✅ | Round-trip parity tested by SC-001: save then load then re-emit must match the original. Verifies the parser/emitter pair stays symmetric. |
| **V. Open-Source Licensing Discipline** | ✅ | No new dependencies. |

**Result**: No violations. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-session-persistence/
├── plan.md
├── spec.md
├── tasks.md            (created by /speckit.tasks when scoped)
└── checklists/
    └── requirements.md
```

### Source Code (changes from v0.3 baseline)

```text
src/
├── server/
│   ├── state.ts                              (modified)
│   │   # adds dirty: boolean, lastSavedAt: number, replaces lastSavedDir
│   │   # with lastSavedPath; adds setDirty / markSaved / markLoaded helpers
│   ├── tools/
│   │   ├── load_story.ts                     (new)
│   │   ├── current_story_info.ts             (new)
│   │   ├── save_story.ts                     (modified)
│   │   │   # default output_dir from state.lastSavedPath; mark saved on success
│   │   ├── create_story.ts                   (modified)
│   │   │   # mark "clean" on creation (zero-state baseline)
│   │   ├── create_passage.ts                 (modified)
│   │   ├── update_passage.ts                 (modified)
│   │   ├── rename_passage.ts                 (modified)
│   │   ├── delete_passage.ts                 (modified)
│   │   ├── link_passages.ts                  (modified)
│   │   ├── set_start_passage.ts              (modified)
│   │   └── add_image_placeholder.ts          (modified)
│   │       # each mutation tool calls state.setDirty() on success
│   └── index.ts                              (unchanged — registry-driven)
├── guide/
│   └── registry.ts                           (modified)
│       # adds load_story and current_story_info to TOOL_REGISTRY
└── smoke.ts                                  (modified)
    # new sections covering load/dirty/info + round-trip

docs/
└── GUIDE.md                                  (regenerated)
```

**Structure Decision**: Same single-package layout as v0.3. The mutation-tool
edits are mechanical — each surfaces a single `setDirty()` call after its
existing success path. We deliberately spread the dirty flagging across each
tool rather than introducing a wrapper layer; centralising it would mean
intercepting every tool call's return value, which adds complexity for marginal
benefit on a 13-tool surface.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations.

## Phase 0 — Research notes

Two micro-decisions worth recording:

1. **Field rename `lastSavedDir` → `lastSavedPath`.** The current name implies
   directory-only; we want to remember the parent of the loaded `.twee` (which
   we accept as both a directory and an originally-loaded file path). Renaming
   to `lastSavedPath` and storing the directory part keeps the meaning
   unambiguous. No external consumers, so the rename is internal.

2. **Dirty-flag granularity.** Per-story (not per-passage) is sufficient. A
   per-passage dirty bit would let us optimise partial saves later but adds
   complexity now and the v1 `save_story` rewrites the whole `.twee` anyway.
   Decision: per-story.

3. **Validation-on-load implementation.** Reuse `validate_story`'s handler
   directly. The handler is read-only and returns a structured result; we
   embed it as `validation` in the `load_story` response. No duplication.

4. **`load_story` and `.html` files.** v1 accepts `.twee` only. `.html`
   loading is deferred — see roadmap. The clarification surfaced when a
   `.html` path is given offers cancel only, with a hint to extract the Twee
   manually. We don't pre-parse the HTML hopefully to extract Twee because
   that's a one-way street and the user's expectation might differ.

## Phase 1 — Design notes

**Tool contract sketches** (zod / TypeScript shape, not formal JSON Schema for
this feature — the v1.0 spec at `specs/001-mcp-server-mvp/contracts/` is the
canonical reference for the tool-contract pattern):

```ts
// load_story
inputSchema = {
  path: z.string().min(1),
  discard_unsaved: z.boolean().optional(),
};
// output_ok: { kind: "ok", info: <current_story_info shape>, validation: <subset of validate_story> }
// clarification triggers: dirty active story, .html path, parse error wraps as kind: "error"

// current_story_info
inputSchema = {};
// output: { active: false } | { active: true, name, format, format_version, ifid, story_slug,
//   passage_count, start_passage, last_saved_path, last_saved_at, dirty }
```

**State shape change** (`src/server/state.ts`):

```ts
interface ActiveStory {
  story: Story;
  slug: string;
  format: StoryFormat;
  imagePlaceholders: ImagePlaceholderRecord[];
  lastSavedPath: string | null;  // was lastSavedDir
  lastSavedAt: number | null;    // new
  dirty: boolean;                // new
}

export function setDirty(): void;       // sets dirty = true on the active story
export function markSaved(path: string): void;  // sets lastSavedPath, lastSavedAt, dirty=false
export function markLoaded(path: string): void; // same as markSaved but distinct intent
```

**Mutation tool change pattern** — each mutation tool gains exactly one
`setDirty()` call before its successful return:

```ts
// before:
return { kind: "ok", passage: ... };

// after:
setDirty();
return { kind: "ok", passage: ... };
```

Clarification responses do NOT mark dirty — a clarification means the call
hasn't actually mutated state yet.

**`save_story` default-dir change**:

```ts
const dir = args.output_dir
  ?? (active.lastSavedPath ?? null);
if (dir === null) return needClarification(...);  // existing flow when nothing remembered
// ...write...
markSaved(dir);
return { kind: "ok", output_dir: dir, ... };
```

**Smoke-test additions** (after the existing 19 sections):

- Section 20: `current_story_info` with no active story → `{ active: false }`
- Section 21: after `create_story` → `{ active: true, dirty: false, ... }`
- Section 22: after a mutation (any) → `dirty: true`
- Section 23: `save_story({})` after explicit save → uses remembered path, no clarification, `dirty` flips to `false`
- Section 24: `load_story` round-trip — save the smoke story, load it, assert `current_story_info` matches
- Section 25: `load_story` of a dirty story without `discard_unsaved` → clarification

## Out of scope (tracked in roadmap)

The tester's feedback contained ~17 other items. Those are listed and
prioritised in [`../001-mcp-server-mvp/roadmap.md`](../001-mcp-server-mvp/roadmap.md)
and explicitly excluded from this feature so the work stays cohesive.
