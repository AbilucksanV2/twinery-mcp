---
description: "Task list for feature 008 — All-format round-trip fixtures"
---

# Tasks: All-format round-trip fixtures

**Input**: design documents from `/specs/008-fixtures/`
**Prerequisites**: spec.md, plan.md

## Phase 1: Fixtures (parallel)

- [X] T001 [P] Hand-author `fixtures/harlowe/source.twee` — ~6–8 passages, Harlowe arrow links `[[text->target]]`, at least one `(set:)` and one `(if:)`, an ending passage tagged `ending`, non-empty `Twee` `StoryData` with format `Harlowe` + `format-version 3.3.9`.
- [X] T002 [P] Hand-author `fixtures/sugarcube/source.twee` — SugarCube pipe links `[[text|target]]`, at least one `<<set $var to value>>`, one `<<if>>...<</if>>`, one ending tag, format `SugarCube` + `format-version 2.36.1` (or current default in src/twine/formats.ts).
- [X] T003 [P] Hand-author `fixtures/chapbook/source.twee` — Chapbook arrow links, vars section (`-- vars --`), one `{embed passage: ...}` insert, one branch, ending tag, format `Chapbook` + version.
- [X] T004 [P] Hand-author `fixtures/snowman/source.twee` — Snowman pipe links, one `<%- s.var %>` JS insert, one branch, ending tag, format `Snowman` + version.

## Phase 2: Runner

- [X] T005 Implement `src/fixtures.ts` — discovers `fixtures/*/source.twee`, runs three round-trips per fixture (Twee↔Twee, Twee↔HTML↔Twee, Twee↔JSON↔Twee), compares per the rules in plan R1+R2, prints per-failure diff snippet, exits 0 only if every check passes. No dependency beyond `extwee` (already prod).
- [X] T006 Add `fixtures` script to `package.json` — `node dist/fixtures.js`. Chain into `smoke` so the CI matrix runs it on every push.

## Phase 3: Verification

- [X] T007 Run `npm run build && npm run fixtures` locally. Confirm all 12 checks (4 fixtures × 3 round-trip paths) pass.
- [X] T008 Poison-test: edit one fixture's `format-version` after `parseTwee`, confirm the runner names the offending field and exits 1.
- [X] T009 Run `npm run smoke` end-to-end. Confirm wall-clock ≤ 30 s combined (was 18.3 s for stdio + http + cli; fixtures should add ≤ 5 s per SC-001).
- [X] T010 If any format fails to round-trip cleanly, decide between (a) fixture simplification with a comment explaining why, or (b) document the divergence in `specs/008-fixtures/known-issues.md`. Do NOT silently weaken the comparison.

## Phase 4: Polish

- [X] T011 [P] Update `README.md` "Verify locally" section to mention `npm run fixtures` and the four formats covered.
- [X] T012 [P] Update `tracking/backlog.csv` F-FIXTURES row → branch, in_progress, then done post-merge with PR# + commit.

---

## Dependencies & ordering

- T001..T004 are parallel (different fixture files, no shared file).
- T005 depends on T001..T004 (runner needs fixtures to exercise).
- T006 depends on T005.
- T007..T010 depend on T005 + T006.
- T011 and T012 are pure polish and can land anywhere after T007.

## Notes

- The runner does NOT call `compileTwine2HTML` — that needs the format
  runtime binary, out of scope.
- If extwee turns out to drop a Chapbook vars section through
  `toTwee → parseTwee`, that's a known weak spot in extwee's Chapbook
  support; per plan R3 we either trim the fixture or document the
  divergence.
- The Snowman fixture is the highest risk — extwee's Snowman coverage is
  thinnest. Be ready to simplify it.
