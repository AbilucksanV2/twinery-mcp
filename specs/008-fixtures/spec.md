---
description: "Spec for feature 008 — All-format round-trip fixtures"
---

# Feature 008 — All-format round-trip fixtures

**Branch**: `008-fixtures` | **Date**: 2026-05-04 | **Backlog row**: `F-FIXTURES` (E06 cross-cutting infra, P3)

## Why

The constitution mandates that fixture-based round-trip tests cover all
three file formats (Twee 3 ↔ Twine 2 HTML ↔ Twine 2 JSON) for at least one
non-trivial story per story format (Harlowe / SugarCube / Chapbook /
Snowman). Today only Harlowe is exercised — by the smoke test, and only
implicitly through the `save_story` → file inspection path. SugarCube,
Chapbook, and Snowman have never been run end-to-end through the server.

This is the foundation the user will rely on next: the moment we start
authoring real-length stories to surface format-specific bugs, the fixture
suite is what tells us *which* format broke and *which* round-trip path
broke. Without it, every bug report would need to be reproduced from
scratch.

## Scope

A `fixtures/` tree holding one canonical source-of-truth `.twee` file per
story format (4 files total). Each fixture is non-trivial:

- ≥ 5 passages including a Start, at least one branching decision, and
  at least one ending passage.
- Uses format-specific syntax: the format's link form *and* at least one
  format-specific macro / insert / variable expression.
- Has tags on at least one passage and a non-empty `Twine.audience`-style
  metadata field where the format supports it.

A new runner `src/fixtures.ts` exercises three round trips per fixture:

1. **Twee → Twee** — `parseTwee` → `toTwee` → `parseTwee` → compare.
2. **Twee → Twine 2 HTML → Twee** — `parseTwee` → `toTwine2HTML` →
   `parseTwine2HTML` → compare.
3. **Twee → Twine 2 JSON → Twee** — `parseTwee` → `toJSON` → `parseJSON`
   → compare.

"Compare" means structural equivalence on the load-bearing Story fields
(name, IFID, format, formatVersion, start, tagColors, storyJavaScript,
storyStylesheet, zoom) and on each Passage's name, text, tags, and
metadata. Position metadata is whitelisted as known-lossy (Twine 2 HTML
serialisation may renormalise it) and excluded from the comparison —
documented in plan R3.

Wired into `npm run smoke` so the CI matrix runs it across
ubuntu-latest / macos-latest / windows-latest on every push.

## Out of scope

- The format-runtime-wrapped HTML (`compileTwine2HTML`) — that requires
  shipping Harlowe / SugarCube / etc. format binaries; that's `F-HTML`.
- `load_story` accepting `.html` or `.json` — that's `F-T3-LOAD`. This
  feature uses `extwee` directly for the read-back, bypassing the
  `load_story` tool surface.
- New tools or schema changes. F-FIXTURES is verification infrastructure
  only.

## Acceptance criteria

- `fixtures/<format>/source.twee` exists and parses cleanly for each of
  `harlowe`, `sugarcube`, `chapbook`, `snowman`.
- `npm run fixtures` runs all 12 round-trip checks (4 formats × 3 paths)
  and exits 0 against the committed fixtures.
- Any divergence between the original Story and a re-parsed Story
  produces an actionable failure that names: the fixture, the round-trip
  path, the field that differs, and a short diff snippet.
- `npm run smoke` is updated to chain `npm run fixtures` so CI exercises
  it on every push to `main` / `dev` and on every PR.
- A regression that breaks one format's round-trip (e.g. extwee bump
  that drops a SugarCube macro through `toTwee`) causes red CI on the
  affected format only — the other three remain green.

## Success criteria

- **SC-001**: Adding `npm run fixtures` to the smoke chain adds ≤ 5 s to
  the combined wall-clock on a developer laptop.
- **SC-002**: A typo in a fixture surfaces as a non-zero exit with a
  message that points at the offending file and round-trip path within
  ≤ 2 s.
- **SC-003**: When the user starts authoring real-length stories
  (next planned activity), every format-specific bug surfaces against
  these fixtures first, *not* against an end-user story.
