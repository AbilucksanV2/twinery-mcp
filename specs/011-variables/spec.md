# Feature Specification: Variable management tools

**Feature Branch**: `011-variables`
**Created**: 2026-05-15
**Status**: Draft
**Input**: F-VARIABLES under epic E07 Stateful authoring. Surfaced 2026-05-14 during the cartographers-apprentice authoring session — the LLM authored a 17-passage Harlowe story with zero macros (purely static `[[...]]` branching) because no tool existed to introduce state.

## Clarifications

### Session 2026-05-15

- Q: `list_variables` discovery on loaded stories with raw setter syntax already in passage text → A: `load_story` scans every loaded passage once, extracts setters per the active format's grammar, and populates the in-memory registry. `list_variables` always reads from the registry. The registry is the single source of truth post-load; parsing happens once at load time, not on every list call.
- Q: Variable name case sensitivity → A: Case-sensitive across the registry and the emitter. `playerName` and `playername` are two distinct variables. Matches Harlowe / SugarCube / Snowman runtime semantics, so the registry stays in lockstep with what the format actually does at play time. No special handling for case-variants; an LLM typo that creates a near-duplicate is caught the moment `read_variable` returns "not declared".
- Q: `insert_variable_reader` placement when the passage ends with one or more `[[...]]` link blocks → A: Detect trailing-link blocks per the active format's link grammar and insert the reader immediately before the first one. The reader lands at the tail of the prose region, before the choice list — preserves the "links cap the passage" convention every existing fixture and tester-authored story follows. An explicit numeric offset overrides this auto-placement.
- Q: Value-type emission per format for numbers and booleans (especially Chapbook's documented `yes`/`no` sugar) → A: Accept `string | number | boolean` uniformly. Numbers emit unquoted as their JavaScript string form (`42`, `3.14`). Booleans emit as `true` / `false` literals in every format including Chapbook (Chapbook accepts JS-style booleans everywhere even though docs reference `yes`/`no` as sugar). Floats supported. Strings quoted per FR-009. One canonical form per format keeps the emitter simple and the round-trip stable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Declare and read a variable in one passage (Priority: P1) 🎯 MVP

A maintainer (via their LLM) is authoring a Twine story and wants the
opening passage to set a variable — for example, `playerName` defaulting
to "the stranger" — and have a later passage greet the player by that
name without the LLM hand-writing format-specific macro syntax.

**Why this priority**: This is the smallest end-to-end loop that proves
the feature. If the LLM can declare a variable, set its initial value,
insert a reader expression in another passage, save, and have the
played HTML show the substituted value, every other variable workflow
is a composition of those primitives.

**Independent Test**: From a fresh active story in any of the four
formats, call `declare_variable({ name: "playerName", initial: "the stranger" })`,
then `insert_variable_reader({ passage_name: "Greeting", name: "playerName" })`,
then `save_story()`, open the produced HTML in the Twine 2 editor, and
play it. The Greeting passage must render "the stranger" (or whatever
the variable was set to most recently). Verifiable in all four formats
without writing macro text by hand.

**Acceptance Scenarios**:

1. **Given** an active Harlowe story with a Start passage, **When** the
   LLM declares `playerName = "the stranger"` and inserts a reader in a
   Greeting passage, **Then** `save_story` writes a `.twee` whose Start
   passage contains the format-correct setter `(set: $playerName to "the stranger")`
   and whose Greeting passage contains the format-correct reader `$playerName`.
2. **Given** an active SugarCube story, **When** the same declare +
   insert sequence runs, **Then** the resulting `.twee` contains
   `<<set $playerName to "the stranger">>` and `<<= $playerName>>`.
3. **Given** an active Chapbook story, **When** the same sequence
   runs, **Then** the resulting `.twee` adds the variable to the Start
   passage's vars section (`playerName: 'the stranger'` followed by
   `--`) and the Greeting passage contains the reader `{playerName}`.
4. **Given** an active Snowman story, **When** the same sequence runs,
   **Then** the resulting `.twee` contains `<% s.playerName = 'the stranger' %>`
   and `<%= s.playerName %>`.
5. **Given** any of the four formats above and the produced `.html` is
   opened in the Twine 2 editor and played, **When** the player reaches
   the Greeting passage, **Then** the page renders the literal text
   "the stranger" (no raw macro syntax, no missing-variable fallback).

---

### User Story 2 — Update a variable mid-story (Priority: P1)

The same maintainer wants a passage to change the variable's value as a
side effect of the player visiting it — for example, on entering a
"Decide your name" passage, the variable updates to whatever the
player chose.

