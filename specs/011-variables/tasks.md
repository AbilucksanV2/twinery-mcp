---

description: "Task list for feature 011 — Variable management tools"
---

# Tasks: Variable management tools

**Input**: design documents from `/specs/011-variables/`
**Prerequisites**: spec.md (required), plan.md (required), research.md, data-model.md, contracts/tools.json, quickstart.md

**Tests**: Extending the existing `npm run smoke` runner with a new section per user story (23c → 23f), plus a follow-up fixture revision that adds one variable per format to the F-FIXTURES round-trip suite. Pure-unit tests for the per-format emit / extract helpers are optional and grouped at the foundational layer.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Single-project TypeScript package, layout unchanged from v0.5. New files under `src/server/tools/` and one new helper at `src/twine/variables.ts`. Modifications to `src/server/state.ts`, `src/server/tools/load_story.ts`, `src/server/tools/delete_passage.ts`, `src/guide/registry.ts`, `src/smoke.ts`, `README.md`, `package.json`, `tracking/backlog.csv`. No transport changes.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the assumption that extwee passes setter / reader text through unchanged. This is already proved by F-FIXTURES — recording it here makes the dependency explicit.

- [X] T001 Verify extwee passage-text round-trip preserves arbitrary substrings byte-for-byte across all four formats (Harlowe / SugarCube / Chapbook / Snowman) by adding a one-off check to `specs/011-variables/research.md` § R1 — if the smoke fixture run after this feature shows any drift, the feature blocks. (No code change; checkpoint only.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The format-aware emit / extract helpers and the `ActiveStory.variables` registry every tool in this feature depends on. No tool work begins until this phase ships.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T002 Create `src/twine/variables.ts` exporting `Variable`, `SetterRecord`, `ReaderRecord` TypeScript types matching `specs/011-variables/data-model.md`. Same file exports `RESERVED_NAMES: Record<StoryFormat, Set<string>>` populated with the v1 conservative sets from `specs/011-variables/contracts/tools.json` `reserved_names`. Also export `isReserved(format, name): boolean` and `validateVariableName(name): { ok: true } | { ok: false, message: string }` enforcing `^[A-Za-z_][A-Za-z0-9_]*$`.

- [X] T003 In `src/twine/variables.ts`, add `emitSetter(format, name, value): string` and `emitReader(format, name): string` — eight branches total (one per `(format, role)` pair from the format-syntax matrix in `contracts/tools.json`). String values get the format-correct quoting per spec FR-009; numbers and booleans emit unquoted as JavaScript literals (`true` / `false` in Chapbook too per clarify Q4). Each setter is returned with a trailing newline included so it slots cleanly into existing passage text.

- [X] T004 In `src/twine/variables.ts`, add `extractSetters(format, passageText): Array<{ name, value, offset, block }>` and `extractReaders(format, passageText): Array<{ name, offset, block }>` using per-format regex (Harlowe `(set: \$X to V)`, SugarCube `<<set \$X to V>>`, Chapbook `name: value` lines above the `--` separator, Snowman `<% s.X = V %>`). Readers: Harlowe `\$name`, SugarCube `<<= \$name>>`, Chapbook `{name}`, Snowman `<%= s.name %>`. Per research R6, the Chapbook extractor MUST split on the first standalone `--` line and only treat the upper half as the vars section.

- [X] T005 In `src/twine/variables.ts`, add `findInsertOffsetBeforeTrailingLinks(format, passageText): number` that returns the character index immediately before the first trailing `[[...]]` link block, walking past trailing whitespace from the end of the text. If no trailing-link block exists, return `passageText.length` (append). Use the link grammars consolidated in `src/twine/formats.ts` (arrow / pipe per format).

- [X] T006 Modify `src/server/state.ts`: add `variables: Variable[]` to the `ActiveStory` interface; `setActiveStory()` initialises it to `[]`. Export helper functions `getVariableByName(name)`, `upsertVariable(v)`, `removeVariableByName(name)`, plus a `markDirty()` helper if one doesn't exist yet so every variable tool can flip the dirty flag in one place (FR-013). Existing callers of `setActiveStory` need no signature change.

- [X] T007 `npm run build && npm run typecheck` clean; smoke (stdio + http + cli + fixtures) still green. No tool work begins until this checkpoint is met.

**Checkpoint**: Foundational helpers compile, types exported, smoke green.

---

## Phase 3: User Story 1 — Declare and read a variable (Priority: P1) 🎯 MVP

**Goal**: An LLM can declare a variable, insert a reader in another passage, save, and play the result in the Twine 2 editor with the variable's value rendered. Works across all four formats.

**Independent Test**: From a fresh active story in any of the four formats, call `declare_variable({ name: "playerName", initial: "the stranger" })`, then `insert_variable_reader({ passage_name: "Greeting", name: "playerName" })`, then `save_story()`. The on-disk `.twee` contains the format-correct setter in Start and the format-correct reader in Greeting. Opening the `.html` in the Twine 2 editor and reaching Greeting renders the literal value.

### Implementation tasks for User Story 1

- [X] T008 [US1] Implement `src/server/tools/declare_variable.ts` exporting `description`, `clarificationTriggers`, `example`, `inputSchema` (zod), and `handler`. Handler validates the name (T002 helpers), rejects format-reserved names with a clear `kind: error` response (FR-010), surfaces a `replace_initial | leave_as_is | cancel` clarification on duplicate names (FR-011), and on success calls `emitSetter` (when `initial` is provided) and appends it to the Start passage's text. Updates the registry. Flips dirty.

- [X] T009 [US1] Implement `src/server/tools/insert_variable_reader.ts`. Validates the variable name; surfaces a `declare_now | cancel` clarification if the variable isn't in the registry (FR-006); surfaces the existing passage-not-found clarification when `passage_name` doesn't match. On success calls `findInsertOffsetBeforeTrailingLinks` (T005) when no explicit `offset` is passed; emits the reader and splices it into the passage text; records the `ReaderRecord` on the variable. Flips dirty.

- [X] T010 [US1] Implement `src/server/tools/read_variable.ts` (read-only). Returns the variable's current registry view (name, type, initial_value, setter_count, reader_count, loaded_without_setter). Returns `{ kind: error, message }` on unknown name (NOT a clarification — FR-003 is explicit).

- [X] T011 [US1] Register the three new tools in `src/guide/registry.ts` (`declare_variable`, `read_variable`, `insert_variable_reader`). Order them next to the existing read-tools for guide readability. Regenerate `docs/GUIDE.md` via `npm run guide:generate`.

- [X] T012 [US1] Add smoke section 23c to `src/smoke.ts`: `create_story` Harlowe → `create_passage` Start + Greeting → `declare_variable playerName "the stranger"` → `insert_variable_reader Greeting playerName` → `save_story` → re-read `.twee` and assert it contains `(set: $playerName to "the stranger")` in Start and `$playerName` in Greeting. Confirm dirty flag transitions correctly through these calls.

**Checkpoint**: After T008–T012, `npm run smoke` green (24 + 23c + cli + fixtures). MVP shippable as v0.6.0-rc1 if desired.

---

## Phase 4: User Story 2 — Update a variable mid-story (Priority: P1)

**Goal**: A passage can change the variable's value as a side effect of being visited. Idempotent within a passage.

**Independent Test**: From a story that already has a declared variable, call `set_variable({ passage_name: "DecideName", name: "playerName", value: "Mira" })`; call it again with `value: "Anya"`; assert the passage text contains exactly ONE setter for `playerName` with value `"Anya"`. Repeat across all four formats.

### Implementation tasks for User Story 2

- [X] T013 [US2] Implement `src/server/tools/set_variable.ts`. Validates name and value; surfaces a `declare_now | cancel` clarification if the variable isn't in the registry (FR-002 implies declaration first); surfaces the existing passage-not-found clarification when `passage_name` doesn't match. Idempotency: if the registry has a `SetterRecord` for this `(name, passageName)` pair, splice out the old block from the passage text and emit the replacement at the same offset (action: `replaced`); otherwise append a new setter and record a fresh `SetterRecord` (action: `created`). Flips dirty.

- [X] T014 [US2] Register `set_variable` in `src/guide/registry.ts`. Regenerate `docs/GUIDE.md`.

- [X] T015 [US2] Add smoke section 23d to `src/smoke.ts`: from a Harlowe story with `playerName` declared, call `set_variable` on a non-Start passage twice with different values; assert the passage's text contains exactly one setter line for `playerName` and the value is the second call's value. Returned `action` field is `created` on first call, `replaced` on second.

**Checkpoint**: After T013–T015, smoke covers set_variable idempotency. SC-001 (under-5-tool-calls budget for a variable-gated branch) achievable end-to-end.

---

## Phase 5: User Story 3 — Inspect declared variables (Priority: P2)

**Goal**: `list_variables` returns the registry; `load_story` populates the registry from setters / readers extracted from the loaded text.

**Independent Test**: Declare three variables across two passages; call `list_variables`; assert response includes all three with correct setter / reader passages. Then save, restart server, load — `list_variables` returns the same three variables (FR-004a extraction).

### Implementation tasks for User Story 3

- [X] T016 [US3] Implement `src/server/tools/list_variables.ts` (read-only). Returns the registry as documented in `contracts/tools.json` `list_variables.ok_response`. Reads exclusively from the registry; no re-parsing of passage text per FR-004 / clarify Q1.

- [X] T017 [US3] Modify `src/server/tools/load_story.ts` to call `extractSetters` and `extractReaders` (T004) over every loaded passage after extwee parsing. Build the registry from the extracted records: deduplicate by variable name; `initialValue` taken from the Start passage's setter if present, otherwise the first setter encountered (research R6); readers without setters land in the registry with `loadedWithoutSetter: true` and `initialValue: null`. Sort setters and readers within each variable by passage name then offset (data-model invariants).

- [X] T018 [US3] Register `list_variables` in `src/guide/registry.ts`. Regenerate `docs/GUIDE.md`.

- [X] T019 [US3] Add smoke section 23e to `src/smoke.ts`: declare two variables across two passages → save → call `load_story` on the saved `.twee` → call `list_variables` → assert both variables present with correct passage names in `setter_passages` and `reader_passages`. Also test the `loadedWithoutSetter` path by hand-editing a `.twee` to include a reader without a setter and loading it.

**Checkpoint**: After T016–T019, the round-trip case (FR-004a) is covered by smoke. SC-002 (the four-format fixture extension) is a follow-up task in Phase 7.

---

## Phase 6: User Story 4 — Remove a variable (Priority: P3)

**Goal**: `delete_variable` atomically removes every setter and every reader from passage text and updates the registry. Honours the dirty guard.

**Independent Test**: Declare a variable, insert readers in two passages, set it in a third. Call `delete_variable({ name })`. Save. Re-parse the `.twee` and assert no setter or reader for the deleted name remains anywhere. Also assert the dirty-guard clarification fires when the active story is dirty and `discard_unsaved` is not set.

### Implementation tasks for User Story 4

- [X] T020 [US4] Implement `src/server/tools/delete_variable.ts`. Dirty guard first (matches feature 010's pattern in `load_story` / `create_story` — `save_first | discard_unsaved | cancel`). On clean (or discard-confirmed): iterate the variable's setters and readers; for each, splice the `block` out of the corresponding passage's text at the recorded `offset`. After every splice, update offsets on any sibling records in the same passage that lived downstream of the spliced block (decrement by the block length). Remove the variable from the registry. Returns `setters_removed`, `readers_removed`, `affected_passages` per `contracts/tools.json`.

- [X] T021 [US4] Modify `src/server/tools/delete_passage.ts` to call a new helper `dropPassageFromRegistry(passageName)` that walks every variable in the registry, drops `SetterRecord` / `ReaderRecord` entries whose `passageName` matches, and removes any variable whose setter / reader lists both go empty (research R7 invariants). The existing incoming-link handling in delete_passage is unchanged; the registry sync is an additional step inside the existing handler.

- [X] T022 [US4] Register `delete_variable` in `src/guide/registry.ts`. Regenerate `docs/GUIDE.md`.

- [X] T023 [US4] Add smoke section 23f to `src/smoke.ts`: declare one variable; set it in two passages and insert readers in another two; save (clean state). Call `delete_variable({ name })`. Re-read the `.twee` and assert zero setters / readers for the name remain anywhere. Then dirty the story with a mutation and call `delete_variable` again; assert a `clarification_needed` with the three canonical answers. Resolve with `discard_unsaved` and confirm the delete completes.

**Checkpoint**: After T020–T023, every user story has full coverage. SC-003 (real-length-story play test) is a manual check captured separately.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Docs, version bump, fixture extension, backlog hygiene, final Constitution sweep.

- [X] T024 [P] Update `README.md` tool table — the 15-tool list becomes 21 tools. Add a short "Variables" section near the Image-placeholder pattern explaining the format-syntax matrix at one glance. Reference [`specs/011-variables/quickstart.md`](specs/011-variables/quickstart.md) for the walkthrough.

- [X] T025 [P] Final `npm run guide:generate` to regenerate `docs/GUIDE.md` end-to-end. CI's guide-drift gate will enforce this on every push.

- [X] T026 [P] [US3] Fixture extension for SC-002: add one variable per format to the existing `fixtures/{harlowe,sugarcube,chapbook,snowman}/source.twee`. Setter in Start, reader in a non-Start passage. The existing `src/fixtures.ts` runner compares passage text structurally so the new setters / readers are exercised by the existing 12 round-trip checks (Twee↔Twee, Twee↔HTML↔Twee, Twee↔JSON↔Twee) without any runner change.

- [X] T027 Update `tracking/backlog.csv` F-VARIABLES row → `in_progress` with branch `011-variables`. Per the LLM-session discipline (CLAUDE.md), update the row in place.

- [X] T028 Run `npm run build && npm run smoke` (full stdio + http + cli + fixtures) one last time. Capture combined wall-clock and confirm the SC-005 invariant (smoke chain stays green; no new ignored sections).

- [X] T029 Bump `package.json` version to `0.6.0-rc1`. `npm install` should be a no-op (SC-004 — zero new deps).

- [X] T030 Final Constitution Check sweep — re-read `.specify/memory/constitution.md`, confirm all five principles still pass post-implementation. Update the F-VARIABLES row to `done` with PR# + merge commit hash post-merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 has no dependencies — record-only checkpoint.
- **Foundational (Phase 2)**: T002 → T003 → T004 → T005 (all touch `src/twine/variables.ts` so must be sequential). T006 (state.ts) can run in parallel with T002–T005. T007 depends on every Phase 2 task.
- **User Story 1 (Phase 3)**: depends on Phase 2 complete.
- **User Story 2 (Phase 4)**: depends on Phase 2 + Phase 3 (set_variable lives next to declare_variable and reuses helpers).
- **User Story 3 (Phase 5)**: depends on Phase 2 + Phase 3 (load extraction reuses extractSetters; list_variables doesn't depend on US1 strictly but smoke section 23e does).
- **User Story 4 (Phase 6)**: depends on Phase 2 + at least US1 (delete needs something to delete).
- **Polish (Phase 7)**: depends on every story being green except T026 which can land any time after T004 (the extractors).

### Within Each User Story

- US1: T008, T009, T010 are parallel-ish (different files); T011 depends on all three; T012 depends on T011.
- US2: T013 → T014 → T015 sequential.
- US3: T016 / T017 parallel; T018 depends on T016; T019 depends on T017.
- US4: T020 / T021 parallel; T022 depends on T020; T023 depends on T020 + T021.

### Parallel Opportunities

- Within Phase 2: T006 (state.ts) parallel with T002–T005 (variables.ts).
- Across user stories after Phase 2: US3's read tool (T016) doesn't depend on US2 — could be parallelised if priorities shifted.
- T024 / T025 / T026 in Polish — all parallelisable (different files / outputs).

---

## Parallel Example: Foundational layer

```bash
# After T001 records the assumption, T006 (state.ts) can run in parallel
# with T002–T005 (variables.ts) — they touch different files.
# Within variables.ts, T002 → T003 → T004 → T005 stay sequential because
# each adds to the same module's exports.

T002: types + validation helpers
T006: state.ts ActiveStory extension                 # parallel with T002–T005
T003: emit helpers
T004: extract helpers
T005: trailing-link offset helper
T007: build + smoke checkpoint
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 + Phase 2 (verify assumption + foundational helpers).
2. Complete Phase 3 (declare + reader + read tool + smoke section 23c).
3. **STOP and validate**: a Harlowe story with a declared variable plays correctly in the Twine 2 editor. The dev-loop walkthrough from `quickstart.md` succeeds for a single format.
4. Decide whether to ship v0.6.0-rc1 here or continue.

### Incremental Delivery

1. Phase 1 + 2 → foundation ready.
2. Phase 3 (US1) → MVP; ships as v0.6.0-rc1 if desired.
3. Phase 4 (US2) → mid-story updates work; idempotency proved.
4. Phase 5 (US3) → list + load-extraction; round-trip closed.
5. Phase 6 (US4) → delete + delete_passage integration; cleanup symmetry.
6. Phase 7 → docs + fixtures + version bump → v0.6.0 release.

### Atomic-commit Mapping

Each Phase produces one atomic commit on the `011-variables` branch:

- Phase 2 — `feat(variables): foundational helpers + ActiveStory.variables registry`
- Phase 3 — `feat(variables): declare_variable / insert_variable_reader / read_variable (US1 MVP)`
- Phase 4 — `feat(variables): set_variable with passage-scope idempotency (US2)`
- Phase 5 — `feat(variables): list_variables + load_story extract-on-load (US3)`
- Phase 6 — `feat(variables): delete_variable + delete_passage registry sync (US4)`
- Phase 7 — `chore(variables): README + GUIDE + fixtures + version bump + backlog`

Six commits in `feat:` / `chore:` form, each independently reviewable, each leaving the smoke + fixtures + CI gates green.

---

## Notes

- The smoke runner is the load-bearing test artefact. Unit tests for the per-format extractors are not strictly required for v1; if added, they live alongside `src/twine/variables.ts` and run from a future `npm run test:unit` script that doesn't exist as a separate command today.
- Do not skip the dirty-guard tests in T020 / T023. They're how feature 010's contract extends cleanly across the new mutation tools.
- Do not skip the load-extraction test in T019. It's the only smoke evidence that FR-004a holds — without it the clarify Q1 outcome (option C) regresses silently.
- The fixture extension (T026) is the cheapest way to satisfy SC-002. The existing `src/fixtures.ts` runner compares passage text structurally; adding one variable per format adds zero runner code.
