# Research: Variable management tools

**Feature**: 011-variables
**Date**: 2026-05-15

Six micro-decisions worth recording. None are `NEEDS CLARIFICATION`
(the spec resolved all four ambiguities in the 2026-05-15 clarify
session); they're documented here so the implementation has a single
referent.

## R1 — extwee handles setter / reader syntax as opaque passage text

**Decision**: Treat every setter and reader as part of the passage's
`text` field. No extwee API extension is required.

**Rationale**: `extwee`'s `Passage` class stores `text` as a plain
string. `parseTwee` reads the body after `:: PassageName` into that
field verbatim; `toTwee` writes it back verbatim. `parseTwine2HTML` /
`toTwine2HTML` round-trip the same string through the
`<tw-passagedata>` element. `parseJSON` / `toJSON` round-trip it
through the `text` JSON property. F-FIXTURES already proves this
round-trip across all four formats — adding setter / reader content
to passage text is therefore free.

**Alternatives considered**:
- *Track variables in a separate sidecar structure inside the story*:
  rejected — would not round-trip through `save_story` cleanly,
  because the Twine 2 editor doesn't read sidecar metadata. The
  setter / reader expressions MUST live in passage text for the
  format runtime to see them at play time.
- *Re-emit setters from the registry on every `save_story`*: rejected
  — leads to duplicate setters when the user runs `save_story` more
  than once. The registry mirrors what's in the text; it never
  competes with the text as the source of truth.

## R2 — Format-specific emit / extract grammars

**Decision**: One module `src/twine/variables.ts` exposes two
functions per format — `emit{Format}Setter` and `extract{Format}Setters`
— plus paired `emit{Format}Reader` / `extract{Format}Readers`. Eight
functions total, exported behind a dispatcher that selects on the
active story's declared format.

**Rationale**: Co-locating the per-format vocabulary in one file
makes principle I (spec-faithful format fidelity) auditable in one
place. The same pattern already works for `src/twine/formats.ts` (link
syntax).

**Format syntax matrix**:

| Format    | Setter (string)                              | Setter (number / boolean) | Reader        |
|-----------|----------------------------------------------|---------------------------|---------------|
| Harlowe   | `(set: $name to "value")`                    | `(set: $name to 42)` / `(set: $name to true)` | `$name`       |
| SugarCube | `<<set $name to "value">>`                   | `<<set $name to 42>>` / `<<set $name to true>>` | `<<= $name>>` |
| Chapbook  | `name: 'value'` in vars section (above `--`) | `name: 42` / `name: true` (vars section) | `{name}`      |
| Snowman   | `<% s.name = 'value' %>`                     | `<% s.name = 42 %>` / `<% s.name = true %>` | `<%= s.name %>` |

**Edge case — Chapbook vars section**: Unique among the four
formats. A passage that uses Chapbook variables has the structure:

```
:: Start
name1: value1
name2: value2
--
Prose goes here.
[[link->target]]
```

The `--` is a literal separator. Emit logic: if the passage has no
`--`, prepend `name: value\n--\n` before existing prose. If it has one,
append `name: value\n` to the section above the separator. Extract
logic: split on the first standalone `--` line; parse the upper half
as `name: value` lines.

**Alternatives considered**:
- *One generic grammar table loaded at runtime*: rejected — the four
  formats are different enough that table-driven code is harder to
  read than four explicit functions per direction.
- *Use extwee's format-aware passage-text helpers (if any)*: rejected
  — extwee does not expose per-format text helpers; passage text is
  always opaque.

## R3 — Trailing-link detection for reader auto-placement

**Decision**: `insert_variable_reader` (when no explicit `offset` is
passed) uses a per-format regex to find the position immediately
before the first trailing `[[...]]` link block, walking backwards from
the end of the passage text past any whitespace / blank lines.