**Why this priority**: A variable that can only be initialised at the
start is barely state. The defining feature of state is that it changes
during play. This story is what lets US3 (conditional links) actually
behave conditionally.

**Independent Test**: From a story that already has a declared
variable, call `set_variable({ passage_name: "DecideName", name: "playerName", value: "Mira" })`.
Save, replay through Decide-then-Greeting, assert Greeting renders
"Mira". In all four formats.

**Acceptance Scenarios**:

1. **Given** a Harlowe story with `playerName` declared, **When**
   `set_variable` adds a setter to passage "DecideName" with value
   `"Mira"`, **Then** `save_story` writes a passage that contains
   `(set: $playerName to "Mira")`.
2. **Given** any format, **When** the same `set_variable` is called
   twice on the same passage for the same variable name with different
   values, **Then** the server replaces the existing setter rather
   than emitting two setters in sequence (idempotent in passage scope).
3. **Given** any format, **When** the player plays through Decide →
   Greeting in the produced HTML, **Then** Greeting renders the value
   that Decide set.

---

### User Story 3 — Inspect declared variables (Priority: P2)

The maintainer (or the LLM mid-session) needs to know which variables
already exist before declaring a new one — to avoid name collisions and
to remember what the story already tracks.

**Why this priority**: Without this, the LLM must guess or re-declare,
producing redundant setters and silent name collisions. Read surfaces
are cheap to build and high-value for multi-pass authoring.

**Independent Test**: Declare three variables across two passages,
call `list_variables()`, assert the response includes all three with
their initial values and the passages they're set in.

**Acceptance Scenarios**:

1. **Given** three variables declared in any format, **When** the LLM
   calls `list_variables`, **Then** the response lists each variable's
   name, initial value, current declared default (for the read-only
   convenience case), and the passages that contain setters for it.
2. **Given** a variable that has never been declared, **When** the LLM
   calls `read_variable({ name: "ghost" })`, **Then** the response is
   a clear "not declared" error (not a clarification — the LLM can
   recover with a declare call).

---

### User Story 4 — Remove a variable (Priority: P3)

During iteration, the maintainer wants to remove a variable they
introduced earlier — strip every setter and every reader expression
from the story so it can be re-declared with a different name or
dropped entirely.

**Why this priority**: Iteration parity with the rest of the tool
surface (`delete_passage` exists; `delete_variable` is the equivalent
in state-space). Lower priority because the alternative — renaming the
variable in one place and letting the unused name die in the story
text — is acceptable for v1.

**Independent Test**: Declare a variable, insert readers in two
passages, set it in a third. Call `delete_variable({ name: "playerName" })`.
Save. Assert the resulting `.twee` contains no setter and no reader
for `playerName`.

**Acceptance Scenarios**:

1. **Given** a variable with setters and readers across the story,
   **When** the LLM calls `delete_variable`, **Then** every setter
   block and every reader expression for that name is removed atomically
   (graph-integrity-first: no half-deleted state).
2. **Given** a variable with setters and readers, **When** the LLM
   calls `delete_variable` and the story is dirty, **Then** the server
   does NOT clobber dirty changes silently — same dirty-guard contract
   as `load_story` / `create_story` (clarification with
   `save_first | discard_unsaved | cancel`).

---

### Edge Cases

- **Reserved names per format**: Some formats reserve variable names
  (Harlowe's `$time`, SugarCube's setup object, Snowman's window). The
  tool MUST refuse to declare a variable whose name collides with the
  active format's reserved set; the clarification offers a non-colliding
  rename suggestion.
- **Name shape**: Variable names must match `^[A-Za-z_][A-Za-z0-9_]*$`
  across all formats. Names with dollar signs, brackets, or whitespace
  are rejected at the tool boundary so the LLM never embeds a malformed
  reader expression.
- **Duplicate declare**: `declare_variable` called twice with the same
  name surfaces a clarification (`replace_initial | leave_as_is | cancel`)
  rather than silently overwriting — matches the
  `add_image_placeholder` duplicate-label pattern.
- **Reader-without-declare**: `insert_variable_reader` for a name that
  was never declared surfaces a clarification offering to declare it
  with an initial value or cancel.
- **Setter-on-missing-passage**: `set_variable` for a passage name
  that doesn't exist surfaces the same name-with-suggestions
  clarification that `link_passages` and `get_passage` already produce.
- **Format-switch with variables**: If the user calls `create_story`
  with a different format while variables exist on the dirty active
  story, the existing dirty guard fires; once they confirm
  `discard_unsaved`, the new story starts with an empty variable set
  (the variables don't carry across formats — different syntax, no
  translation in v1).
- **Round-trip through Twine editor**: A story containing format-aware
  setters and readers, opened in the Twine 2 editor and re-published,
  must play identically — no setter or reader is escaped, mangled, or
  dropped by the round trip.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a `declare_variable` MCP tool that
  takes a name and an optional initial value (string by default,
  numeric or boolean accepted) and emits a format-correct setter into
  the active story's start passage. If no start passage exists yet,
  the tool surfaces a clarification asking for one (or asks
  `set_start_passage` to be called first).
- **FR-002**: System MUST expose a `set_variable` MCP tool that adds
  or replaces a setter expression for a named variable in a named
  passage. The tool MUST be idempotent within a passage (a second call
  for the same name in the same passage replaces, not duplicates).
- **FR-003**: System MUST expose a `read_variable` MCP tool that
  returns a named variable's last declared / set value (read-only,
  no side effects). Returns a clear "not declared" error if the name
  has never been declared in the active story.
