# twinery-mcp-poc

**Proof-of-concept** MCP (Model Context Protocol) server that lets an LLM drive the
authoring of branching [Twine 2](https://twinery.org/) interactive-fiction stories.

This is a POC — v0.4 of the [full v1.0 plan](specs/001-mcp-server-mvp/plan.md) —
covering branching-story authoring with the full edit/delete/validate surface,
image placeholders, an LLM-facing guide resource, and the open / inspect / save
loop (load_story, current_story_info, dirty-flag tracking). It exists to prove
that you can attach this server to any MCP-compliant client, ask the LLM to
build and iterate on an illustrated branching story across sessions, and end
up with a Twine-compatible file you can open in the native Twine 2 editor.

**For the full v1.0 scope** (drift gates, cross-platform install scripts,
multi-format story testing, automated tests, CI, MCP elicitation) see
[`specs/001-mcp-server-mvp/`](specs/001-mcp-server-mvp/) and the roadmap at
[`specs/001-mcp-server-mvp/roadmap.md`](specs/001-mcp-server-mvp/roadmap.md).

## What's in v0.4

**15 MCP tools**:

| Tool | Purpose |
|------|---------|
| `create_story` | Start a new story (name + format). Asks for the format if you omit it — no silent defaults. Auto-generates a spec-valid IFID. |
| `load_story` | Load a `.twee` file from disk into the active story. Refuses to clobber unsaved changes (clarification offers save / discard / cancel). Validates on load and reports issues without blocking. |
| `current_story_info` | Read-only state probe — name, format, IFID, passage count, start, last-saved path, last-saved-at, dirty flag. Returns `{ active: false }` when no story is loaded. |
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
| `save_story` | Write `<slug>.twee` and `<slug>.html` into a folder, plus a sibling `assets/<slug>/` drop zone. Defaults `output_dir` to the active story's last-saved (or last-loaded) path; asks only when nothing is remembered. Reports any image placeholder whose file is still missing. |
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

## Run modes

The server has two transports. Stdio is the default and what most end users want.
HTTP is opt-in for maintainers who want a connect-once dev loop.

### Stdio (default)

```bash
node dist/server/index.js
# → [twinery-mcp-poc] connected over stdio
```

The MCP client spawns a fresh server process per session. Zero configuration.

### HTTP (opt-in, v0.5+)

```bash
node dist/server/index.js --transport http
# → [twinery-mcp-poc] listening on http://127.0.0.1:4173/mcp
```

The MCP client connects to a long-lived URL. **Dev-iteration loop**: edit code,
`npm run build`, restart only the server (Ctrl+C → re-run), call a tool from the
same client window. No client reload, no per-session node process spawn.

| Flag | Default | Notes |
|---|---|---|
| `--transport <stdio\|http>` | `stdio` | Selects the MCP transport. |
| `--host <string>` | `127.0.0.1` | HTTP bind host. Non-loopback prints a warning banner. Ignored for stdio. |
| `--port <number>` | `4173` | HTTP bind port. `0` for OS-assigned (resolved port logged to stderr). Ignored for stdio. |
| `--help` | — | Print flag reference and exit 0. |

Failure modes:

| What you typed | What happens |
|---|---|
| `--transport http2` | Exit 2; stderr: `--transport must be 'stdio' or 'http' (got 'http2')` |
| `--port abc` | Exit 2; stderr: `--port must be an integer 0–65535 (got 'abc')` |
| `--bogus` | Exit 2; stderr: `unknown flag: --bogus` plus help text |
| `--port <in use>` | Exit 1; stderr: `port N is already in use. Pass --port to choose another port.` |

## Configure your MCP client

### Claude Desktop — stdio (default)

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

### Claude Desktop — HTTP (via `mcp-remote` bridge)

Claude Desktop's `claude_desktop_config.json` only supports stdio servers — it
has no native `url` field. To use the HTTP transport from Claude Desktop, run it
through the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) shim, which
is a stdio MCP server that proxies to an HTTP MCP endpoint. `mcp-remote` is
already installed as a devDependency of this repo, so the path is stable.

Start the server first (`node dist/server/index.js --transport http`), then add
this to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
/ `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "twinery": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/twinery-mcp/node_modules/mcp-remote/dist/proxy.js",
        "http://127.0.0.1:4173/mcp"
      ]
    }
  }
}
```

