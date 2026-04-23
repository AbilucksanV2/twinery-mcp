# twinery-mcp-poc

**Proof-of-concept** MCP (Model Context Protocol) server that lets an LLM drive the
authoring of branching [Twine 2](https://twinery.org/) interactive-fiction stories.

This is a POC — v0.3 of the [full v1.0 plan](specs/001-mcp-server-mvp/plan.md) —
covering branching-story authoring, the full edit/delete/validate surface, image
placeholders, and an LLM-facing guide resource. It exists to prove that you can
attach this server to any MCP-compliant client, ask the LLM to build and refine
an illustrated branching story, and end up with a Twine-compatible file you can
open in the native Twine 2 editor.

**For the full v1.0 scope** (drift gates, cross-platform install scripts,
multi-format story testing, automated tests, CI, MCP elicitation) see
[`specs/001-mcp-server-mvp/`](specs/001-mcp-server-mvp/).

## What's in v0.3

**13 MCP tools**:

| Tool | Purpose |
|------|---------|
| `create_story` | Start a new story (name + format). Asks for the format if you omit it — no silent defaults. Auto-generates a spec-valid IFID. |
| `create_passage` | Add a passage. First one becomes the start unless told otherwise. Auto-positions on the Twine canvas. |
| `update_passage` | Mutate text / tags / position / size on an existing passage. Does NOT rename (use `rename_passage` for that so link integrity is enforced). |
| `rename_passage` | Rename a passage and rewrite every `[[...]]` reference to it across the whole story atomically. Also updates the story's start passage if needed. |
| `delete_passage` | Remove a passage. Surfaces a clarification if it's the start or if incoming links exist — never silently dangles the graph. Cleans up image placeholders tied to the passage. |
| `link_passages` | Insert a `[[...]]` link from one passage to another using format-appropriate syntax (arrow for Harlowe/Chapbook, pipe for SugarCube/Snowman). Refuses to silently create missing passages. |
| `set_start_passage` | Point the story's start passage at an existing passage. |
| `list_passages` | Read-only overview — passages with their tags and outgoing links. |
| `get_passage` | Read-only full passage dump including text and outgoing links. |
| `validate_story` | Integrity sweep: broken links, orphans, duplicate names, IFID shape, start-passage validity. |
| `add_image_placeholder` | Mark a spot in a passage for an image and report the exact file path + filename the author must drop. |
| `save_story` | Write `<slug>.twee` and `<slug>.html` into a folder, plus a sibling `assets/<slug>/` drop zone. Reports any image placeholder whose file is still missing. |
| `respond_to_clarification` | Resolve any question the server asked during another tool call (needed when your MCP client doesn't support MCP elicitation). |

**1 MCP resource**:

| URI | Purpose |
|-----|---------|
| `twinery://guide` | LLM-facing Markdown guide — describes every tool, the clarification protocol, and the image-placeholder convention. Auto-generated from the tool registry so it can't go stale. Byte-identical to `docs/GUIDE.md` on disk. |

**Clarification pattern**: when a tool is missing required info, it returns
`{ kind: "clarification_needed", clarification: { clarification_id, question, valid_answers?, ... } }`
instead of silently defaulting. The LLM can relay the question to the human and
resume by calling `respond_to_clarification` with the answer.

**Image placeholder pattern**: `add_image_placeholder({passage_name, label})` inserts
a self-contained `<div><img>…</div>` block into the passage. The server reports the
expected file path (`<saved-dir>/assets/<story-slug>/<label>.png` by default). Drop
a file there and the played HTML loads it automatically; skip it and the compiled
HTML shows a labeled dashed-border fallback box instead of a broken-image icon.
`save_story` reports every placeholder whose file is still missing under
`pending_image_drops`.

## Prerequisites

- **Node.js 20 LTS** (Node 18 *works* for this POC but the full v1.0 requires 20+)
- An MCP-compliant client. Known-good: Claude Desktop, VS Code with an MCP-capable
  extension, or any client implementing MCP spec 2024-11-05 or later.

## Install

```bash
git clone <this-repo>
cd twinery-mcp
npm install
npm run build
```

This produces `dist/server/index.js`, the server entrypoint.

## Configure your MCP client

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "twinery": {
      "command": "node",
      "args": ["/absolute/path/to/twinery-mcp/dist/server/index.js"]
    }
  }
}
```

Restart Claude Desktop. The `twinery` server should appear in the MCP tool list.

### VS Code / any other MCP client

Same pattern: one server entry whose `command` runs
`node /absolute/path/to/twinery-mcp/dist/server/index.js`. No code changes, no
adapters.

### Cross-platform note

The server itself is pure JavaScript — it runs on Windows, macOS, and Linux with
no platform-specific steps. Absolute paths on Windows look like
`C:\\Users\\you\\...\\dist\\server\\index.js` (escape backslashes in JSON).

## First session

In your MCP client, ask the LLM something like:

> "Make a very short branching Twine story about a locked door, with two choices:
> pick the lock or kick the door. Use Harlowe. Save it to `./stories/locked-door/`."

The LLM will call the tools in roughly this sequence:

1. `create_story` — asks for format (Harlowe) if you didn't specify; you'll either
   see the clarification pop up in your client or the LLM will relay it to you.
2. `create_passage` × 3 — Start, Pick Lock, Kick Door.
3. `link_passages` × 2 — Start → Pick Lock, Start → Kick Door.
4. *(optional)* `add_image_placeholder` — e.g. a `brass-lock` image in the Pick Lock
   passage. The server replies with the exact file path to drop the image at.
5. `save_story` — writes the files and reports any image placeholders still
   pending a file on disk.

When it finishes, you'll have:

```text
stories/locked-door/
├── locked-door.twee                    # canonical Twee 3 source
├── locked-door.html                    # openable in Twine 2 editor
└── assets/locked-door/                 # drop image files here
    └── brass-lock.png                  # placed by you after add_image_placeholder
