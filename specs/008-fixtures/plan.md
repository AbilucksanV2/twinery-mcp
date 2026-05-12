# Implementation Plan: All-format round-trip fixtures

**Branch**: `008-fixtures` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)

## Summary

Add a `fixtures/` directory with one canonical `.twee` per supported
story format (Harlowe, SugarCube, Chapbook, Snowman). Add
`src/fixtures.ts` — a small runner that for each fixture exercises three
round trips through `extwee` (Twee↔Twee, Twee↔HTML↔Twee, Twee↔JSON↔Twee)
and asserts structural equivalence on the load-bearing Story / Passage
fields. Wire as `npm run fixtures` and chain into `npm run smoke` so the
CI matrix runs it on ubuntu / macos / windows every push.

No new dependencies. No tool surface changes. No `load_story` /
`save_story` changes.

## Technical Context

- **Language**: TypeScript (same toolchain as the rest of `src/`).
- **Library**: `extwee@^2.2.0` already in production deps; exposes
  `parseTwee`, `parseTwine2HTML`, `parseJSON`, `Story.toTwee`,
  `Story.toTwine2HTML`, `Story.toJSON`.
- **Shape**: pure runner script under `src/`, compiles to `dist/fixtures.js`,
  invoked via `node dist/fixtures.js`.
- **Wall-clock budget**: ≤ 5 s on top of the existing smoke chain.

## Constitution Check

| Principle | Compliance |
|-----------|-----------|
| **I. Spec-Faithful Format Fidelity** | ✅ This feature *implements* the constitution's mandate that all four formats round-trip cleanly. |
| **II. MCP-Native & Model-Agnostic** | ✅ No transport / SDK / model touch points. |
| **III. Graph-Integrity First** | ✅ No tool change. |
| **IV. Native-Twine Export Parity** | ✅ The whole feature is a check on this principle — round-trip fidelity through every output format extwee supports. |
| **V. Open-Source Licensing Discipline** | ✅ No new deps. |

No violations.

## Project Structure

```
fixtures/
├── harlowe/
│   └── source.twee
├── sugarcube/
│   └── source.twee
├── chapbook/
│   └── source.twee
└── snowman/
    └── source.twee

src/
└── fixtures.ts                                  (new)

specs/008-fixtures/
├── spec.md
├── plan.md                                      (this file)
└── tasks.md

package.json                                     (modified — fixtures script + smoke chain)
README.md                                        (modified — Verify locally line)
```

## Phase 0 — Micro-decisions

### R1 — Comparison strategy

**Decision**: Structural equality on the load-bearing fields, not byte
equality on the round-tripped text. Compare:

- Story: `name`, `IFID`, `format`, `formatVersion`, `start`, `zoom`,
  `tagColors`, `storyJavaScript`, `storyStylesheet`.
- Each passage by name: `text`, `tags` (sorted), `metadata` minus
  position/size.

**Rationale**: Byte equality on `toTwee → parseTwee → toTwee` would tie
the test to extwee's serialisation choices (line endings, attribute
order, escape preferences). The contract we actually care about is
"information preserved across the round trip" — structural equality
captures that and survives benign format changes in extwee.

**Alternatives considered**:
- *Byte equality* — rejected, flake-prone.
- *Compare entire Passage `text` byte-for-byte* — kept, since passage
  text is the part most likely to drop format-specific macros.

### R2 — Position metadata exclusion

**Decision**: Exclude `position` and `size` from the metadata
comparison. Both formats may renormalise these (e.g. Twine 2 HTML
serialises position as integer pixels; JSON may serialise them
differently).

**Rationale**: Position is editor-canvas-only metadata and not part of
the *story* contract. The constitution principle IV mentions position
preservation, but in practice the round-trip-with-renormalisation case
is acceptable — an integer-rounded position is the same story.

**Follow-up**: if position drift turns out to be larger than rounding
(e.g. positions reset to 0,0), that's a real bug we'll surface in the
fixture failure and patch.

### R3 — Fixture content per format

**Decision**: Each fixture is hand-written, ~6–8 passages, exercising:

- The format's link syntax (Harlowe / Chapbook arrow, SugarCube /
  Snowman pipe).
- One state-mutation macro (`(set:)` / `<<set>>` / vars-section /
  `<%- ... %>`).
- One conditional or insert.
- One ending passage with a tag.
- A non-empty `storyStylesheet` *or* `storyJavaScript` so the round trip
  exercises those fields too.

**Rationale**: Smaller fixtures don't catch macro-drop bugs; larger
fixtures inflate review burden. Six-to-eight is the sweet spot.

### R4 — Failure shape

**Decision**: When a round-trip diverges, the runner prints

```
✗ <format> / <path>: <field> differs
  fixture: fixtures/<format>/source.twee
  expected: <preview>
  actual:   <preview>
```

then exits 1 after running every check (so all failures surface in one
run instead of bisecting). Wall-clock budget allows it.

**Rationale**: When a real-length story surfaces a bug, the fixture
suite should pinpoint the exact field that drifted; that demands
field-level diffs, not "round-trip failed".

### R5 — Wire-up

**Decision**: Add `fixtures` script to `package.json`. Chain it into
`smoke` so every CI run touches it.

```json
"fixtures": "node dist/fixtures.js",
"smoke": "npm run smoke:stdio && npm run smoke:http && npm run smoke:cli && npm run fixtures"
```

**Rationale**: One smoke command continues to be the single
verification entrypoint. CI requires no workflow change.

## Edge cases

- **A fixture that extwee can't fully round-trip today**: surfaced as a
  test failure. Two resolutions: (a) fix the fixture (legitimate when
  the divergence is non-load-bearing whitespace); (b) document the
  divergence in `specs/008-fixtures/known-issues.md` and assert against
  the documented diff. Fixing extwee upstream is out of scope here.
- **Format binary not available**: irrelevant — we never call
  `compileTwine2HTML`.
- **Windows line endings**: the runner reads with `utf8` and compares
  in-memory strings, so CRLF in fixtures shouldn't matter; the build
  step preserves whatever's checked in.

## Out of scope (tracked elsewhere)

- `load_story` accepting `.html` / `.json` — `F-T3-LOAD`.
- Standalone-playable HTML with bundled format runtime — `F-HTML`.
- ESLint over fixtures — they're authored Twee, not TS.
- Inventory / variable / stylesheet authoring tools — separate features
  the user has flagged for scoping after F-FIXTURES surfaces real-length
  story issues.

## Complexity Tracking

No violations.