**Rationale**: The clarify session settled on link-aware insertion
(spec §FR-006). The "links cap the passage" convention is enforced by
every fixture and every tester-authored story so far. Finding the
boundary is a one-regex job that uses the same link grammar already
consolidated in `src/graph/links.ts` (specifically `allEdges` / the
underlying `[[...]]` matcher).

**Regex shape** (per format, simplified):
- Harlowe / Chapbook: `/(?:\s*\[\[[^\]]+(?:->[^\]]+)?\]\]\s*)+\s*$/m` — runs of
  arrow-style `[[text->target]]` (or `[[target]]`) blocks at end of text.
- SugarCube / Snowman: similar but with pipe-style `[[text|target]]`
  also accepted (per `src/twine/formats.ts` `linkSyntaxFor`).

If the passage has no trailing link block, the reader is appended (no
match → insert at `text.length`).

**Alternatives considered**:
- *Always append*: rejected — the original A choice in clarify Q3.
  Risks orphaning the reader after the choice list.
- *Always require an explicit offset*: rejected — the original C
  choice in clarify Q3. Boilerplate cost outweighs the safety win.

## R4 — Reserved variable names per format

**Decision**: Maintain a per-format `RESERVED_NAMES` set in
`src/twine/variables.ts`. Tools reject declaration of any name in
the active format's reserved set with a clear error message naming
the conflicting symbol.

