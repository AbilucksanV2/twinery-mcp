# Data Model: Variable management tools

**Feature**: 011-variables
**Date**: 2026-05-15

This feature adds one entity (`Variable`) and two record sub-types
(`SetterRecord`, `ReaderRecord`) to the active-story state shape.
Nothing else changes — passage text, the existing `imagePlaceholders`
collection, the dirty flag, and the last-saved metadata stay exactly
as v0.5 defined them.

## New entities

### `Variable` (server-internal)

Lives in a `variables` array on `ActiveStory`, next to
`imagePlaceholders`. Created by `declare_variable` calls in this
session OR by `load_story` extracting setters from passage text on
load (FR-004a).

| Field | Type | Required | Source | Validation |
|-------|------|----------|--------|------------|
| `name` | `string` | yes | tool arg or extracted setter | matches `^[A-Za-z_][A-Za-z0-9_]*$`; not in active format's `RESERVED_NAMES` set (research R4); case-sensitive (spec clarification 2026-05-15 Q2) |
| `type` | `"string" \| "number" \| "boolean"` | yes | inferred from initial value or extracted setter literal | one of the three |
| `initialValue` | `string \| number \| boolean \| null` | yes | tool arg (defaults `null` if omitted) or extracted setter in Start passage (research R6) | matches `type` |
| `setters` | `SetterRecord[]` | yes | populated as the variable is set in passages | sorted by passage name then offset |
| `readers` | `ReaderRecord[]` | yes | populated as `insert_variable_reader` runs | sorted by passage name then offset |
| `loadedWithoutSetter` | `boolean` | no | true only if `load_story` extracted a reader but no setter for this name (research R6) | used by `read_variable` to flag the uninitialised state |

**Lifecycle**:
- Created by `declare_variable` (or extracted during `load_story`).
- Mutated by `set_variable`, `insert_variable_reader`,
  `delete_variable`, and indirectly by `delete_passage` (which drops
  setter / reader records owned by the deleted passage and may drop
  the variable entirely if its setter / reader counts both reach zero).
- Persisted ONLY via the setters and readers it has in passage text;
  the registry is rebuilt from passage text on the next `load_story`.

**Invariants**:
- A `Variable` with both empty `setters` and empty `readers` MUST be
  removed from the registry. The registry never holds ghost entries.
- The setter that lives in the Start passage (if any) defines
  `initialValue`. If no Start setter exists, `initialValue` is the
  first setter encountered during extraction (research R6).

### `SetterRecord` (server-internal)

One per `(set $name to value)` expression in passage text.

| Field | Type | Notes |
|-------|------|-------|
| `passageName` | `string` | The passage whose text contains this setter. |
| `value` | `string \| number \| boolean` | The current value the setter writes. Matches the `Variable.type`. |
| `offset` | `number` | Character offset within the passage text where the setter block starts. Used for idempotent replacement on `set_variable` re-call (FR-002). |
| `block` | `string` | The full emitted setter text including any surrounding newlines that the emitter adds. Used by `delete_variable` to splice out the exact substring without disturbing neighbouring prose. |

### `ReaderRecord` (server-internal)

One per reader expression (`$name`, `<<= $name>>`, `{name}`,
`<%= s.name %>`) in passage text.

| Field | Type | Notes |
|-------|------|-------|
| `passageName` | `string` | The passage whose text contains this reader. |
| `offset` | `number` | Character offset within the passage text where the reader starts. |
| `block` | `string` | The exact reader substring as it appears in text. Used by `delete_variable` to splice it out and by future tooling to highlight readers in IDE-style integrations. |

## Modified entity

### `ActiveStory` (`src/server/state.ts`)

Gains one field:

```ts
interface ActiveStory {
  story: Story;
  slug: string;
  format: StoryFormat;
  lastSavedPath: string | null;
  lastSavedAt: number | null;
  dirty: boolean;
  imagePlaceholders: ImagePlaceholderRecord[];
  variables: Variable[];           // NEW
}
```

`setActiveStory()` initialises `variables` to `[]`. `load_story`
populates it from extraction. Every variable-mutating tool flips
`dirty` to `true` (FR-013), same plumbing as the other mutation tools.

## Relationships

```text
ActiveStory 1───* Variable
Variable    1───* SetterRecord  ─── 1:1 by (passageName, offset) ───→ Passage.text region
Variable    1───* ReaderRecord  ─── 1:1 by (passageName, offset) ───→ Passage.text region
Passage     1───* SetterRecord  (reverse index implicit; built on demand)
Passage     1───* ReaderRecord  (reverse index implicit; built on demand)
```

No cross-cutting persistence is added. Disk artifacts written by
`save_story` and read by `load_story` continue to be the `.twee` and
`.html` (and their JSON pair) — variables are encoded as setter /
reader text inside the passages they belong to.

## State transitions

There are no new state machines per se. The only transitions worth
naming:

- **`declare_variable(name, initialValue?)`**: registry entry created
  with one setter in the Start passage (the setter is appended to the
  Start passage's text in format-correct syntax). If a Start passage
  doesn't exist, surface a clarification (spec FR-001).
- **`set_variable(passage_name, name, value)`**: if the passage already
  has a setter for this variable, replace its block + value (idempotent
  per FR-002); otherwise append a new setter to the passage and
  record a fresh `SetterRecord`.
- **`insert_variable_reader(passage_name, name, offset?)`**: if `offset`
  is provided, insert at that position. Otherwise find the trailing-
  link boundary (research R3) and insert immediately before it. Record
  a fresh `ReaderRecord`.
- **`delete_variable(name)`**: for every `SetterRecord` and
  `ReaderRecord`, splice the block out of the passage text. Remove
  the `Variable` entry from the registry. Honours the dirty guard
  (FR-013 — clarification `save_first | discard_unsaved | cancel`).
- **`load_story(...)`**: replace the registry with a fresh extraction
  from every loaded passage.
- **`delete_passage(name)`**: drop every `SetterRecord` /
  `ReaderRecord` whose `passageName === name` from every variable. If
  any variable ends up with zero setters AND zero readers, remove it
  from the registry.

## Validation rules summary

Pulled together for the test plan:

| Input | Valid form | Invalid examples | Behaviour on invalid |
|---|---|---|---|
| Variable `name` | `^[A-Za-z_][A-Za-z0-9_]*$`; not in active format's `RESERVED_NAMES` | `$x`, `1foo`, `foo-bar`, `time` on Harlowe | throw with a clear error message naming the rejection cause |
| Variable `value` | `string \| number \| boolean` | `[]`, `{}`, `null` on `declare_variable` | throw with a clear error message |
| Duplicate `declare_variable` | only when name doesn't already exist | second declare with same name | clarification `replace_initial \| leave_as_is \| cancel` (FR-011) |
| `set_variable` on missing passage | passage exists in active story | typo'd passage name | clarification listing existing passages (parity with `link_passages`) |
| `insert_variable_reader` without declare | name already in registry | reader for never-declared name | clarification `declare_now \| cancel` (FR-006) |
| Dirty story + `delete_variable` | `discard_unsaved: true` OR clean story | dirty story without override | clarification `save_first \| discard_unsaved \| cancel` (FR-013) |
| Variable values on Chapbook booleans | `true \| false` | `yes \| no` if passed in via the tool | accepted; emitted as `true \| false` per spec clarification Q4 |