**Two non-obvious requirements**:

1. `command` MUST be an absolute path to a **Node ≥20.18.1** binary. Claude
   Desktop is launched by the OS service manager (launchd on macOS), which uses
   a minimal PATH that does not include nvm/asdf. If you point at `node`,
   `npx`, or anything else by name, Claude Desktop silently uses whatever Node
   the system PATH finds first — usually the wrong one. Find your Node 20+
   binary with `which node` after `nvm use 20` (or `brew --prefix node`), and
   paste the full path.
2. **Don't go through `npx`**. `npx mcp-remote ...` re-resolves Node via the
   shim's `#!/usr/bin/env node` shebang against the same minimal PATH and
   re-introduces the wrong-Node bug. Run `dist/proxy.js` directly with your
   chosen Node binary as shown above.

The dev loop still works through this bridge: Claude Desktop spawns
`mcp-remote` once at startup, `mcp-remote` holds the HTTP connection to your
server, you restart only the server, `mcp-remote` reconnects automatically.

### VS Code / clients with native HTTP support

Clients that natively speak Streamable HTTP (e.g. MCP Inspector, Cursor recent
versions, claude.ai web Custom Connectors) accept a `url` field directly:

```json
{
  "mcpServers": {
    "twinery": {
      "url": "http://127.0.0.1:4173/mcp"
    }
  }
}
```

If your client doesn't document a `url` field, fall back to the `mcp-remote`
bridge form above.

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
npm run smoke           # both transports + CLI fail-fast paths + format fixtures
npm run smoke:stdio     # in-process, fastest
npm run smoke:http      # spawns the server, drives via HTTP wire
npm run smoke:cli       # CLI / host / port fail-fast checks only
npm run fixtures        # all-format round-trip fixtures (Harlowe / SugarCube / Chapbook / Snowman)
```

`npm run smoke` runs the full 24-section scripted session through both stdio and
HTTP, exercises every CLI failure path documented above, then runs the
all-format fixture round-trips (Twee↔Twee, Twee↔HTML↔Twee, Twee↔JSON↔Twee)
across Harlowe, SugarCube, Chapbook, and Snowman. The session covers
clarification paths on unknown names, incoming-link handling, image-placeholder
label collisions, the guide generator, dirty-flag tracking across mutations,
and a save → mutate → load round-trip with the dirty-clobber clarification.
The combined run completes in well under 60s on a typical dev laptop.

GitHub Actions runs the same checks on every push to `main` / `dev` and on every
pull request, across `ubuntu-latest`, `macos-latest`, and `windows-latest` on
Node 20 LTS. The workflow also enforces three constitution gates:
- `scripts/check-no-llm-sdk.mjs` — fails if any LLM-provider SDK appears in
  `package.json` deps or in import statements under `src/`.
- `scripts/check-licenses.mjs` — fails if any production dep (direct or
  transitive) carries a license outside the allowlist (MIT, ISC, Apache-2.0,
  BSD-2/3-Clause, MPL-2.0, BlueOak-1.0.0, 0BSD, Unlicense, CC0-1.0, CC-BY-4.0).
- `scripts/check-guide-drift.mjs` — fails if `docs/GUIDE.md` is out of sync
  with the registry (run `npm run guide:generate` and commit to fix).

Run any of those scripts directly to reproduce the gate locally.

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
│   ├── index.ts              # MCP entrypoint; dispatches to stdio or HTTP based on --transport
│   ├── cli.ts                # parseArgs() — pure CLI argument parser
│   ├── http_listener.ts      # node:http listener wrapping StreamableHTTPServerTransport
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
├── smoke.ts                  # scripted sanity test (24 sections, transport-parameterised)
└── smoke_cli.ts              # CLI / host / port fail-fast smoke runner

docs/
└── GUIDE.md                  # auto-generated; served at twinery://guide
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Launch the MCP server over stdio |
| `npm run smoke` | Run the full sanity test in both transports + CLI fail-fast paths |
| `npm run smoke:stdio` | Run the sanity test in stdio (in-process) only |
| `npm run smoke:http` | Run the sanity test against a spawned HTTP server |
| `npm run smoke:cli` | Run the CLI / host / port fail-fast checks only |
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