**Rationale**: Each format runtime reserves certain names (Harlowe's
`time`, `momentTimeline`; SugarCube's `setup` and the State object
shapes; Snowman's `window`-attached symbols). Declaring a variable
with one of those names produces silent runtime failure at play time
— hard to diagnose. A boundary-time rejection with the colliding name
gives the LLM enough signal to rename and retry without burning round
trips.

**v1 reserved sets** (intentionally conservative; expand on report):
- Harlowe: `time`
- SugarCube: `setup`, `settings`, `prehistory`
- Chapbook: (none documented as global reserved; passage-level names
  are locally scoped per Chapbook's docs)
- Snowman: `s` (the state object itself), `window`, `document`

**Alternatives considered**:
- *No validation; let the format runtime fail*: rejected — surface
  the bug at author time, not play time.
- *Maintain a comprehensive reserved set per format*: rejected for
  v1; conservative now, expand reactively when real conflicts surface.

## R5 — Variable registry shape on `ActiveStory`

**Decision**: Add a single `variables` array on `ActiveStory` next to
`imagePlaceholders`. Each entry: `{ name, type, initialValue,
setters: SetterRecord[], readers: ReaderRecord[] }`. See
[`data-model.md`](./data-model.md) for the full shape.

**Rationale**: Single-array-per-story matches the
`imagePlaceholders` shape and lives in the same state singleton, so
the dirty-flag plumbing extends naturally. The setters / readers
sub-arrays cache position info for fast `set_variable` idempotency
and `delete_variable` strip operations.

**Alternatives considered**:
- *Map by name*: rejected — `list_variables` returns an ordered list;
  using a map and re-deriving order on each list call is more code
  for less benefit.
- *Per-passage variable tracking*: rejected — most lookups are by
  variable name, not by passage. Reverse-index when needed.

## R6 — Extraction-on-load grammar

**Decision**: `load_story` calls `extract{Format}Setters` /
`extract{Format}Readers` for every passage after parsing the `.twee`
into `extwee.Story`. For each setter found, record it in the
registry; for each reader, record the (variable name, passage name,
offset) tuple.

**Rationale**: The clarify Q1 outcome (option C) makes load_story
authoritative for registry population. Without extraction on load,
`list_variables` would return empty for any story that was authored
before this feature existed — a confusing experience.

**Edge cases**:
- A `.twee` declares `(set: $name to ...)` in three different
  passages with different initial values. Extract: registry gets ONE
  variable record with THREE setter records. `initialValue` is set
  from the setter in the Start passage if present; otherwise from
  the first setter encountered.
- A reader appears for a variable that has no setter anywhere.
  Registry entry created with `initialValue: null`, `setters: []`,
  `readers: [...]`. Treated as "loaded but uninitialised" — `read_variable`
  returns the registry entry (with a `loaded_without_setter: true`
  hint) rather than a "not declared" error, because the user
  clearly intended it.
- Same variable name appears across formats inside the same `.twee`.
  Impossible — `.twee` declares one format; extraction uses that one
  format's grammar.

**Alternatives considered**:
- *Lazy extraction (parse on first `list_variables` call)*: rejected
  — adds latency to the read tool and creates surprising "first call
  is slow" behaviour. Up-front cost during load is one-time and
  matches `validate_story`'s pattern.

## R7 — Interaction with existing tools (rename_passage / delete_passage)

**Decision**:
- `rename_passage` requires no change. Setters reference variables,
  not passages; renaming a passage doesn't disturb setter / reader
  text inside that passage's body. (The passage's *name* changes;
  the *text* doesn't.)
- `delete_passage` MUST update the registry — for every variable that
  has a setter or reader in the deleted passage, remove the
  corresponding `SetterRecord` / `ReaderRecord` entry. If removing
  setters leaves a variable with zero setters AND zero readers
  globally, also remove the variable from the registry. This matches
  the constitution's graph-integrity-first principle applied to
  variable state.

**Rationale**: Variables track WHERE they're used. The registry must
stay in sync when storage relocates or vanishes. Same invariant
`rename_passage` already enforces for `[[...]]` links.

**Alternatives considered**:
- *Leave the registry stale; reconcile on next save_story*: rejected
  — `list_variables` would lie about setter / reader counts until the
  next save call.

## R8 — Logic authoring across the four formats (forward-looking)

**Compiled 2026-06-29** from the official format docs (SugarCube, Harlowe,
Chapbook, Snowman) and the IFTF Twine Cookbook, plus community sources. This
section is forward-looking: variables (this feature) are the foundation, but
the *logic* features that build on them (computed updates, conditionals,
widgets/popups, init-passage placement, the logic guide) need a single shared
reference. It is the spec input for the E07 backlog rows F-VAR-MATH,
F-CONDITIONALS, F-WIDGETS, F-VAR-INIT, F-LOGIC-GUIDE, F-STATBLOCK.

**Central constraint:** in Twine, logic lives *inside passage text* as
format-specific markup — there is no separate logic editor. The *concept* (a
stat, a gated choice, a clock) is format-agnostic; the *syntax* is not. So the
MCP must **teach the active format's dialect** — a model that averages across
the four dialects it saw in training emits mixed, broken markup. That
mixed-dialect output is the single highest-probability failure mode (confirmed
across all five research streams).

### R8.1 — Cross-format capability matrix

| Capability | SugarCube | Harlowe | Chapbook | Snowman |
|---|---|---|---|---|
| **Variable sigil** | `$story`, `_temp` | `$story`, `_temp` | bare `name` | `s.name` (prop on `window.story.state`) |
| **Set (literal)** | `<<set $x to 5>>` | `(set: $x to 5)` | `x: 5` (above `--`) | `<% s.x = 5 %>` |
| **Set (computed)** | `<<set $cash to $cash + 100>>` / `+=` / `++` | `(set: $cash to it + 100)` / `+=` | `cash: cash + 100` (eval once) | `<% s.cash = s.cash + 100 %>` |
| **Print inline** | `$x` · `<<= $x>>` / `<<print>>` | `$x` · `(print: $x)` | `{x}` (no exprs) | `<%= s.x %>` |
| **If / else** | `<<if>>``<<elseif>>``<<else>>``<</if>>` | `(if:)[…](else-if:)[…](else:)[…]` (hooks) | `[if c]``[else]``[continue]` (modifiers) | `<% if(){ %>…<% }else{ %>…<% } %>` |
| **Operators** | `is`/`isnot`/`gt`/`gte`/`lt`/`lte`/`and`/`or`/`not` (or JS) | `is`/`is not`/`>`/`>=`/`and`/`or`/`not`/`contains` (words) | JS `===`/`>=`/`&&`/`!` inside `[if]` | JS `===`/`>=`/`&&`/`!` |
| **Gated link** | `<<if c>>[[T->P]]<</if>>` | `(if: c)[[[T->P]]]` | `[if c]`⏎`[[T->P]]` | `<% if(c){ %>[[T->P]]<% } %>` |
| **Set on link click** | `[[T->P][$x to 5]]` · `<<link>>`+`<<set>>` | `(link-reveal-goto:"t","P")[(set:…)]` | **none** — set in target's vars section | top of target · jQuery on `a[data-passage]` |
| **Reusable logic** | `<<widget>>` (passage tagged `widget`) | `(macro:)` (3.2+) / `(display:)` | custom JS inserts/modifiers · `[JavaScript]` | JS fns on `window.setup` (Story JS) |
| **Popup / dialog** | `<<dialog>>`+`Dialog` API (core) · `<<notify>>` toast (**3rd-party**) | `(dialog:)` (3.1+) / `(alert:)` | **none** native | **none** native |
| **Init-once passage** | `StoryInit` (special name) | passage tagged `startup` | once-only vars section | `[script]` UserScript / Story JS |
| **Per-move hook** | `PassageReady`/`PassageHeader`/`PassageFooter` | tags `header`/`footer` | header/footer passage | `[script]` + history events |
| **Sidebar stat display** | `StoryCaption` | `header`/`footer` passage | header/footer passage | DOM injection |

### R8.2 — Per-format gotchas the MCP must encode

- **Harlowe** — `(if:)`/`(link:)` are *changers* that must be **immediately
  followed by a hook `[ … ]`** (no operator); **word operators** (`is`, `and`,
  not `==`/`&&`); gated link nests three brackets `(if: c)[[[T->P]]]`; vars
  default to `0`; **no `StoryInit`** (use a `startup`-tagged passage); relative
  set uses the `it` keyword; reuse is `(macro:)`/`(display:)`, never widgets.
- **SugarCube** — `$` persists/saves, `_` is wiped each render; init in
  **`StoryInit`**; set with `to`, compare with `is`/`gt`/…; every `<<if>>`/
  `<<link>>`/`<<widget>>` needs its closing tag (**validate balance**);
  setter-link `[[T|P][$x to 5]]` runs on click before nav; reuse = `<<widget>>`
  in a `widget`-tagged passage; `<<dialog>>`+`Dialog` API are core but
  **`<<notify>>` is a third-party (Chapel) macro** — never emit without the dep;
  mid-passage `<<set>>` needs `<<replace "#id">>` to repaint.
- **Chapbook** — state in the **vars section above `--`** (bare names, no `$`),
  evaluated once top-to-bottom, no inserts/modifiers allowed there; display with
  `{name}`; conditionals are **line modifiers** `[if]`/`[else]`/`[continue]`
  (no nesting, no `else if`); **no setter-link** (set in the destination's vars
  section, using `passage.from`); **no native popup**; guard run-once init with
  `passage.visits`.
- **Snowman** — raw JS `<% %>`/`<%= %>`/`<%- %>`; all state on
  `window.story.state`, `s` aliased **only inside template tags** (not in Story
  JS); conditionals are literal JS braces split across tags (mind the closing
  `<% } %>`); links render to `<a data-passage>` — **no setter-link** (set atop
  the target or bind jQuery); reuse = plain fns on `window.setup`; **no UI
  helpers**; init must be idempotent (`if (s.x === undefined)`).

### R8.3 — Format-agnostic patterns (the recipes)

Each is one logic *shape*; the format selects the dialect (R8.1). These map 1:1
to Twine Cookbook recipes.

1. **Stat system** — declare+init once in the init passage; mutate on actions
   via compound assignment on a link/button; **clamp** at min/max; display in
   **one central place** (`StoryCaption`/header), never per-passage.
2. **Day / time-period clock** — `day` + within-day index; advance on
   "spend time" actions; roll over with modulo (`period = t % 4`,
   `day = floor(t/4)+1`). Prefer the **manual counter** form; SugarCube's
   `State.turns` clock ticks on *every* click (usually unwanted in a life-sim).
3. **Inventory** — array of item names: add with `push`/`+`, test with
   `includes`/`contains`, gate links on ownership.
4. **Triggered event** — (a) a **header/footer passage** checks state every load
   and fires ambient events centrally; (b) **in-passage** `if` blocks for
   location/moment-specific events. Authors mix both.
5. **Stat-change popup** — **mutate + notify in one idempotent unit** so they
   can't drift and changes don't double-apply on re-render (SugarCube
   `<<statChange>>`/widget with a unique id; Harlowe `(set:)`+`(replace:)` or
   `(dialog:)`; Chapbook/Snowman DIY). Default to clamping.

### R8.4 — Top gotchas an LLM author will hit

1. Mixing dialects *(headline risk)*. 2. Forgetting to initialize. 3. Assignment
vs comparison (`to`/`is`; `=` vs `===`). 4. Mid-passage `set` not repainting
text/sidebar. 5. Temp vs story variable persistence. 6. Setter-link misuse.
7. Double-applied stat changes on revisit/re-render. 8. Real-world clock vs
in-game clock. 9. Chapbook vars-section re-runs every visit. 10. Exact
tag/name spelling (`StoryInit`, `startup`, `header`, `widget`).

### R8.5 — MCP design implications (→ E07 backlog)

1. **Format bound to every emitted snippet**; docstrings carry the R8.1 matrix. → *F-LOGIC-GUIDE*
2. **Init in the format's init passage as a guarantee** — today `declare_variable`
   writes into Start; idiomatic is `StoryInit`/`startup`/vars-section/UserScript. → *F-VAR-INIT*
3. **Variable manifest** (type, default, where shown, where mutated) extending
   `ActiveStory.variables` to catch used-before-init / mutated-but-never-shown. → *F-VAR-INIT*
4. **Computed/relative updates** (`$cash + 100`, `it`/`+=`/`++`). → *F-VAR-MATH*
5. **Conditional rendering + gated choices** (hidden vs disabled; header/footer
   event dispatcher). → *F-CONDITIONALS*
6. **Mutation+notification as one tool** (`change_stat(name, delta, message?)`). → *F-WIDGETS + F-VAR-MATH*
7. **Central stat-display tool** (`StoryCaption`/header). → *F-STATBLOCK*
8. **Elicit the time model** (per-action vs per-nav) before generating a clock.
9. **`validate_story` lint** — balanced tags; no `=` in a conditional; no
   third-party macro without its dep; temp-var-expected-to-persist.
10. **Teach, don't just emit** — enrich docstrings + `twinery://guide` with the
    format-aware logic capability section. → *F-LOGIC-GUIDE*

### R8.6 — Sources

Official: SugarCube v2 docs (motoslave.net/sugarcube/2/docs); Harlowe 3 manual
(twine2.neocities.org); Chapbook guide (klembot.github.io/chapbook/guide);
Snowman 2 docs (videlais.github.io/snowman/2); Twine Cookbook
(github.com/iftechfoundation/twine-cookbook — playerstatistics,
conditionalstatements, arrays, turncounter, headersandfooters, modal in all
four formats). Community: subjunctivegames.com (smarter stat changes); Chapel's
custom-macros-for-sugarcube-2 (Dialog, `<<notify>>`, simple-inventory);
github.com/aronedwards91/twine-life-rpg (working SugarCube life-sim).
*Fetch note:* several `twinery.org/cookbook/*` pages 403 to automated fetches —
read recipe source from the `iftechfoundation/twine-cookbook` GitHub repo.
