# Roadmap — Beyond v0.3

**Created**: 2026-04-25
**Source**: External tester feedback (`.feedbacks/feedback-25-apr.md`) plus
items the original v1.0 plan deferred (`research.md` § "Open questions
deferred to later releases").

This document tracks features that have been **identified but not yet specced
in detail**. Each item lists tester priority where given (P1–P5), the gap it
closes, and a rough size. Items move from this list into their own
`specs/NNN-*/` directory when scoped — that's the signal that work is
imminent.

## Current state at time of writing

- **v0.3 is in PR review** (`003-complete-us1-tools` → `dev`). Adds
  `update_passage`, `delete_passage`, `get_passage`, `set_start_passage`, and
  `validate_story` on top of v0.2's image placeholders + guide resource.
- **Feature 004 (Session Persistence)** has been spec'd in
  `specs/004-session-persistence/`. Covers `load_story`,
  `current_story_info`, dirty-flag tracking, and `save_story` last-dir
  defaulting. This is the next active feature.

Everything below is post-004.

## Sequencing principles

1. **Priority order follows the tester's signal**, with adjustments when an
   item is a prerequisite for another (those are promoted).
2. **Items group by theme** so a single feature spec can pick up several at
   once without scope creep — themes ship together, separate themes ship
   independently.
3. **Constitution alignment is mandatory** for every promotion; nothing here
   is exempt from the five principles.

---

## Tier 1 — Next batch after 004 (high-leverage authoring)

### F005 — Bulk authoring

**Tester priority**: P3.
**Why**: A 18-passage story took 18 round trips today. The LLM ↔ server chat
is the bottleneck; a single batch call cuts that to one round trip.
**Items**:
- `create_passages(passages: [...])` — array form of `create_passage` with
  per-item clarification surfacing if any single item collides.
- `link_passages_batch(links: [...])` — array form of `link_passages`.
  Optional but symmetric.
- `find_and_replace(search, replace, scope?, dry_run?)` — scoped to passage
  text, with a `dry_run` flag returning a per-passage hit list before any
  mutation.
**Size**: M. New tools, no existing-tool surgery.
**Risk**: Partial-failure semantics need design — does one failed item abort
the whole batch (transactional) or proceed and report (best-effort)? Spec
will pick one and stick to it.

### F006 — Graph reasoning

**Tester priority**: P4 + adjacent.
**Why**: Authors and the LLM both need to ask "what depends on this passage?"
or "is this ending reachable?" before refactoring. Today the only path is
manual — `list_passages`, scan results.
**Items**:
- `get_incoming_links(passage_name)` — inverse of the per-passage
  outgoing_links currently surfaced by `list_passages` and `get_passage`.
  Engine already exists in `src/graph/links.ts` (`incomingTo`).
- Extend `get_passage` output to include `incoming_links` alongside
  `outgoing_links`. Small and consistent.
- `find_path(from, to)` — BFS, returns the shortest sequence of passage
  names. Engine partly exists (`reachableFrom` in `links.ts`).
- `graph_stats` — passage count, edge count, ending count (passages tagged
  `ending`), average branching factor, longest shortest-path from start,
  dead-ends-not-tagged-ending. Useful for game-design sanity checks.
**Size**: S–M. Most engine work is done; mostly new tool wrappers + a few
helpers.
**Risk**: None significant. Read-only, no mutation surface.

---

## Tier 2 — Validation and authoring polish

### F007 — Validation depth

**Tester priority**: P5 (and adjacent suggestions).
**Why**: Today's `validate_story` catches structural issues (broken links,
orphans, duplicate names, IFID, start). It misses softer issues that often
trip up authors — dead-ends, self-loops, no-path-back. Tester's example: the
"River" issue went undetected because it wasn't technically an orphan.
**Items**:
- Dead-ends not tagged `ending` (probably unintentional).
- Self-loops (passage links to itself) — sometimes intentional, often a typo.
- Reachable-but-no-path-back (one-way passages in stories where the author
  expects roundtripping).
- Unused tags vs. tags only used once (hygiene; opt-in).
- `validate_story(strict: true)` mode that promotes warnings to errors.
- (Stretch) Format-version mismatch heuristics — story declares Harlowe
  3.3.8 but text uses syntax from 3.4. Hard problem; punt to F008 if it
  turns out to need format-specific parsers per minor version.
**Size**: S. New analyses on the existing graph engine.
**Risk**: Low. New report fields are additive; the strict mode is opt-in.

### F008 — Format-aware niceties

**Tester priority**: not ranked.
**Why**: The current server only really exercises Harlowe; SugarCube /
Chapbook / Snowman are accepted at the story-format level but not deeply
verified or supported by convenience features. Authors need to know what
formats the local install can handle.
**Items**:
- `list_supported_formats` — what formats does this server have parsers /
  emitters / runtimes for, and what version table.
- `change_format(new_format)` — gated by validation that no existing passage
  uses syntax incompatible with the target. Clear footgun-warning surface.
**Size**: S. `list_supported_formats` is a one-liner over the formats table.
`change_format` needs the format-mismatch detector from F007 to be honest.
**Risk**: `change_format` is a footgun; spec must require explicit `confirm:
true` and a dry-run that reports incompatible passages before applying.

