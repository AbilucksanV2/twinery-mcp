---
description: "Spec for feature 010 — create_story dirty-guard parity"
---

# Feature 010 — `create_story` dirty-guard parity (bug fix)

**Branch**: `010-create-story-dirty-guard` | **Date**: 2026-05-04 | **Type**: bug fix on top of feature 004

## Why

Feature 004 (Session Persistence) introduced a dirty flag on the active
story plus a clarification on `load_story` so the server refuses to
clobber unsaved changes — surfacing the canonical `save_first |
discard_unsaved | cancel` answers. The same risk exists when an LLM
calls `create_story` mid-session (e.g. switching from Snowman to
Chapbook to test format-aware behaviour) but `create_story` shipped
without the equivalent guard. Today it silently overwrites the active
story, so any unsaved work is gone.

Surfaced 2026-05-04 by manual testing during feature 008 fixture
work: switching format mid-session via `create_story` clobbered an
unsaved Snowman story without warning. Constitution principle III
(Graph-Integrity First) doesn't strictly mandate dirty-tracking but
the project already promised this contract on `load_story`; users will
reasonably expect every "replace the active story" entry point to
behave the same way.

## What changes

`src/server/tools/create_story.ts`:

- New optional input field `discard_unsaved: boolean`. Default false.
- New early guard: if `getActiveStory().dirty === true` and
  `discard_unsaved !== true`, return a clarification with
  `valid_answers: ["save_first", "discard_unsaved", "cancel"]`. Replay
  semantics mirror `load_story.ts` line for line so the two tools have
  byte-equivalent dirty-guard behaviour.
- Updated `description` and `clarificationTriggers` to reflect the new
  contract (regenerates `docs/GUIDE.md`; CI's guide-drift gate enforces
  the regenerate-and-commit step).

`src/smoke.ts` adds section **23b** that exercises both branches
(`discard_unsaved` and `cancel`) on a dirty active story.

## What does NOT change

- Tool name, signature for already-passing args, IFID generation,
  format clarification path. All existing callers that supplied
  `format` upfront on a clean state keep working unchanged.
- `load_story.ts` — its behaviour is the reference; we copy, we don't
  edit it.

## Acceptance criteria

- `create_story({name: "X", format: "Y"})` on a dirty active story
  returns `{ kind: "clarification_needed" }` with the three canonical
  answers.
- `respond_to_clarification(..., answer: "save_first")` triggers
  `save_story` and, if save itself returns a clarification (e.g. needs
  `output_dir`), surfaces THAT clarification verbatim — same passthrough
  as `load_story`.
- `respond_to_clarification(..., answer: "discard_unsaved")` creates
  the new story.
- `respond_to_clarification(..., answer: "cancel")` returns
  `{ kind: "ok", cancelled: true }` and leaves the active story
  untouched.
- `create_story({...args, discard_unsaved: true})` skips the
  clarification entirely (escape hatch for tools or tests that genuinely
  want to clobber).
- `npm run smoke` (and CI) stay green; new section 23b passes in both
  stdio and http transports.

## Out of scope

- Any other tool that touches the active story's identity (load_story
  is already correct; there's no third entry point today).
- Persistence of the dirty flag across server restarts — explicit
  non-goal of the v1 single-active-story model.
