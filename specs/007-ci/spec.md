---
description: "Spec for feature 007 — GitHub Actions CI"
---

# Feature 007 — GitHub Actions CI

**Branch**: `007-ci` | **Date**: 2026-05-04 | **Backlog row**: `F-CI` (E06 cross-cutting infra, P2)

## Why

The constitution mandates Windows / macOS / Linux parity, but every release so
far has been validated only on the maintainer's macOS laptop. Feature 006 just
hit this gap directly — T020's "manual cross-platform spot check" deferred
Linux/Windows to F-CI because no automated cross-platform run exists yet.

This feature stands up GitHub Actions CI on the project so every push and PR
runs the existing automated checks across all three OSes, plus the
constitution-mandated guardrails (license discipline, no-LLM-SDK rule,
guide-drift) that today live only in code review prose.

## What's in scope

A single workflow at `.github/workflows/ci.yml`, triggered on push to
`main` / `dev` and on pull request, running a matrix of `ubuntu-latest`,
`macos-latest`, `windows-latest` × Node 20 LTS. The matrix runs the
following gates:

1. **Typecheck** — `tsc --noEmit` (currently ad-hoc; promoted to a CI gate
   and a `npm run typecheck` script).
2. **Smoke** — `npm run smoke` on every OS. This is the load-bearing
   functional test (24 sections × stdio + http + 7 CLI / host / port
   sections from feature 006).
3. **License discipline** — `node scripts/check-licenses.mjs` walks the
   production dependency tree and asserts every direct + transitive license
   sits in the allowlist (MIT, ISC, Apache-2.0, BSD-2/3-Clause, MPL-2.0,
   BlueOak-1.0.0). Constitution principle V.
4. **No LLM-provider SDK** — `node scripts/check-no-llm-sdk.mjs` greps
   `package.json` and `src/` for known LLM-vendor SDK identifiers and fails
   if any appear. Constitution principle II.
5. **Guide-drift** — `node scripts/check-guide-drift.mjs` runs the in-process
   guide builder and asserts byte-equivalence with the committed
   `docs/GUIDE.md`. Stops a stale guide from being merged. Constitution
   principle II.

## What's explicitly out of scope

- **eslint-based lint** (T-F-CI-01 in the original backlog row). The project
  has no eslint config today; adding one requires its own scoping (which
  rules, what to ignore in legacy code, plugin set). Tracked as a separate
  follow-up; CI gains an empty placeholder so adding it later is a one-line
  workflow edit.
- **Release/publish automation** — out of scope; F-CI is gates only.
- **Coverage / SAST / Dependabot wiring** — separate features.

## Acceptance criteria

- CI workflow runs on every push to `main` / `dev` and every PR targeting
  them.
- Matrix exercises ubuntu-latest, macos-latest, windows-latest on Node 20.
- All five gates above pass against the current dev tip on all three OSes.
- A change that adds an LLM-provider SDK to `package.json` causes red CI.
- A change that adds a GPL-licensed transitive dep causes red CI.
- A change that mutates a tool's metadata without regenerating
  `docs/GUIDE.md` causes red CI.
- A type error introduced anywhere under `src/` causes red CI.
- A regression that breaks the HTTP transport's per-session pattern causes
  red CI (smoke section T011b is the regression test).

## Success criteria

- **SC-001**: A typo-level type error introduced in `src/` is surfaced by CI
  within ≤ 5 minutes of the commit.
- **SC-002**: The full matrix run completes in ≤ 10 minutes wall-clock end
  to end.
- **SC-003**: No flake on three consecutive runs of the green tip.
