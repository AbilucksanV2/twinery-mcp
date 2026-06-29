# Twinery MCP — Progress Board

> **This is the human-readable status board for the whole project.** It is the
> one place to see, at a glance, what is done, what is in flight, and what is
> next — across dev work (epics → features → tasks) and the demo Twine stories
> we build to exercise the server.
>
> **For agents working in this repo:** keep this file current. Whenever you
> finish (or start) a task, feature, or demo story, tick the box and update the
> status line in the same change that did the work. This file is the friendly
> rollup; [`backlog.csv`](backlog.csv) remains the append-only machine record
> and each feature's `specs/NNN-*/tasks.md` holds the granular task list. When
> they disagree, reconcile them — don't let this board drift.

**Legend:** `[x]` done · `[~]` in progress · `[ ]` not started / backlog · 🔒 blocked (dependency)

**Current version:** `0.5.0` released · `0.6.0-rc1` staged on branch `011-variables` (variables feature, pending PR/merge)

**Last updated:** 2026-06-29

---

## Snapshot

| Area | State |
|------|-------|
| Core authoring (passages, links, graph integrity, save/load) | ✅ shipped |
| Session persistence + dirty guard | ✅ shipped |
| HTTP transport mode + CI + all-format fixtures | ✅ shipped |
| **Variables (declare/read/set/list/delete + readers)** | ✅ built, ⏳ pending PR merge |
| **Logic: conditionals, computed stats, widgets/popups** | ❌ not built — **active research + planning** |
| Inventory · stylesheets | ❌ backlog |

---

## Epics → Features → Tasks

### ✅ E01 — v1.0 MVP server foundation
- [x] **F001** MCP server v1.0 MVP — 7 core tools over stdio · `#1`

### ✅ E02 — Post-MVP authoring surface
- [x] **F002** Image placeholders + guide resource · `#3` · v0.2.0
- [x] **F003** Complete US1 tools (update/delete/get_passage, set_start_passage, validate_story) · `#4` · v0.3.0
- [x] **F004** Session persistence (load_story, current_story_info, dirty flag, save default-dir) · `#7` · v0.4.0

### ⬜ E03 — Tier 1: authoring leverage
- [ ] **F005** Bulk authoring (array create/link + find_and_replace with dry_run)
- [ ] **F006** Graph reasoning (incoming links, find_path, graph_stats) — engine helpers mostly exist in `src/graph/links.ts`
- [ ] **F-AUTOLAYOUT** Auto-layout tool (compute Twine canvas positions from the graph)

### ⬜ E04 — Tier 2: validation & polish
- [ ] **F007** Validation depth (dead-ends, self-loops, no-path-back, tag hygiene, strict mode)
- [ ] **F008** Format-aware niceties (list_supported_formats, gated change_format)
- [ ] **F009** Authoring ergonomics (preview_passage, duplicate_passage, list_image_placeholders)
- [ ] **F-SLUG** Slug ergonomics (strip leading articles; surface chosen slug loudly)

### ⬜ E05 — Tier 3: deferred v1.0 items
- [ ] **F-T3-LOAD** Load `.html` and `.json` (today: `.twee` only)
- [ ] **F-T3-MULTI** Multi-story workspace (`story_id` on every tool) — XL refactor
- [x] ~~**F-T3-HTTP** HTTP/SSE transport~~ — superseded by **F-HTTPMODE** (done)
- [ ] **F-T3-TWEEGO** Tweego shell-out compile path
- [ ] **F-T3-SVG** SVG image placeholders

### 🟡 E06 — Cross-cutting infrastructure
- [x] **F-CI** GitHub Actions CI (typecheck + smoke + license + no-LLM-SDK + guide-drift) · `#9`
- [x] **F-FIXTURES** All-format round-trip fixtures (Harlowe/SugarCube/Chapbook/Snowman) · `#10`
- [x] **F-HTTPMODE** Streamable-HTTP transport mode (`--transport http`) · `#8` · v0.5.0
- [ ] **F-HTML** Standalone-playable HTML (bundle format runtime) — L scope
- [ ] **F-ELICIT** MCP elicitation (native elicit prompts; structured fallback exists today)

