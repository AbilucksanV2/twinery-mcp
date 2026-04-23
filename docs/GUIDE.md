# Twinery MCP Server — Tool Guide

> This guide is auto-generated from `src/guide/registry.ts` and the zod schemas on each tool. If you're editing this file by hand, you're editing the wrong thing — change the tool and regenerate.

## What this server does

Every tool below is callable from any MCP-compliant client over stdio. The server holds one active story in memory at a time and writes it to disk on `save_story`. Parsing and emission of Twee / Twine 2 HTML go through [extwee](https://github.com/videlais/extwee); the server never hand-rolls Twine format code.

The tool surface is deliberately small and verb-shaped (think UnityMCP / GodotMCP patterns):

- **`create_story`** — Initialise the single active story.
- **`create_passage`** — Add a passage to the active story.
- **`link_passages`** — Insert a [[...]] link from one passage to another using syntax appropriate to the story's declared format (arrow for Harlowe/Chapbook, pipe for SugarCube/Snowman).
- **`rename_passage`** — Rename a passage and rewrite every incoming link across the story atomically.
- **`list_passages`** — Return the list of passages with their tags and outgoing links.
- **`add_image_placeholder`** — Insert an image placeholder in a passage and return the exact filename and folder path where the author must drop the image.
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

## Tools

### `create_story`

Initialise the single active story. Asks for the story format if omitted (no silent defaults). Auto-generates a spec-valid IFID.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | — |
| `format` | enum(`Harlowe` \| `SugarCube` \| `Chapbook` \| `Snowman`) | no | — |
| `format_version` | string | no | — |
| `ifid` | string | no | — |

**Surfaces a clarification when:**

- format omitted: ask Harlowe | SugarCube | Chapbook | Snowman.

**Example**

*Start a Harlowe story*

```json
{
  "name": "Locked Door",
  "format": "Harlowe"
}
```

If you omit `format`, the server will surface a clarification instead of picking a default.

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

### `save_story`

Persist the active story as <slug>.twee and <slug>.html into a directory, plus a sibling assets/<slug>/ drop zone. Reports every image placeholder whose file is not yet on disk. Asks for the output folder when omitted.

**Input**

| Field | Type | Required | Notes |
|---|---|---|---|
| `output_dir` | string | no | — |
| `compile_html` | boolean | no | — |

**Surfaces a clarification when:**

- output_dir missing: ask for the destination folder (free-form).

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