- **FR-004**: System MUST expose a `list_variables` MCP tool that
  returns every declared variable with: name, initial value, list of
  passages containing setters, list of passages containing readers.
  `list_variables` reads exclusively from the in-memory registry; it
  does not re-parse passage text on each call.
- **FR-004a**: `load_story` MUST scan every loaded passage's text once
  during load, extract every setter expression per the active format's
  grammar (Harlowe `(set: $X to V)`, SugarCube `<<set $X to V>>`,
  Chapbook vars-section `X: V`, Snowman `<% s.X = V %>`), and populate
  the registry with the extracted variables before returning. This
  keeps the registry authoritative after load so `list_variables` and
  the rest of the variable tool surface see variables that were
  authored outside this server.
- **FR-005**: System MUST expose a `delete_variable` MCP tool that
  removes every setter block and every reader expression for the
  named variable from the story atomically. Honors the dirty guard
  per FR-013 below.
- **FR-006**: System MUST expose an `insert_variable_reader` MCP tool
  that inserts a format-correct reader expression for a named variable
  into a named passage's text. Default placement: insert immediately
  before the first trailing `[[...]]` link block in the passage, so
  the reader ends up at the tail of the prose region and the choice
  list stays at the end of the passage as authors expect. If the
  passage has no trailing link block, the reader is appended. An
  optional explicit numeric `offset` argument overrides the
  auto-placement. The tool MUST refuse to insert a reader for a name
  that hasn't been declared, surfacing a clarification
  (`declare_now | cancel`).
- **FR-007**: System MUST emit format-correct setter syntax per the
  active story's declared format:
  - Harlowe: `(set: $name to value)` on its own line.
  - SugarCube: `<<set $name to value>>` on its own line.
  - Chapbook: append `name: value` to the passage's vars section,
    creating one (with the trailing `--`) if it doesn't yet exist.
  - Snowman: `<% s.name = value %>` on its own line.
- **FR-008**: System MUST emit format-correct reader syntax per the
  active story's declared format:
  - Harlowe: `$name`.
  - SugarCube: `<<= $name>>`.
  - Chapbook: `{name}`.
  - Snowman: `<%= s.name %>`.
- **FR-009**: System MUST quote and emit values per declared type and
  format:
  - **Strings** — quoted per format: Harlowe and SugarCube use double
    quotes; Chapbook uses single quotes per the format's vars-section
    convention; Snowman uses single quotes (the JS context is
    `s.name = ...`). The tool boundary handles all escaping so the
    LLM passes raw strings.
  - **Numbers** (int or float) — emitted unquoted as their JavaScript
    string form (`42`, `3.14`, `-1`). Identical across all four formats.
  - **Booleans** — emitted as `true` / `false` literals in every format
    including Chapbook. Chapbook accepts the JS-style literal even
    though its documentation cites `yes` / `no` as sugar — one
    canonical form per format keeps the round-trip stable.
- **FR-010**: System MUST validate variable names at the tool
  boundary against `^[A-Za-z_][A-Za-z0-9_]*$` and reject names with
  format-reserved prefixes / shapes. Rejection is a clear error
  (not a clarification — the LLM can rename and retry). Names are
  case-sensitive across the registry and the emitter: `playerName`
  and `playername` are two distinct variables — matches the
  case-sensitivity of Harlowe / SugarCube / Snowman at play time.
