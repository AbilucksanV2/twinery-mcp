# Implementation Plan: GitHub Actions CI

**Branch**: `007-ci` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)

## Summary

One GitHub Actions workflow file plus three small Node check scripts, all
new files. Modifies `package.json` to add a `typecheck` script and a
`cross-env` devDependency so the existing smoke scripts work in `cmd.exe`
on Windows runners. Modifies `src/smoke.ts` once to make a path-separator
assertion platform-agnostic so the Windows runner stays green.

## Technical Context

- **Runner OSes**: `ubuntu-latest`, `macos-latest`, `windows-latest`.
- **Node version**: 20 LTS (matches `engines.node` in `package.json`).
- **Caching**: `actions/setup-node@v4` `cache: npm` keyed on `package-lock.json`.
- **No new runtime deps**. One devDep added: `cross-env@^7` for Windows-safe
  env-var prefixing in npm scripts.
- **No new top-level scripts**: `typecheck` is added (`tsc --noEmit`); the
  three guardrail scripts are invoked by file path from CI, not via npm
  scripts (keeps `package.json` tidy).

## Constitution Check

| Principle | Compliance |
|-----------|-----------|
| **I. Spec-Faithful Format Fidelity** | ✅ No format / parser change. |
| **II. MCP-Native & Model-Agnostic** | ✅ The no-LLM-SDK gate enforces this principle mechanically; this feature *implements* the constitution's commitment, it doesn't violate it. |
| **III. Graph-Integrity First** | ✅ No tool surface change. |
| **IV. Native-Twine Export Parity** | ✅ Save / load paths untouched. |
| **V. Open-Source Licensing Discipline** | ✅ The license-check gate enforces this principle mechanically. The one new devDep (`cross-env`) is MIT. |

No violations.

## Project Structure (changes)

```
.github/
└── workflows/
    └── ci.yml                            (new — single matrix workflow)

scripts/
├── check-licenses.mjs                    (new)
├── check-no-llm-sdk.mjs                  (new)
└── check-guide-drift.mjs                 (new)

specs/007-ci/
├── spec.md                               (new)
├── plan.md                               (new — this file)
└── tasks.md                              (new)

package.json                              (modified — typecheck script, cross-env devDep, smoke scripts use cross-env)
src/smoke.ts                              (modified — one path.includes assertion built via path.join for Windows)
```

## Phase 0 — micro-decisions

### R1 — Lint deferral

`T-F-CI-01` (eslint over src) is removed from the active task list and
tracked as a follow-up backlog row. Reason: the project has no eslint
config, so adding the *job* requires also picking a config, exempting
existing code, and choosing plugins. That is its own scoping problem and
was holding F-CI back. The CI workflow leaves a clearly-named comment
where the lint step would slot in.

### R2 — License-check tool

**Decision**: Hand-rolled `scripts/check-licenses.mjs` that walks
`node_modules` and reads each `package.json#license` field. ~60 LOC, no
new dependency.

**Rationale**: The off-the-shelf tools (`license-checker`,
`license-checker-rseidelsohn`) bring a tree of CommonJS deps for what is
fundamentally a flat-file walk. Constitution V says we add a dep only if
it replaces code we'd write ourselves; for 60 LOC the trade is wrong.

**Alternatives considered**:
- `npx license-checker --onlyAllow ...` — rejected (npx in CI is
  unpredictable and adds runtime; cache-miss inflates wall-clock).
- Adding `license-checker` as devDep — rejected (extra surface).

### R3 — No-LLM-SDK check

**Decision**: A `scripts/check-no-llm-sdk.mjs` that does two things:
(a) reject any of the known LLM-vendor package names appearing in
`package.json` `dependencies` / `devDependencies`; (b) reject any import
statement under `src/` that references those names. The blocklist:
`@anthropic-ai/sdk`, `openai`, `@google/generative-ai`,
`@google-ai/generativelanguage`, `cohere-ai`, `@mistralai/mistralai`.

**Rationale**: Constitution principle II demands model-agnosticism. A grep
is cheap and exact. We deliberately do *not* block strings like
"anthropic" appearing in comments or doc text — only import statements and
dependency entries. This matches the principle's intent (no SDK at runtime,
not a witch-hunt on prose).

### R4 — Guide-drift check

**Decision**: `scripts/check-guide-drift.mjs` calls `buildGuide()` from
`dist/guide/build.js` (so the workflow runs `npm run build` before this
step) and asserts byte-equivalence with `docs/GUIDE.md` on disk. On
mismatch, prints the diff and exits 1.

**Rationale**: The guide is already auto-generated from the registry; the
risk is forgetting to commit the regenerated file. A byte-equivalence gate
is the smallest possible check that catches it.

### R5 — Cross-platform smoke compatibility

**Decision**: Add `cross-env` devDep; rewrite the three smoke scripts to
prefix `cross-env`. Fix one assertion in `src/smoke.ts` that uses
`"assets/locked-door/brass-lock.png"` as a hard-coded substring — replace
with a `path.join` build so the Windows separator (`\`) matches.

**Rationale**: This is the minimum to make the existing smoke runner green
on `windows-latest`. The smoke runner already uses `process.execPath` for
spawns, so platform-specific bash assumptions are confined to these two
spots.

### R6 — Branch protection / required checks

**Out of scope for this feature**. The workflow runs and reports a status;
configuring branch protection to require it lives in the GitHub UI and is
the maintainer's call.

## Edge cases

- **First run on a private repo with no GitHub Actions minutes**:
  documented; not a code concern.
- **`npm ci` failing on Windows due to optional native deps**: this
  project has zero native deps (extwee is pure JS), so this is moot.
- **Smoke test wall-clock on Windows runners**: empirically slower than
  macOS/Ubuntu. The combined run is ~6 s on macOS; expect ≤30 s on
  Windows. Still under the SC-002 ≤10 min budget by a wide margin.

## Out of scope (tracked elsewhere)

- ESLint job (deferred — see R1).
- Release / publish automation.
- Coverage / SAST / Dependabot.
- Cross-platform Twine format fixtures (`F-FIXTURES`, separate feature).

## Complexity Tracking

No violations.