### F009 — Authoring ergonomics

**Tester priority**: not ranked.
**Why**: Quality-of-life improvements that compound over a long session.
**Items**:
- `preview_passage(name)` — render a single passage's compiled HTML without
  a full save, for prose-tuning iteration.
- `duplicate_passage(name, new_name)` — copy text/tags/size to a new name
  with collision-aware behaviour.
- `list_image_placeholders` — dedicated read-only view of placeholders + on-
  disk status. Today the only way is to trigger `save_story` and read
  `pending_image_drops` — a read-only equivalent is cleaner.
**Size**: S. Three independent additions, none load-bearing.
**Risk**: None notable.

---

## Tier 3 — Long-deferred items from the v1.0 plan

These were explicitly deferred at v1.0 planning time
(`specs/001-mcp-server-mvp/research.md` § "Open questions deferred to later
releases"). They remain valid but lower-priority than the tester-driven items
above.

- **Loading `.twee` / `.html` / `.json`** — partly addressed by F004
  (`.twee` only); `.html` and `.json` loaders still pending.
- **Multi-story workspace** — `story_id` parameters on every tool. Big
  refactor; requires concurrency model. Worth scoping only when a real
  multi-story workflow shows up.
- **HTTP / SSE transport** — currently stdio-only. Adds value for non-CLI
  clients but not blocking anything today.
- **Tweego shell-out** — opt-in alternative compile path for users who
  already have Tweego installed. Worth a small spec when someone asks for it.
- **SVG image placeholder support** — currently restricted to raster formats
  (`png/jpg/jpeg/gif/webp`). Adds DOM-level complexity due to Twine format
  passages handling SVG inconsistently.

## Tier E07 — Stateful authoring (logic in stories)

The frontier that lets LLMs author stories with real state, not just static
branching. **F-VARIABLES** (declare/read/set/list/delete + format-aware
readers) is built and pending merge (`specs/011-variables/`). The remaining
features all build on it; full cross-format syntax reference and design
rationale live in `specs/011-variables/research.md` § R8, and the staged
sequence + status live in `tracking/PROGRESS.md`. Backlog rows under epic E07.

Staged so each stage ships independently and leaves smoke green:

- **Stage 1 — state correct & teachable** (small, high-leverage, ship together):
  - **F-VAR-MATH** — computed/relative updates (`<<set $cash to $cash + 100>>`,
    `it`/`+=`/`++` per format). `set_variable` only emits literals today.
  - **F-VAR-INIT** — declare into the format's init passage (`StoryInit` /
    `startup`-tagged / once-only vars section / UserScript), not Start; grow the
    variable registry into a manifest.
  - **F-LOGIC-GUIDE** — teach the active format's logic dialect via tool
    docstrings + the `twinery://guide` resource (the core "make any model aware
    of the logic" requirement).
- **Stage 2 — guided-open-world primitives:**
  - **F-CONDITIONALS** — format-correct `if`/hook/modifier blocks + state-gated
    links (hidden vs disabled) + header/footer event dispatcher.
  - **F-STATBLOCK** — central stat display (`StoryCaption` / header-footer).
- **Stage 3 — feel & depth:**
  - **F-WIDGETS** — mutate+notify as one idempotent unit (stat-change popups).
  - **F-INVENTORY** — array-based inventory with ownership-gated links.

Acceptance exercise once Stages 1–3 land: author the **Life-Sim** demo story
end-to-end (4 periods × 7 days, stat economy, exam gate, inventory, popups) —
currently not tool-authorable at all.

---

## Cross-cutting non-features (still TODO at the project level)

These aren't user-facing features but affect every release:

- **CI workflow** (`.github/workflows/ci.yml`) — lint + typecheck + smoke
  + license-check + no-LLM-SDK grep + guide-drift, on every push. Mentioned
  in `specs/001-mcp-server-mvp/plan.md` Constitution Check; not yet
  implemented in the POC. Belongs in a `cross-cutting/ci` task, not a
  feature.
- **Fixture + round-trip tests** for all four story formats — the
  Constitution mandates them; only Harlowe is exercised end-to-end in the
  smoke test today.
- **Standalone-playable HTML compilation** — bundle the Harlowe runtime so
  `save_story`'s `.html` plays directly in a browser without a Twine 2
  editor "Publish to File" step. Significant scope (need to ship or fetch
  format binaries).
- **MCP elicitation** — the v1.0 spec promised elicitation when the client
  supports it; today only the structured-fallback path is implemented. Adds
  meaningful UX value on Claude Desktop and similar clients.

These cross-cutters can be picked up between feature releases — they don't
all need their own spec, but the bigger ones (elicitation, standalone HTML)
probably warrant their own.

---

## Promotion process

When ready to start work on any item above:

1. Create `specs/NNN-<name>/` via `/speckit.specify` with a description
   drawn from this entry.
2. Move the entry from this file into the new `specs/NNN-<name>/spec.md`'s
   user-stories section.
3. Update this file to mark the item as **Promoted to specs/NNN-<name>**
   with a date.
4. The list shrinks; the spec directory grows.

A roadmap that never shrinks is a wishlist. This one needs to.
