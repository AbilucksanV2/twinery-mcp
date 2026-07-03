# Twinery MCP Server — Tool Guide

> This guide is auto-generated from `src/guide/registry.ts` and the zod schemas on each tool. If you're editing this file by hand, you're editing the wrong thing — change the tool and regenerate.

## What this server does

Every tool below is callable from any MCP-compliant client over stdio. The server holds one active story in memory at a time and writes it to disk on `save_story`. Parsing and emission of Twee / Twine 2 HTML go through [extwee](https://github.com/videlais/extwee); the server never hand-rolls Twine format code.

The tool surface is deliberately small and verb-shaped (think UnityMCP / GodotMCP patterns):

- **`create_story`** — Initialise the single active story.
- **`load_story`** — Load a .twee file from disk into the active story, replacing whatever was loaded before.
- **`current_story_info`** — Read-only probe of session state.
- **`create_passage`** — Add a passage to the active story.
- **`update_passage`** — Mutate text / tags / position / size on an existing passage.
- **`rename_passage`** — Rename a passage and rewrite every incoming link across the story atomically.
- **`delete_passage`** — Remove a passage.
- **`link_passages`** — Insert a [[...]] link from one passage to another using syntax appropriate to the story's declared format (arrow for Harlowe/Chapbook, pipe for SugarCube/Snowman).
- **`set_start_passage`** — Point the story's start_passage at an existing passage.
- **`list_passages`** — Return the list of passages with their tags and outgoing links.
- **`get_passage`** — Return a single passage in full — name, tags, position, size, text, and its outgoing links.
- **`validate_story`** — Run the full integrity sweep: broken links, orphan passages, duplicate names, IFID shape, and start-passage validity.
- **`add_image_placeholder`** — Insert an image placeholder in a passage and return the exact filename and folder path where the author must drop the image.
- **`declare_variable`** — Declare a story-level variable and emit a format-correct setter into the active story's Start passage.
- **`read_variable`** — Read-only probe — return the current declared / set value of a named variable plus how many setters and readers reference it.
- **`insert_variable_reader`** — Insert a format-correct reader expression for a declared variable into a passage.
- **`set_variable`** — Add or replace a setter for a declared variable inside a named passage.
- **`adjust_variable`** — Change a numeric variable by a relative amount inside a passage — e.g.
- **`insert_conditional`** — Insert a format-correct conditional block into a passage — content that renders only when a variable test passes (with an optional else branch).
- **`insert_conditional_link`** — Insert a link that only appears when a variable test passes — the state-gated choice pattern (e.g.
- **`set_stat_block`** — Create or replace a persistent stat display shown on every passage — the HUD/sidebar.
- **`add_widget`** — Define a reusable SugarCube widget in the `widget`-tagged Widgets passage, callable from any passage.
- **`add_item`** — Add an item to an inventory (an array-of-item-names variable) inside a passage — e.g.
- **`remove_item`** — Remove an item from an inventory array inside a passage — e.g.
- **`list_variables`** — Return every declared variable in the active story with its type, initial value, and the passages that set or read it.
- **`delete_variable`** — Atomically remove every setter and every reader for a named variable from the active story's passage text, then drop it from the registry.
- **`save_story`** — Persist the active story as <slug>.twee and <slug>.html into a directory, plus a sibling assets/<slug>/ drop zone.
- **`respond_to_clarification`** — Resolve a previously-returned clarification_needed payload by providing the author's answer.

## How the server handles missing info

**No silent defaults.** If a tool is called without enough information to proceed safely, the server returns a structured `clarification_needed` response:

```json
{
  "kind": "clarification_needed",
  "clarification": {
    "clarification_id": "<uuid>",
    "question": "Which Twine story format should this story use?",
    "valid_answers": ["Harlowe", "SugarCube", "Chapbook", "Snowman"],
    "free_text_allowed": false,
    "originating_tool": "create_story",
    "originating_args": { "name": "Locked Door" }
  }
}
```

Relay the `question` to the human, get their answer, then call `respond_to_clarification` with the same `clarification_id` and the selected `answer`. The server replays the original tool call with the answer merged in.

## Image placeholder convention

`add_image_placeholder` inserts a self-contained `<div><img>…</div>` block into the chosen passage and reports where the image file is expected on disk. The convention:

- **Folder**: `<saved-story-dir>/assets/<story-slug>/`
- **Filename**: `<author-label>.<ext>` where `<ext>` defaults to `png`. Allowed: `png`, `jpg`, `jpeg`, `gif`, `webp`.
- **Missing-file behaviour**: the compiled HTML shows a labeled dashed-border box instead of a broken-image icon. Nothing else to wire up — the fallback is inline CSS + an `onerror` hook.

Labels must be unique within the story. On collision, the server surfaces a clarification offering an auto-suffix; it will never silently rename.

## Authoring logic (variables & conditions)

**Logic in Twine lives inside passage text**, written as the active story format's own markup — there is no separate logic layer. The *concept* (a stat, a computed change, a gated choice) is the same across formats; the **syntax is not**. Always emit markup for the story's declared format — mixing dialects (e.g. Harlowe `(set:)` in a SugarCube story) is the most common way to produce a broken story.

**Variables have dedicated tools** — prefer them over hand-writing setters/readers:

- `declare_variable` — introduce a variable and its initial value.
- `set_variable` — set an absolute value in a passage (`expression: true` to emit a computed value unquoted).
- `adjust_variable` — change a numeric variable by a relative amount (e.g. `+100` cash); emits the format-correct relative setter.
- `insert_variable_reader` — show a variable's value in prose.
- `read_variable` / `list_variables` / `delete_variable` — inspect and remove.

**Conditionals, gated links, widgets, and inventories do not yet have dedicated tools** — author them as passage text (via `create_passage` / `update_passage`) using the matrix below. Emit exactly the row for the active format.

| Need | Harlowe | SugarCube | Chapbook | Snowman |
|---|---|---|---|---|
| Set (literal) | `(set: $x to 5)` | `<<set $x to 5>>` | `x: 5` (above `--`) | `<% s.x = 5 %>` |
| Set (computed) | `(set: $x to $x + 1)` | `<<set $x to $x + 1>>` | `x: x + 1` (above `--`) | `<% s.x = s.x + 1 %>` |
| Show value | `$x` | `<<= $x>>` | `{x}` | `<%= s.x %>` |
| If / else | `(if: $x > 1)[…](else:)[…]` | `<<if $x gt 1>>…<<else>>…<</if>>` | `[if x > 1]`…`[else]`…`[continue]` | `<% if (s.x > 1) { %>…<% } else { %>…<% } %>` |
| Gated link | `(if: $x > 1)[[[Go->T]]]` | `<<if $x gt 1>>[[Go->T]]<</if>>` | `[if x > 1]`⏎`[[Go->T]]` | `<% if (s.x > 1) { %>[[Go->T]]<% } %>` |
| Initialize once in | a passage tagged `startup` | the `StoryInit` passage | the Start passage's vars section | a `[script]` passage (`window.story.state.x = …`) |

**Format gotchas that break stories:**

- **Harlowe** — conditionals are *changers attached to a hook*: `(if: $x is 2)[shown]` (brackets required, no space-operator). Use **word operators** (`is`, `and`, `not`, `contains`), not `==`/`&&`. A gated link nests three brackets: `(if: c)[[[Text->Target]]]`.
- **SugarCube** — `$var` persists/saves, `_var` is temporary (wiped each render). Set with `to`, compare with `is`/`gt`/`lt`; never bare `=` in a condition. Every `<<if>>` needs `<</if>>`. `<<notify>>` toasts are a *third-party* macro — don't emit without the add-on.
- **Chapbook** — state goes in the **vars section above the `--` line** (bare names, no `$`); conditionals are line `[if]`/`[else]`/`[continue]` modifiers (no nesting, no `else if`). There is no setter-on-link — set state in the destination passage's vars section.
- **Snowman** — raw JavaScript in `<% %>` / `<%= %>`; state on `s.` (alias of `window.story.state`, available only inside template tags). Standard JS operators. No macros, no built-in dialog.

General: initialize every variable before it's read; keep a single central place to display current stats (SugarCube `StoryCaption`; other formats a `header`/`footer`-tagged passage); the in-game clock is a plain variable you advance, not the real-world clock.

## Tools

### `create_story`

Initialise the single active story. Asks for the story format if omitted (no silent defaults). Refuses if the active story has unsaved changes (pass discard_unsaved: true to override) — same dirty-guard contract as load_story so format-switching mid-session never silently clobbers work. Auto-generates a spec-valid IFID.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |
| `format` | enum(`Harlowe` \| `SugarCube` \| `Chapbook` \| `Snowman`) | no | — |
| `format_version` | string | no | — |
| `ifid` | string | no | — |
| `discard_unsaved` | boolean | no | — |

**Surfaces a clarification when:**

- active story has unsaved changes AND discard_unsaved is not set: ask save_first | discard_unsaved | cancel.
- format omitted: ask Harlowe | SugarCube | Chapbook | Snowman.

**Example**

*Start a Harlowe story*

```json
{
  "name": "Locked Door",
  "format": "Harlowe"
}
```

If you omit `format`, the server will surface a clarification instead of picking a default. If an unsaved active story is present, the server asks before clobbering it.

### `load_story`

Load a .twee file from disk into the active story, replacing whatever was loaded before. Refuses if the active story has unsaved changes (pass discard_unsaved: true to override). Runs validation on load and includes any issues in the response — load is non-blocking on validation problems so authors can load broken stories specifically to fix them.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `path` | string | yes | — |
| `discard_unsaved` | boolean | no | — |

**Surfaces a clarification when:**

- active story has unsaved changes AND discard_unsaved is not set: ask save_first | discard_unsaved | cancel.
- path ends in .html: ask cancel (only .twee is parsed in this version) — extract Twee and retry, or cancel.

**Example**

*Resume work on a saved story*

```json
{
  "path": "./stories/locked-door/locked-door.twee"
}
```

After load, current_story_info reports the loaded story's name, IFID, and dirty=false.

### `current_story_info`

Read-only probe of session state. Returns { active: false } when no story is loaded, or a record describing the active story (name, format, IFID, passage count, start, last-saved path/timestamp, dirty flag). Never mutates state, never emits a clarification.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|

**Example**

*Check what's loaded before doing anything*

```json
{}
```

Useful for the LLM to confirm it's working with the story the human expects.

### `create_passage`

Add a passage to the active story. Auto-positions when `position` is omitted. The first passage becomes the start unless told otherwise.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |
| `text` | string | no | — |
| `tags` | array<string> | no | — |
| `position` | object | no | — |
| `size` | object | no | — |
| `set_as_start` | boolean | no | — |

**Surfaces a clarification when:**

- duplicate name: ask suffix | replace | cancel (no silent rename).

**Example**

*Create the start passage*

```json
{
  "name": "Start",
  "text": "You stand before a locked door.",
  "set_as_start": true
}
```

### `update_passage`

Mutate text / tags / position / size on an existing passage. Does NOT rename (use rename_passage for that so link integrity is enforced). Pass only the fields you want to change.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |
| `text` | string | no | — |
| `tags` | array<string> | no | — |
| `position` | object | no | — |
| `size` | object | no | — |

**Surfaces a clarification when:**

- name does not exist: ask which passage was meant (valid answers = existing passage names).

**Example**

*Rewrite the Start passage's prose*

```json
{
  "name": "Start",
  "text": "You stand before a locked door, rusted shut with age."
}
```

Passing `tags` replaces the tag list; omit it to leave tags alone.

### `rename_passage`

Rename a passage and rewrite every incoming link across the story atomically. Updates the story's start passage if the renamed passage was the start. This is the flagship graph-integrity operation — never rewrite passage names by editing raw text.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `old_name` | string | yes | — |
| `new_name` | string | yes | — |

**Example**

*Rename and auto-rewrite all incoming links*

```json
{
  "old_name": "Pick Lock",
  "new_name": "Lockpick"
}
```

All [[...]] references to Pick Lock across every passage are rewritten atomically.

### `delete_passage`

Remove a passage. When other passages link to it or it's the story's start, the server asks how to resolve instead of silently dangling the graph. Also cleans up any image placeholders tracked for this passage.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |
| `handle_incoming_links` | enum(`ask` \| `remove_link_markup` \| `leave_dangling`) | no | — |

**Surfaces a clarification when:**

- name is the story's start_passage: ask which passage becomes the new start (valid answers = other existing passages).
- handle_incoming_links='ask' (default) AND incoming links exist: ask remove_link_markup | leave_dangling | cancel.
- name does not exist: ask which passage was meant (valid answers = existing passage names).

**Example**

*Delete an unused side passage and strip stale links*

```json
{
  "name": "Side Passage",
  "handle_incoming_links": "remove_link_markup"
}
```

### `link_passages`

Insert a [[...]] link from one passage to another using syntax appropriate to the story's declared format (arrow for Harlowe/Chapbook, pipe for SugarCube/Snowman). Refuses to silently create missing passages.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `from_passage` | string | yes | — |
| `to_passage` | string | yes | — |
| `display_text` | string | no | — |
| `insertion_index` | number | null | no | — |

**Surfaces a clarification when:**

- from_passage does not exist: ask which passage was meant.
- to_passage does not exist: ask create_empty | cancel (no silent creation).

**Example**

*Add a decision-point choice*

```json
{
  "from_passage": "Start",
  "to_passage": "Pick Lock",
  "display_text": "Try to pick it"
}
```

### `set_start_passage`

Point the story's start_passage at an existing passage. The first passage created is already the default start — use this when you want to change it explicitly.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |

**Surfaces a clarification when:**

- name does not exist: ask which passage was meant (valid answers = existing passage names).

**Example**

*Make 'Prologue' the start passage*

```json
{
  "name": "Prologue"
}
```

### `list_passages`

Return the list of passages with their tags and outgoing links. Read-only; never emits a clarification. Set `include_text: true` to also include each passage's full text.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `include_text` | boolean | no | — |

**Example**

*Get a graph overview*

```json
{
  "include_text": false
}
```

### `get_passage`

Return a single passage in full — name, tags, position, size, text, and its outgoing links. Read-only.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |

**Surfaces a clarification when:**

- name does not exist: ask which passage was meant (valid answers = existing passage names).

**Example**

*Read the Start passage verbatim*

```json
{
  "name": "Start"
}
```

### `validate_story`

Run the full integrity sweep: broken links, orphan passages, duplicate names, IFID shape, and start-passage validity. Read-only; never emits a clarification.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|

**Example**

*Audit the story before saving*

```json
{}
```

Returns an `ok: true` flag alongside per-category lists; if any list is non-empty, `ok` is false.

### `add_image_placeholder`

Insert an image placeholder in a passage and return the exact filename and folder path where the author must drop the image. Played HTML requests the image from that path; a labeled dashed-border fallback renders when the file is missing.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `passage_name` | string | yes | — |
| `label` | string | yes | Kebab-case identifier; becomes the filename stem. Unique within the story. |
| `extension` | enum(`png` \| `jpg` \| `jpeg` \| `gif` \| `webp`) | no | — |
| `insertion_index` | number | null | no | — |

**Surfaces a clarification when:**

- label collides with an existing placeholder: ask pick_new_label | confirm_auto_suffix | cancel (no silent rename).
- passage_name does not exist: ask create_empty | cancel.

**Example**

*Drop an illustration into the Forest passage*

```json
{
  "passage_name": "Forest",
  "label": "ancient-tree"
}
```

Server reports e.g. assets/<story-slug>/ancient-tree.png — drop a file there and the played HTML will load it automatically.

### `declare_variable`

Declare a story-level variable and emit a format-correct setter into the active story's Start passage. Omit `initial` to declare the name only (no setter). Rejects names reserved by the active format; asks how to resolve a name that's already declared.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |
| `initial` | union | null | no | — |

**Surfaces a clarification when:**

- name already declared: ask replace_initial | leave_as_is | cancel (no silent overwrite).
- initial provided but no Start passage exists: ask cancel (create a passage first, then retry).

**Example**

*Declare the player's name with an initial value*

```json
{
  "name": "playerName",
  "initial": "the stranger"
}
```

Emits e.g. (set: $playerName to "the stranger") into the Start passage for Harlowe.

### `read_variable`

Read-only probe — return the current declared / set value of a named variable plus how many setters and readers reference it. Returns a recoverable error (not a clarification) when the name isn't declared.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |

**Example**

*Check the current value and usage of playerName*

```json
{
  "name": "playerName"
}
```

### `insert_variable_reader`

Insert a format-correct reader expression for a declared variable into a passage. By default the reader lands immediately before the first trailing [[...]] link block so it renders inside the prose, not after the choices. Pass `offset` to place it at an exact character index.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `passage_name` | string | yes | — |
| `name` | string | yes | — |
| `offset` | number | no | — |

**Surfaces a clarification when:**

- variable not declared: ask declare_now | cancel.
- passage_name does not exist: ask which passage was meant (valid answers = existing passage names).

**Example**

*Show the player's name in a greeting passage*

```json
{
  "passage_name": "Greeting",
  "name": "playerName"
}
```

Emits e.g. $playerName (Harlowe) before any trailing links in Greeting.

### `set_variable`

Add or replace a setter for a declared variable inside a named passage. Idempotent within a passage — calling it twice for the same variable in the same passage overwrites the existing setter rather than stacking a second one. Pass expression:true to emit the value verbatim as a format-native expression (e.g. "$cash + 100") instead of a quoted literal — use it for computed values, or prefer adjust_variable for simple +/- changes.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `passage_name` | string | yes | — |
| `name` | string | yes | — |
| `value` | union | yes | — |
| `expression` | boolean | no | — |

**Surfaces a clarification when:**

- variable not declared: ask declare_now | cancel.
- passage_name does not exist: ask which passage was meant (valid answers = existing passage names).

**Example**

*Change the player's name when they pick it*

```json
{
  "passage_name": "DecideName",
  "name": "playerName",
  "value": "Mira"
}
```

For a computed value pass expression:true, e.g. { passage_name: "Work", name: "cash", value: "$cash + 100", expression: true }.

### `adjust_variable`

Change a numeric variable by a relative amount inside a passage — e.g. working adds +100 cash, studying adds +1 intelligence. Emits the format-correct relative assignment (SugarCube <<set $cash to $cash + 100>>, Harlowe (set: $cash to $cash + 100), Chapbook cash: cash + 100, Snowman <% s.cash = s.cash + 100 %>). Idempotent within a passage — re-adjusting the same variable in the same passage replaces the prior adjustment rather than stacking. Use set_variable for absolute values.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `passage_name` | string | yes | — |
| `name` | string | yes | — |
| `delta` | number | yes | Amount to add (negative to subtract). |

**Surfaces a clarification when:**

- variable not declared: ask declare_now | cancel (inherited from set_variable).
- passage_name does not exist: ask which passage was meant (inherited from set_variable).

**Example**

*Working pays 100 cash*

```json
{
  "passage_name": "Work",
  "name": "cash",
  "delta": 100
}
```

Use a negative delta to subtract, e.g. { passage_name: "Bar", name: "cash", delta: -20 }.

### `insert_conditional`

Insert a format-correct conditional block into a passage — content that renders only when a variable test passes (with an optional else branch). Conditions are structured ({name, op, value}) and rendered into the active format's dialect (SugarCube <<if>>, Harlowe (if:)[…], Chapbook [if]…[continue], Snowman <% if(){} %>), so you never hand-write macro syntax. Use it for state-gated text, day/location event triggers, or wrapping a setter for a clock rollover.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `passage_name` | string | yes | — |
| `conditions` | array<object> | yes | — |
| `join` | enum(`and` \| `or`) | no | — |
| `then_text` | string | yes | Content rendered when the condition holds (may contain links / setters). |
| `else_text` | string | no | — |
| `offset` | number | no | — |

**Surfaces a clarification when:**

- passage_name does not exist: ask which passage was meant (valid answers = existing passage names).
- a referenced variable is not declared: returns a recoverable error naming it (declare_variable then retry).

**Example**

*Show an exam event only on day 2 at the school*

```json
{
  "passage_name": "School",
  "conditions": [
    {
      "name": "day",
      "op": "eq",
      "value": 2
    }
  ],
  "then_text": "A proctor waves you toward the exam hall.\n[[Take the exam->Exam]]"
}
```

Multiple conditions join with `join` (default "and"): [{name:"intelligence",op:"gt",value:1},{name:"attendedSchool",op:"truthy"}].

### `insert_conditional_link`

Insert a link that only appears when a variable test passes — the state-gated choice pattern (e.g. show the "Take the exam" option only when intelligence > 1 and the player attended school). Emits a format-correct conditional wrapping a [[...]] link, so the graph still sees the edge. Provide else_text to show a disabled/explanatory line when the condition fails.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `passage_name` | string | yes | — |
| `conditions` | array<object> | yes | — |
| `join` | enum(`and` \| `or`) | no | — |
| `to_passage` | string | yes | — |
| `display_text` | string | no | — |
| `else_text` | string | no | — |
| `offset` | number | no | — |

**Surfaces a clarification when:**

- passage_name does not exist: ask which passage was meant.
- to_passage does not exist: ask create_empty | cancel (parity with link_passages).
- a referenced variable is not declared: returns a recoverable error naming it.

**Example**

*Only offer the exam pass when the player is ready*

```json
{
  "passage_name": "Exam",
  "conditions": [
    {
      "name": "intelligence",
      "op": "gt",
      "value": 1
    },
    {
      "name": "attendedSchool",
      "op": "truthy"
    }
  ],
  "to_passage": "ExamPass",
  "display_text": "Answer confidently",
  "else_text": "You are not prepared enough to pass."
}
```

### `set_stat_block`

Create or replace a persistent stat display shown on every passage — the HUD/sidebar. SugarCube uses the StoryCaption special passage (sidebar); Harlowe uses a header-tagged passage. Declarative and idempotent: pass the full list of variables to show and the block is regenerated. Chapbook and Snowman have no native per-passage header, so the tool declines them (author a stat panel manually).

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `variables` | array<string> | yes | Variable names to display, in order. |
| `title` | string | no | — |
| `separator` | string | no | — |

**Surfaces a clarification when:**

- a listed variable is not declared: returns a recoverable error naming it.

**Example**

*Show the life-sim HUD*

```json
{
  "variables": [
    "day",
    "cash",
    "energy",
    "intelligence"
  ],
  "title": "Status"
}
```

SugarCube writes StoryCaption; Harlowe writes a header-tagged StatBar passage.

### `add_widget`

Define a reusable SugarCube widget in the `widget`-tagged Widgets passage, callable from any passage. Pass a custom { name, body }, or preset:"stat_popup" to install a ready-made <<statpop 'name' delta>> widget that changes a numeric stat AND shows a popup (core SugarCube Dialog) — the "notify whenever a stat changes" pattern. SugarCube only (Harlowe uses (macro:), Chapbook/Snowman use JavaScript); idempotent per widget name.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | — |
| `body` | string | no | — |
| `preset` | enum(`stat_popup`) | no | — |

**Example**

*Install a stat-change popup widget*

```json
{
  "preset": "stat_popup"
}
```

Then call it in a passage: <<statpop 'cash' 100>> adds 100 to $cash and pops a dialog. Custom form: { name: "greet", body: "Hello, _args[0]!" }.

### `add_item`

Add an item to an inventory (an array-of-item-names variable) inside a passage — e.g. picking up a key. Auto-initialises the inventory to an empty array in the Start passage on first use. Emits the format-correct array push (SugarCube <<run $inv.push('key')>>, Harlowe (set: $inv to it + (a: 'key')), Snowman <% s.inv.push('key') %>). Gate links on inventory with insert_conditional_link using op "has"/"lacks". SugarCube/Harlowe/Snowman only (Chapbook mutates arrays via raw JS).

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `passage_name` | string | yes | — |
| `item` | string | yes | — |
| `inventory_name` | string | no | — |
| `offset` | number | no | — |

**Surfaces a clarification when:**

- passage_name does not exist: ask which passage was meant.

**Example**

*Pick up the brass key*

```json
{
  "passage_name": "Vault",
  "item": "brass key"
}
```

Then gate a door: insert_conditional_link({ passage_name: "Door", conditions: [{name:"inventory", op:"has", value:"brass key"}], to_passage: "Unlocked" }).

### `remove_item`

Remove an item from an inventory array inside a passage — e.g. using a key. Emits the format-correct array removal (SugarCube <<run $inv.delete('key')>>, Harlowe (set: $inv to it - (a: 'key')), Snowman <% s.inv = _.without(s.inv, 'key') %>). SugarCube/Harlowe/Snowman only.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `passage_name` | string | yes | — |
| `item` | string | yes | — |
| `inventory_name` | string | no | — |
| `offset` | number | no | — |

**Surfaces a clarification when:**

- passage_name does not exist: ask which passage was meant.

**Example**

*Consume the key when the door opens*

```json
{
  "passage_name": "Unlocked",
  "item": "brass key"
}
```

### `list_variables`

Return every declared variable in the active story with its type, initial value, and the passages that set or read it. Reads from the in-memory registry — populated by declare_variable / set_variable this session, or extracted from passage text on load_story.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|

**Example**

*Inspect all variables in the active story*

```json
{}
```

### `delete_variable`

Atomically remove every setter and every reader for a named variable from the active story's passage text, then drop it from the registry. Honors the unsaved-changes guard from feature 010 (pass discard_unsaved: true to override).

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |
| `discard_unsaved` | boolean | no | — |

**Surfaces a clarification when:**

- active story has unsaved changes AND discard_unsaved is not set: ask save_first | discard_unsaved | cancel.
- variable not declared: returns a recoverable error (not a clarification).

**Example**

*Remove a variable that's no longer needed*

```json
{
  "name": "playerName"
}
```

### `save_story`

Persist the active story as <slug>.twee and <slug>.html into a directory, plus a sibling assets/<slug>/ drop zone. Reports every image placeholder whose file is not yet on disk. Defaults output_dir to the active story's last-saved location (set by an earlier save_story or load_story); asks only when no remembered path is available.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `output_dir` | string | no | — |
| `compile_html` | boolean | no | — |

**Surfaces a clarification when:**

- output_dir missing AND no last-saved path remembered: ask for the destination folder (free-form).

**Example**

*Save to a subfolder of the current working directory*

```json
{
  "output_dir": "stories/locked-door"
}
```

Writes stories/locked-door/{locked-door.twee, locked-door.html} and creates stories/locked-door/assets/locked-door/.

### `respond_to_clarification`

Resolve a previously-returned clarification_needed payload by providing the author's answer. The server replays the original tool call with the answer merged in. Use this only when your MCP client does not support MCP elicitation.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `clarification_id` | string | yes | — |
| `answer` | string | yes | — |

**Example**

*Answer a pending clarification*

```json
{
  "clarification_id": "8f2c0b9e-1234-4abc-8def-5678abcd9012",
  "answer": "Harlowe"
}
```

The clarification_id is returned by whichever tool emitted the clarification.

## End-to-end example

Building a branching story with one decision point and saving it:

```text
1. create_story({ name: "Locked Door", format: "Harlowe" })
2. create_passage({ name: "Start", text: "You stand before a locked door.", set_as_start: true })
3. create_passage({ name: "Pick Lock", text: "You pick the lock and slip through." })
4. create_passage({ name: "Kick Door", text: "You kick it open with a splinter of wood." })
5. link_passages({ from_passage: "Start", to_passage: "Pick Lock", display_text: "Try to pick it" })
6. link_passages({ from_passage: "Start", to_passage: "Kick Door", display_text: "Kick it down" })
7. add_image_placeholder({ passage_name: "Pick Lock", label: "brass-lock" })   // optional
8. save_story({ output_dir: "./stories/locked-door" })
```

Result on disk:

```text
stories/locked-door/
├── locked-door.twee         # canonical source
├── locked-door.html         # importable into Twine 2 editor
└── assets/locked-door/      # drop image files here
    └── brass-lock.png       # placed by the author after add_image_placeholder
```

Open `locked-door.html` in the Twine 2 editor (Library → Import From File) to verify the graph and Publish to File for standalone playable HTML.
