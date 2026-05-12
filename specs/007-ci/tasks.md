---
description: "Task list for feature 007 — GitHub Actions CI"
---

# Tasks: GitHub Actions CI

**Input**: design documents from `/specs/007-ci/`
**Prerequisites**: spec.md, plan.md

## Phase 1: Cross-platform fixes (foundation)

- [X] T001 Add `cross-env@^7` as a devDependency in `package.json`. Rewrite `smoke:stdio` and `smoke:http` scripts to use `cross-env SMOKE_TRANSPORT=... node ...` so they work in `cmd.exe` on Windows runners. Add a new `typecheck` script (`tsc --noEmit`).
- [X] T002 In `src/smoke.ts`, replace the literal substring `"assets/locked-door/brass-lock.png"` in section 10's assertion with a value built from `path.join` so the Windows separator (`\`) matches. No other smoke assertions use platform-specific separators (verified by grep over the file).

## Phase 2: Guardrail scripts

- [X] T003 [P] `scripts/check-no-llm-sdk.mjs` — fails if any of `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`, `@google-ai/generativelanguage`, `cohere-ai`, `@mistralai/mistralai` appears in `package.json` deps or in import statements under `src/`. Walks `src/` itself (no shell `grep` so the script is portable across runners).
- [X] T004 [P] `scripts/check-licenses.mjs` — walks `node_modules` (production deps only via the `npm ls --prod --json` output) and asserts every license sits in the allowlist `MIT | ISC | Apache-2.0 | BSD-2-Clause | BSD-3-Clause | MPL-2.0 | BlueOak-1.0.0 | 0BSD`. Accepts SPDX OR-expressions where at least one operand is allowed (`MIT OR Apache-2.0` passes). Lists offending packages on failure.
- [X] T005 [P] `scripts/check-guide-drift.mjs` — imports `buildGuide` from `dist/guide/build.js`, compares against `docs/GUIDE.md` on disk, exits 1 with a unified-diff summary on mismatch.

## Phase 3: Workflow

- [X] T006 `.github/workflows/ci.yml` — single matrix job (`ubuntu-latest`, `macos-latest`, `windows-latest` × Node 20). Steps: checkout → setup-node with `cache: npm` → `npm ci` → `npm run typecheck` → `npm run build` → `npm run smoke` → `node scripts/check-no-llm-sdk.mjs` → `node scripts/check-licenses.mjs` → `node scripts/check-guide-drift.mjs`. Triggers on push to `main` / `dev` and on pull request.

## Phase 4: Local verification

- [X] T007 Run each guardrail script locally; confirm exit 0 against a clean tip.
- [X] T008 Smoke-poison each guardrail to confirm exit non-zero on a violation: temporarily add a fake LLM-SDK dep, a GPL dep, and a stale-guide change; revert each after confirming the script catches it.
- [X] T009 Re-run `npm run smoke` (full both-transport + CLI) on the local macOS host as a final pre-push sanity check. Wall-clock target: ≤30 s combined.

## Phase 5: Polish

- [X] T010 Update `tracking/backlog.csv`: F-CI row → `branch=007-ci`, `status=in_progress` (status flipped to `done` post-merge with PR# + commit). T-F-CI-01 (lint) → status `backlog` with a comment that it's deferred to a follow-up. T-F-CI-02..06 → status `done` once the workflow is green on a real PR.
- [X] T011 Add a short note to `README.md` under "Verify locally" that CI runs the same checks on every push.

---

## Dependencies & ordering

- T001 → T002 (independent but both touch foundation; either order)
- T003, T004, T005 are parallel — different files, no overlap.
- T006 depends on T001..T005 (workflow invokes them all).
- T007..T009 depend on T006 (verification of the wired-up CI).
- T010..T011 are pure polish; can land after the rest is green.

## Notes

- The lint job (eslint over src/) is deferred per plan R1 — a placeholder
  comment in `ci.yml` marks where it'll slot in.
- T010's backlog edit should leave the existing T-F-CI-01..06 task IDs in
  place (they're the original breakdown); only the status field changes.