- **FR-011**: System MUST reject duplicate `declare_variable` calls
  for the same name with a clarification offering
  `replace_initial | leave_as_is | cancel` — matches the existing
  `add_image_placeholder` duplicate-label pattern.
- **FR-012**: System MUST round-trip variables cleanly through
  `save_story` → on-disk `.twee` → `load_story`. The reloaded story
  must report the same variables via `list_variables`.
- **FR-013**: System MUST honour the dirty-flag guard on
  `delete_variable` (it mutates the story; calling on a dirty story
  surfaces `save_first | discard_unsaved | cancel`). `declare_variable`,
  `set_variable`, and `insert_variable_reader` ALSO mutate the story
  and MUST flip the active-story dirty flag like every other mutation
  tool.
- **FR-014**: System MUST ensure the four-format smoke fixture suite
  (`npm run fixtures`) keeps passing after this feature lands.
  Variables can be exercised in a follow-up fixture revision but the
  existing static-branching fixtures MUST continue to round-trip.
- **FR-015**: System MUST update `docs/GUIDE.md` (via the existing
  registry-to-guide pipeline) to document every new tool's contract,
  the format-syntax mapping table, and the clarification protocols.
  CI's guide-drift gate (`scripts/check-guide-drift.mjs`) enforces
  this on every PR.

### Key Entities

- **DeclaredVariable**: A named cell of story-level state. Carries
  `name` (validated against the name regex), `initialValue` (string |
  number | boolean), `declaredAt` (the passage that holds the
  declaring setter — usually Start). Owned by the active story; lives
  next to the story's existing `imagePlaceholders` collection on the
  state singleton.
- **VariableReader**: A reader expression embedded in a passage's
  text. Carries the variable name and the position (offset) at which
  it was inserted. Recorded for `list_variables` and used by
  `delete_variable` to find every site to strip.
- **VariableSetter**: A setter expression in a passage's text.
  Carries name, value, format-rendered block, and the position. Used
  for idempotency on `set_variable` and for deletion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An LLM authoring a Harlowe story can introduce one
  branching decision gated by a variable (e.g. has-key) in **under 5
  tool calls** end-to-end: `declare_variable` + `set_variable` on the
  pickup passage + a reader on the decision passage + `save_story`.
  (Today: not achievable with the existing tool surface at all — the
  LLM must hand-write macro text.)
- **SC-002**: The four-format fixture suite extended to include one
  variable per format round-trips cleanly through Twee↔Twee,
  Twee↔HTML↔Twee, and Twee↔JSON↔Twee (12 round-trip checks total,
  same scaffolding as feature 008).
- **SC-003**: A real-length story (~20 passages) authored using
  variables for state plays correctly in the Twine 2 editor for at
  least Harlowe and SugarCube — no raw macro syntax visible on
  screen, no missing-value fallbacks during the canonical path.
- **SC-004**: Zero new runtime dependencies (constitution principle V
  — extwee already parses / emits the macro syntax for every supported
  format; we only emit, not interpret).
- **SC-005**: `npm run smoke` (the existing 24-section + fixtures +
  CLI battery) keeps passing with zero new ignored sections.

## Assumptions

- The active-story singleton model from v0.4 stays — variables live
  in-process for the life of the server, persisted only via
  `save_story` / restored via `load_story`. Multi-story workspace is
  still `F-T3-MULTI`, out of scope.
- Type system stays simple: `string | number | boolean`. Numbers
  cover both integers and floats. Booleans always emit as `true` /
  `false` per FR-009. No arrays, no objects, no expressions.
  Composite state is the inventory feature (`F-INVENTORY`) and will
  be built on top of these primitives.
- Reader insertion is link-aware by default: the tool detects the
  first trailing `[[...]]` link block and inserts the reader
  immediately before it (so the choice list stays at the tail of the
  passage). If the passage has no trailing links, the reader is
  appended. The LLM can pass an explicit offset to override. We do
  not try to be clever about prose-aware placement beyond the
  trailing-link rule (e.g. no "insert after the second sentence").
- The Twine 2 editor and the four format runtimes (Harlowe 3.x,
  SugarCube 2.x, Chapbook 2.x, Snowman 2.x) are the reference
  consumers; we emit syntax that those runtimes accept verbatim. If
  any of them changes its variable surface in a future version, we
  pin to the current major and document the version in the format
  registry.
- The dirty-guard clarification pattern from feature 010 is the
  contract we extend. Any tool that mutates the story honours it.
- The clarification UX pattern is unchanged — clients without MCP
  elicitation fall back to `respond_to_clarification` (F-ELICIT is a
  separate feature).