### 🟡 E07 — Stateful authoring  ← **the current frontier**
- [~] **F-VARIABLES** Variable management tools — declare/read/set/list/delete + format-aware readers
  - [x] Phase 2 — foundational helpers + `ActiveStory.variables` registry (T001–T007)
  - [x] Phase 3 — declare/read/insert_reader (US1, T008–T012)
  - [x] Phase 4 — set_variable idempotency (US2, T013–T015)
  - [x] Phase 5 — list_variables + extract-on-load (US3, T016–T019)
  - [x] Phase 6 — delete_variable + delete_passage sync (US4, T020–T023)
  - [x] Phase 7 — README/GUIDE/fixtures/version/backlog (T024–T030)
  - [ ] **Open PR → review → merge to `main`**, then flip backlog row to `done`
- [ ] **F-VAR-MATH** Computed variable updates (`<<set $cash to $cash + 100>>`; relative/expression sets) 🔒 builds on F-VARIABLES
  - *Smallest fix, highest impact. Surfaced 2026-06-29 — `set_variable` only emits literals today.*
- [ ] **F-CONDITIONALS** Conditional rendering + gated choices (`<<if>>`/`(if:)`/`[if]`/`<% if %>` + state-gated links) 🔒 builds on F-VARIABLES
  - *Largest single blocker for guided-open-world stories. Surfaced 2026-06-29.*
- [ ] **F-WIDGETS** Widget + popup authoring (stat-change popups; reusable mutate-and-notify widgets) 🔒 builds on F-VAR-MATH
- [ ] **F-INVENTORY** Inventory system (add/remove/has_item, list_inventory, inventory-gated links) 🔒 builds on F-VARIABLES
- [ ] **F-STYLESHEETS** Rich stylesheet authoring (set/append stylesheet, per-tag style helpers)

---

## Demo stories / authoring test cases

Twine stories we build end-to-end to prove the tool surface is enough. Each is
a real exercise of the server, not a unit test.

- [x] **Locked Cellar** (×4 formats) — round-trip fixtures; static branching + one boolean var · `fixtures/`
- [ ] **Cartographer's Apprentice** — 17-passage static-branching story (authored 2026-05-14); surfaced F-SLUG, F-AUTOLAYOUT, and the whole E07 epic (no way to add state)
- [ ] **Life-Sim** (SugarCube) — 4 time periods × 7 days, stats (energy/cash/beauty/intelligence/charm), locations + activities that mutate stats, 5+ day/location-triggered events (exam gate), inventory/closet, stat-change popups
  - 🔒 **Blocked** — needs F-VAR-MATH + F-CONDITIONALS (+ F-WIDGETS for popups, F-INVENTORY for closet). Feasibility probed 2026-06-29: world/navigation/static stats build today; all dynamics do not. See backlog notes.

---

## Active investigation

- [~] **Logic-authoring research (2026-06-29)** — how conditionals/logic are
  built in each format and what the MCP must teach a calling model. Parallel
  research across SugarCube / Harlowe / Chapbook / Snowman + community patterns.
  Output: a design plan for F-VAR-MATH / F-CONDITIONALS / F-WIDGETS and a
  "logic guide" the MCP exposes (docstrings + `twinery://guide`). *(plan section
  to be appended here on completion)*

---

## Next up (recommended order)

1. **Merge F-VARIABLES** to `main` (green and ready).
2. **F-VAR-MATH** — cheapest unlock; nothing with a stat economy works without relative updates.
3. **F-CONDITIONALS** — turns "a map with numbers" into a guided open world (exam gate, day/location events, time→day rollover).
4. **F-WIDGETS** (popups) + **F-INVENTORY** (closet/drink) — feature layers on top.