```

The LLM will also read `twinery://guide` on first use (or when it needs a
refresher) — that resource is the auto-generated tool reference in
`docs/GUIDE.md`. Any MCP client can fetch it the same way.

## Verify the result in Twine

1. Open [twinery.org/2](https://twinery.org/2) (or the Twine 2 desktop app).
2. Go to **Library → Import From File**.
3. Pick `locked-door.html`.
4. You'll see a graph with three passages and two outgoing links from Start.
5. In the Twine editor, click **Publish to File** to produce a standalone playable
   HTML bundled with the Harlowe runtime.

**Why the two-step for playable HTML?** The POC writes a file containing the
Twine 2 `<tw-storydata>` element — everything Twine uses to describe the story.
To play it in a browser standalone, the Twine format runtime (Harlowe, etc.) has
to be wrapped around it. The native Twine editor does that in one click.
A future version of this server (see the v1.0 plan) will do the bundling itself
so you get a playable HTML directly.

## Verify locally without any client

```bash
npm run smoke
```

This runs a scripted session that exercises every tool (including the
clarification paths on unknown names and incoming-link handling, image
placeholders with label collisions, and the guide generator) and asserts the
output files are well-formed Twine content. On success you'll see 19 green
checks.

## Known POC limitations (compared to v1.0)

- No MCP elicitation path — all clarifications come back as a
  `clarification_needed` response; your client will use `respond_to_clarification`
  to resolve them. The full v1.0 will use MCP's elicitation capability when the
  client supports it (see `specs/001-mcp-server-mvp/research.md` §R1).
- Format-aware link syntax but only one default-version table; SugarCube / Chapbook
  / Snowman paths are accepted at the story level but most testing is on Harlowe.
- No automated drift gate enforcing that `docs/GUIDE.md` matches the current tool
  registry — the `twinery://guide` resource reads from `docs/GUIDE.md` (or
  regenerates on the fly if missing), and CI will add the byte-identity check in
  a later iteration. Run `npm run guide:generate` after changing any tool's
  metadata.
- No tests beyond the smoke script. The v1.0 plan includes fixture-based round-
  trip tests across all four story formats plus a headless-browser verification
  pass.
- Compiled HTML is not standalone-playable; use Twine 2's "Publish to File" from
  the imported story.

## Project layout

```text
src/
├── server/
│   ├── index.ts              # MCP stdio entrypoint; reads tools from the registry
│   ├── clarification.ts      # structured "ask instead of assume" plumbing
│   ├── state.ts              # single active-story holder + placeholder tracker
│   └── tools/                # one file per MCP tool
├── twine/
│   ├── adapter.ts            # thin wrapper around extwee
│   └── formats.ts            # story-format enum + link syntax
├── graph/
│   ├── link.ts               # insert [[...]] syntax into passage text
│   ├── rename.ts             # rename + rewrite every incoming link atomically
│   └── links.ts              # shared edge extraction, reachability, incoming-link removal
├── images/
│   ├── render.ts             # inline-CSS <div><img><span> block + missing-file fallback
│   └── placeholder.ts        # label validation, uniqueness, path derivation
├── guide/
│   ├── registry.ts           # tool registry — SSOT used by server + guide
│   ├── build.ts              # generates GUIDE.md Markdown from the registry
│   └── generate.ts           # writes docs/GUIDE.md
├── lib/
│   └── slug.ts               # story-slug derivation
├── types/
│   └── extwee.d.ts           # TypeScript ambient types for extwee
└── smoke.ts                  # scripted sanity test

docs/
└── GUIDE.md                  # auto-generated; served at twinery://guide
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Launch the MCP server over stdio |
| `npm run smoke` | Run the scripted end-to-end sanity test |
| `npm run guide:generate` | Regenerate `docs/GUIDE.md` from the tool registry |

## Design principles (the ones the POC honours)

Full constitution in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
This POC implements a subset:

- **Spec-faithful format fidelity** — parsing and emission delegated to
  [`extwee`](https://github.com/videlais/extwee); no hand-rolled Twine format
  code.
- **MCP-native & model-agnostic** — standard `@modelcontextprotocol/sdk` over
  stdio; zero imports of any LLM-provider SDK.
- **Graph-integrity first** — `rename_passage` rewrites every incoming `[[...]]`
  reference in server code, not in an LLM prompt.
- **Open source under MIT** — see [LICENSE](LICENSE).

The remaining two principles (native-Twine export parity, dependency licensing
discipline with an automated gate) are targeted for the full v1.0 implementation.

## License

[MIT](LICENSE)
