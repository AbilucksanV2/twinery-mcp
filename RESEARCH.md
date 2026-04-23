# Twinery MCP Server — Research & Design Notes

Research date: 2026-04-17. Twine current version: **2.12.0** (released 2026-04-10).

## 1. What Twine is

Twine is an open-source tool for writing nonlinear, branching interactive fiction. A story is a **graph of passages** connected by links. Authors edit in a visual node editor (desktop/web app at `twinery.org/2`) or in plain text (Twee notation). Output is a single self-contained HTML file playable in any browser. Twine is maintained by the Interactive Fiction Technology Foundation (IFTF).

Core mental model for an MCP server:
- **Story** = container with metadata (name, IFID, format, start passage)
- **Passage** = node with `name`, `tags[]`, `text`, and editor `metadata` (position/size)
- **Links** = embedded inside passage text using the story format's syntax (e.g. `[[Display->Target]]`)
- The graph structure is **implicit in the link syntax inside each passage's text** — there is no separate edges table.

## 2. File formats (what we'd read/write)

Three interchangeable representations, all formally specified by IFTF at [iftechfoundation/twine-specs](https://github.com/iftechfoundation/twine-specs):

### 2a. Twee 3 (plain text, authoring-friendly — recommended primary format for an MCP server)

```
:: StoryTitle
My Story

:: StoryData
{
  "ifid": "D674C58C-DEFA-4F70-B7A2-27742230C0FC",
  "format": "Harlowe",
  "format-version": "3.3.8",
  "start": "Start"
}

:: Start [intro] {"position":"600,400","size":"100,100"}
You stand at a crossroads.
[[Go north->Forest]]
[[Go south->Village]]

:: Forest [outdoors]
Trees tower above you...
```

Rules:
- Passage headers begin with `::` at column 0
- Optional `[tags space separated]`, then optional `{json metadata}` with `position` and `size`
- Content runs until the next `::` or EOF; trailing blanks stripped
- `[`, `]`, `{`, `}`, `\` in passage names must be backslash-escaped
- Special tags: `script` (JS), `stylesheet` (CSS)
- Special passages: `StoryTitle`, `StoryData`, `Start`
- Extensions: `.tw` or `.twee`, UTF-8

### 2b. Twine 2 HTML (the playable/shareable artifact)

```html
<tw-storydata name="..." ifid="..." format="Harlowe" format-version="3.3.8"
              startnode="1" creator="..." zoom="1">
  <style type="text/twine-css">...</style>
  <script type="text/twine-javascript">...</script>
  <tw-tag name="intro" color="blue"/>
  <tw-passagedata pid="1" name="Start" tags="intro" position="600,400" size="100,100">
    You stand at a crossroads.
    [[Go north->Forest]]
  </tw-passagedata>
</tw-storydata>
```

HTML-encode `<`, `>`, `&` inside passage text. `ifid` is 8–63 chars (digits/capitals/hyphens).

### 2c. JSON output (spec'd, and what an LLM would love to consume)

```json
{
  "name": "My Story",
  "ifid": "D674C58C-...",
  "format": "Harlowe",
  "format-version": "3.3.8",
  "start": "Start",
  "tag-colors": { "intro": "blue" },
  "zoom": 1,
  "style": "",
  "script": "",
  "passages": [
    {
      "name": "Start",
      "tags": ["intro"],
      "metadata": { "position": "600,400", "size": "100,100" },
      "text": "You stand at a crossroads.\n[[Go north->Forest]]"
    }
  ]
}
```

Supports partial-story encoding (subset of passages), which is ideal for incremental LLM edits.

## 3. Story formats (runtime dialects inside passage text)

The **story format** determines how passage text is parsed at play time. An MCP server doesn't need to execute these, but tools should know the link syntax so generated passages are valid.

| Format    | Audience                 | Link syntax                                              | Notes |
|-----------|--------------------------|----------------------------------------------------------|-------|
| Harlowe   | Beginners (default)      | `[[text->target]]`, `[[target<-text]]`, `[[target]]`     | Macro-based, opinionated; harder to extend with JS |
| SugarCube | Power users              | `[[text\|target]]` (pipe), also `[[target]]`             | Huge feature set, save slots, JS-friendly |
| Chapbook  | Newer users, novelists   | `[[text->target]]` plus `inserts` and `modifiers`        | Modern, second-generation |
| Snowman   | JS/CSS-fluent developers | `[[text\|target]]`, minimal macros                       | Bring-your-own-JS; smallest surface |

An MCP server should let the LLM **pick a format per story** and warn if generated link syntax doesn't match it. Default to Harlowe for parity with Twine's UI default.

## 4. Existing tooling we can build on (don't reinvent)

- **[extwee](https://github.com/videlais/extwee)** (npm) — the one to use. JS/Node library that parses **and** emits Twee 3, Twine 2 HTML, and JSON, plus compiles Twee → HTML with a story format. Covers both directions, so we're not writing a parser.
- **[Tweego](https://github.com/tmedwards/tweego)** — Go CLI compiler. Useful to shell out to for producing the final playable HTML with bundled story-format assets, if we don't want to embed them.
- **[Twison](https://github.com/lazerwalker/twison)** — a story format that, when "played", dumps the story as JSON. Not needed if we use extwee, but good reference.
- **[twine-utils](https://klembot.github.io/twine-utils/)** — alternative to extwee, from Twine's author (klembot).

**Recommendation:** Node.js + extwee + the official TypeScript MCP SDK `@modelcontextprotocol/sdk`. Python + python-sdk is a viable alternative but would require porting a parser or shelling to Tweego.

## 5. Proposed MCP server design

### Tools (actions an LLM takes)

Starter set, keeping the surface small and graph-oriented:

| Tool                     | Purpose                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| `create_story`           | New story: name, IFID (auto-generate if omitted), format, start passage |
| `open_story`             | Load an existing `.twee`/`.html`/`.json` file into the server's state   |
| `save_story`             | Persist current state to `.twee` (source) and/or compile to `.html`     |
| `list_passages`          | Return `[{name, tags, position, outgoing_links[]}]` — graph overview    |
| `get_passage`            | Full passage incl. text                                                 |
| `create_passage`         | Add a passage; auto-position to avoid overlap                           |
| `update_passage`         | Edit text/tags/position/name (renames also rewrite incoming links)      |
| `delete_passage`         | Remove; flag orphaned references                                        |
| `link_passages`          | Insert a format-appropriate link from A to B into A's text              |
| `find_broken_links`      | Links pointing to nonexistent passages                                  |
| `find_orphans`           | Passages unreachable from `start`                                       |
| `validate_story`         | IFID shape, required passages, format syntax sanity, duplicate names    |
| `compile_to_html`        | Produce playable HTML (extwee or shell to Tweego)                       |

Non-obvious but high-value:
- `rename_passage` should rewrite every `[[...]]` that points at the old name across all passages — this is the single operation an LLM most often gets wrong if left to edit raw text.
- `link_passages` should know the active story format and emit the right arrow/pipe syntax.

### Resources (read-only context the model sees)

- `story://current/summary` — name, format, passage count, start passage, broken-link count
- `story://current/graph` — adjacency list as JSON (cheap to render, great for planning)
- `story://current/passage/{name}` — individual passage text
- `story://current/twee` — full Twee source (for when the model wants ground truth)

### Prompts (reusable templates)

- `new_branching_scene` — "given a setup, draft 3 branching choices and stub their target passages"
- `tighten_passage` — "rewrite this passage in ≤N words, preserve all links"
- `audit_story` — run validate + broken/orphan checks and propose fixes

### State model

Server holds one active story in memory as the JSON shape from §2c. Persist on `save_story`. Consider `story_id` parameters later if multi-story is needed — start single-story for simplicity.

## 6. Things to decide before coding

1. **Transport**: stdio (Claude Desktop / most clients) vs. HTTP+SSE (web). Start with stdio.
2. **Target story format default**: Harlowe 3.x is safest and matches Twine's UI default.
3. **Compile path**: embed extwee (pure Node, zero external deps) vs. shell out to Tweego (requires user install, but produces identical HTML to Twine itself). Recommend extwee first, Tweego as opt-in.
4. **File roots**: does the server get a working directory, or does every tool take absolute paths? Working dir is friendlier to the LLM.
5. **Concurrency**: two `update_passage` calls to the same passage should be last-write-wins with a warning, or rejected. Pick one.

## 7. Concrete next steps

1. `npm init` a TypeScript project; add `@modelcontextprotocol/sdk` and `extwee`.
2. Implement a minimal server exposing `create_story`, `create_passage`, `link_passages`, `save_story` end-to-end; verify by opening the saved `.html` in a browser.
3. Layer in `rename_passage`, `validate_story`, and the resources.
4. Add a `prompts/` directory with the templates above.
5. Write an example session in `README.md` showing an LLM building a 10-passage branching story from a one-paragraph premise.

## Sources

- [Twine homepage](https://twinery.org/) and [Twine 2 app](https://twinery.org/2/)
- [Twine 2.12.0 release announcement (2026-04-12)](https://blog.iftechfoundation.org/2026-04-12-twine-version-2120-released.html)
- [IFTF Twine specs repo](https://github.com/iftechfoundation/twine-specs)
- [Twee 3 specification](https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md)
- [Twine 2 HTML output spec](https://github.com/iftechfoundation/twine-specs/blob/master/twine-2-htmloutput-spec.md)
- [Twine 2 JSON output spec](https://github.com/iftechfoundation/twine-specs/blob/master/twine-2-jsonoutput-doc.md)
- [Twine 2 story formats spec](https://github.com/iftechfoundation/twine-specs/blob/master/twine-2-storyformats-spec.md)
- [Twine Cookbook — Story Formats](https://twinery.org/cookbook/introduction/story_formats.html)
- [Harlowe 3.3.8 manual](https://twine2.neocities.org/)
- [Tweego compiler](https://github.com/tmedwards/tweego) and [docs](https://www.motoslave.net/tweego/docs/)
- [Twison (JSON export format)](https://github.com/lazerwalker/twison)
- [extwee (npm parser/compiler)](https://github.com/videlais/extwee)
- [twine-utils (klembot)](https://klembot.github.io/twine-utils/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [MCP documentation](https://modelcontextprotocol.io/docs/sdk)
