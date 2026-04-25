You're absolutely right, and that's a real friction point. Let me lay out what's missing and why each gap matters.

## The core gap: no `load_story`

Right now the server is write-only from disk's perspective. `save_story` exports `.twee` and `.html`, but there's no way back. The `.twee` format is literally designed to be the canonical, round-trippable source — it's plain text, well-specified, and `extwee` (which the server presumably uses to compile) can also parse it. So the missing tool is essentially:

**`load_story(path)`** — read a `.twee` file from disk, replace the active story in memory. Should report passage count, start passage, format, IFID, and any validation issues found on load. Should refuse if there's unsaved work in the active story (or take a `discard_unsaved: true` flag).

This single tool would have made today's session trivial — I could have just loaded `the-abandoned-building.twee` and tested the new tools against it directly.

## Other gaps I noticed working with it today

**Session and persistence**

- `current_story_info` — a read-only "what's loaded right now?" probe. Name, format, IFID, passage count, start passage, last saved path, dirty flag. Today I had to call `list_passages` to discover the active story wasn't mine.
- `save_story` could remember the last-used `output_dir` per story and default to it. Right now every save asks again unless you pass it explicitly.
- A "dirty" flag tracking whether the in-memory story has unsaved changes. Useful to surface in `current_story_info` and to guard `load_story` / `create_story` from clobbering work.

**Bulk and batch operations**

- `create_passages` (plural) — accept an array. Building the 18-passage game took 18 round trips. Even a simple batch endpoint would cut that to one. Same idea applies to `link_passages`.
- `find_and_replace` — scoped to passage text, with a `dry_run` flag. Useful for global tweaks like renaming a recurring phrase. Right now you'd have to `get_passage` → edit in your head → `update_passage` for every hit.

**Graph reasoning**

- `get_incoming_links(passage_name)` — the inverse of what `list_passages` already gives you per-passage outgoing. `delete_passage` already computes this internally to surface its clarification, so the data path exists. Useful for "what depends on this passage?" before refactoring.
- `find_path(from, to)` — BFS over the link graph. Useful for "is this ending actually reachable from the start?" or "what's the shortest path to the SecretRoom?". `validate_story` already does reachability for the orphan check, so the engine is there.
- `graph_stats` — passage count, link count, ending count (passages tagged `ending`), average branching factor, longest shortest-path from start, dead-ends (passages with zero outgoing links that aren't tagged endings). Cheap to compute, very useful for game-design feedback. The dead-end check in particular would have caught the original "River" issue today, which `validate_story` correctly didn't flag (it's not technically an orphan).

**Authoring ergonomics**

- `preview_passage(name)` — render a single passage's HTML (just that node's compiled output) without a full save. Faster iteration loop when tuning prose.
- `duplicate_passage(name, new_name)` — copy a passage's text/tags/size to a new name. Useful when building parallel branches with similar structure.
- `list_image_placeholders` — show all placeholders in the story plus their on-disk status (present / missing). Today the only way to see this is to trigger `save_story` and read the `pending_image_drops` field. A read-only equivalent would be cleaner.
- `get_passage` returning **incoming** links alongside outgoing would close a real gap — right now you can see what a passage links to but not what links to it without scanning the whole story.

**Validation depth**

`validate_story` is solid for the structural sweep, but a few softer issues are worth surfacing as warnings rather than errors:

- Dead-ends that aren't tagged `ending` (probably unintentional)
- Passages reachable but unreachable-back (no path to start) — worth flagging in branching narratives where you might want a return path
- Self-loops (passage links to itself) — sometimes intentional, often a typo
- Unused tags vs. tags only used once — useful for hygiene
- Format-version mismatch warnings (e.g. story declares Harlowe 3.3.8 but text uses syntax from 3.4)

A `validate_story(strict: true)` mode that promotes warnings to errors would be a clean pattern.

**Format-aware niceties**

- `list_supported_formats` — what story formats does the server actually have available? Right now you have to either know or guess. Tied to which compilers are installed.
- `change_format(new_format)` — mostly a footgun, but for early-stage stories before format-specific syntax creeps in, would be useful. Should validate that no passage text uses syntax incompatible with the target format.

## My priority ranking if I were building these

If I were sequencing the work:

1. **`load_story`** — biggest unlock for any iterative session, removes the "rebuild from scratch" tax entirely
2. **`current_story_info` + dirty flag** — cheap, makes the session state legible, prerequisite for safe `load_story` and `create_story`
3. **`create_passages` (batch)** — order-of-magnitude speedup for initial authoring, which is the most common workflow
4. **`get_incoming_links` + incoming links in `get_passage`** — small change, real reasoning unlock
5. **Dead-end and self-loop warnings in `validate_story`** — almost free given the existing graph traversal, catches real authoring bugs

The first two together would change the whole UX from "stateless rebuild every session" to "open a story, work on it, save it" — which is what authors expect from any tool that touches files.

Want me to demonstrate any of these by building a minimal mock-up, or is the gap analysis enough for now?