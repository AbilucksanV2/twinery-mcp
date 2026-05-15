# Quickstart: Variable management tools

**Audience**: A maintainer (or an LLM driving them) who wants to add
state to a Twine story without writing format-specific macro syntax by
hand.

This walkthrough mirrors what the README will document at the v0.6
release time. Working session inputs: [spec.md](./spec.md),
[plan.md](./plan.md), [contracts/tools.json](./contracts/tools.json).

---

## Why variables matter

Without variables, a Twine story authored through this MCP server can
only branch on the link-graph topology — every choice is a `[[...]]`
edge. With variables, the same story can:

- Carry items between passages (`hasKey: true` after pickup; readers
  check it at a locked door).
- Greet the player by name (one declare, one reader, every later
  passage references the variable).
- Implement counters (turn counter, suspicion meter, health).
- Conditionally hide / show prose using the format's `if` macros.

Inventory (a future feature, `F-INVENTORY`) is variables under the
hood. Custom stylesheets (also future, `F-STYLESHEETS`) compose with
them when tag-driven theming is needed.

---

## Six tools at a glance

```text
declare_variable        name + optional initial value         → emits setter into Start
set_variable            passage + name + value                → emits / replaces setter
read_variable           name                                  → read-only probe
list_variables          —                                     → registry dump
delete_variable         name + optional discard_unsaved       → strips every setter + reader
insert_variable_reader  passage + name + optional offset      → emits reader (link-aware)
```

Each tool follows the same response shape every other Twinery tool
uses: `{ kind: "ok", ... }` on success, `{ kind: "error", message }`
on a recoverable error, `{ kind: "clarification_needed", clarification }`
when the server needs an answer before proceeding.

---

## Walkthrough — a key + locked-door puzzle

The smallest non-trivial use of state. We build a three-passage story
where the player picks up a key in one passage and uses it in another.

### 1. Start a Harlowe story

```text
create_story(name: "Key Test", format: "Harlowe")
create_passage(name: "Start", text: "You stand in a hallway.", set_as_start: true)
create_passage(name: "Closet", text: "An iron key glints on the floor.")
create_passage(name: "Door",   text: "A locked door bars the way.")
```

### 2. Declare the state variable

```text
declare_variable(name: "hasKey", initial: false)
```

The server appends `(set: $hasKey to false)` to the Start passage.
You can verify with `list_variables` — `hasKey` shows one setter in
Start, zero readers.

### 3. Set the variable on pickup

```text
set_variable(passage_name: "Closet", name: "hasKey", value: true)
```

The Closet passage now contains:

```text
An iron key glints on the floor.
(set: $hasKey to true)
```

### 4. Link the passages and gate the door

```text
link_passages(from_passage: "Start",  to_passage: "Closet", display_text: "Search the closet")
link_passages(from_passage: "Start",  to_passage: "Door",   display_text: "Try the door")
link_passages(from_passage: "Closet", to_passage: "Door",   display_text: "Return to the door")
```

Now make the Door passage display different prose based on
`hasKey`. The format's `(if:)` macro is the LLM's tool here —
`insert_variable_reader` plus the link-aware default placement keeps
the reader at the tail of the prose, before the choice list:

```text
update_passage(name: "Door", text:
  "A locked door bars the way.\n" +
  "(if: $hasKey)[The key fits. The door swings open.]" +
  "(else:)[You have nothing to open it with.]"
)
```

(In v1 we don't have a "conditional prose" helper tool; the LLM
writes the `(if:)` / `(else:)` macros itself. Reader insertion via
`insert_variable_reader` is the tool's job; conditional rendering on
top of readers is downstream of this feature.)

### 5. Save and play

```text
save_story(output_dir: "./stories/key-test/")
```

Two files land on disk:

```text
stories/key-test/
├── key-test.twee
└── key-test.html
```

Open `key-test.html` in the Twine 2 editor (Library → Import). Choose
"Publish to File" to get a playable standalone (or use the F-HTML
work when it ships to skip this step). Play it:

- **Start → Door**: "You have nothing to open it with."
- **Start → Closet → Door**: "The key fits. The door swings open."

### 6. Iterate — change the variable, re-save

```text
set_variable(passage_name: "Closet", name: "hasKey", value: true)   # already set; idempotent — action returns "replaced"
list_variables                                                       # returns hasKey with setters=[Start, Closet], readers=[Door]
```

The dirty-flag guard from feature 010 protects you from clobbering
unsaved work if you switch story format mid-edit. Variable-mutating
tools all flip the dirty bit.

---

## Per-format syntax reference

If you ever need to read the generated `.twee` and verify the
emitter:

| Format    | Setter (string)                          | Setter (number / boolean)                  | Reader            |
|-----------|------------------------------------------|--------------------------------------------|-------------------|
| Harlowe   | `(set: $name to "value")`                | `(set: $name to 42)` / `(set: $name to true)` | `$name`           |
| SugarCube | `<<set $name to "value">>`               | `<<set $name to 42>>` / `<<set $name to true>>` | `<<= $name>>`     |
| Chapbook  | `name: 'value'` in vars section          | `name: 42` / `name: true`                   | `{name}`          |
| Snowman   | `<% s.name = 'value' %>`                 | `<% s.name = 42 %>` / `<% s.name = true %>` | `<%= s.name %>`   |

Booleans in every format including Chapbook emit as `true` / `false`
(canonical literal) per spec clarification Q4. The format runtimes
accept it; the `yes` / `no` sugar Chapbook docs reference is not
emitted by this server.

---

## Failure modes

| What you typed | What happens |
|---|---|
| `declare_variable(name: "$x")` | Error: name fails the regex `^[A-Za-z_][A-Za-z0-9_]*$`. Rename and retry. |
| `declare_variable(name: "time")` on a Harlowe story | Error: `time` is in Harlowe's reserved-name set. Rename. |
| Second `declare_variable(name: "hasKey")` | Clarification: `replace_initial | leave_as_is | cancel`. |
| `insert_variable_reader(name: "ghost")` for an undeclared variable | Clarification: `declare_now | cancel`. |
| `set_variable` for a passage that doesn't exist | Clarification listing existing passage names (parity with `link_passages`). |
| `delete_variable` on a dirty story without `discard_unsaved: true` | Clarification: `save_first | discard_unsaved | cancel`. Matches load_story / create_story. |

---

## What's in scope vs. out

**In scope** (this feature):
- Six tools above.
- Format-aware emit + extract for setters and readers across all
  four formats.
- Registry on `ActiveStory`, populated by tool calls AND by
  `load_story` extracting setters from passage text.
- Round-trip through `save_story` → `.twee` / `.html` → reload.
- Smoke section 23c exercises the declare-set-reader-save-reload
  cycle.

**Out of scope** (tracked elsewhere):
- Inventory primitive (`add_item` / `has_item`) — `F-INVENTORY`,
  builds on top of variables.
- Conditional rendering tools (`set_conditional_prose`) — the LLM
  writes `(if:)` / `<<if>>` macros itself for now.
- Custom stylesheet authoring — `F-STYLESHEETS`.
- Array / object / list variable types — primitives only in v1.
- Multi-story workspace — still `F-T3-MULTI`.
