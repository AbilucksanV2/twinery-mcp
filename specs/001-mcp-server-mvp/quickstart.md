# Quickstart: Twinery MCP Server v1.0

**Audience**: A maintainer or end user who wants to go from zero to a playable
branching Twine story, driven by an MCP client, in under 15 minutes.

This quickstart mirrors the steps the README will document at release time, but
with enough detail for test automation (US1, US5) to track against. The prose
README is derived from this file and kept in sync per FR-009.

---

## Prerequisites

- **Node.js 20 LTS** (or any active LTS line) on Windows 10/11, macOS 13+, or
  a current Linux distribution.
- An MCP-compliant client configured for stdio servers. Known-good at v1.0:
  - Claude Desktop
  - VS Code with an MCP-capable extension
  - Any client implementing the MCP 2024-11-05 spec or later
- Optional, for round-trip verification: the native Twine 2 editor
  (`twinery.org/2` or the desktop/mobile app of matching version).

Nothing else — no additional runtimes, no system-wide installs, no Tweego.

## Install

### macOS / Linux (bash)

```bash
# from the repo root
./scripts/bash/install.sh
```

### Windows (PowerShell)

```powershell
# from the repo root
./scripts/powershell/install.ps1
```

Either script:
1. Verifies Node.js 20+ is on `PATH`.
2. Runs `npm ci` (first-time) or `npm install`.
3. Prints the ready-to-paste MCP client config snippet.

If you installed `@twinery/mcp-server` from npm instead of cloning, skip the
scripts — the `npx -y @twinery/mcp-server` invocation in the client config
handles everything.

## Configure your MCP client

Add one server entry to the client's MCP config. Example (Claude Desktop /
`claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "twinery": {
      "command": "npx",
      "args": ["-y", "@twinery/mcp-server"]
    }
  }
}
```

That's the full integration surface. **No code changes. No adapters.** (FR-011
and SC-007: exactly 1 config entry, 0 code changes.)

## First session: build a 3-passage branching story

In any MCP client session with the `twinery` server attached:

> "Make a very short branching story about a locked door. Two choices: pick the
> lock, or kick the door. Save it to `./stories/locked-door/`."

The LLM will (roughly) call the tools below. Exact sequencing may vary but each
call's contract is in [contracts/](./contracts/).

1. `create_story({ name: "Locked Door", format: "Harlowe" })`
2. `create_passage({ name: "Start", text: "You stand before a locked door.", set_as_start: true })`
3. `create_passage({ name: "Pick Lock", text: "You pick the lock and slip through." })`
4. `create_passage({ name: "Kick Door", text: "You kick it open with a splinter of wood." })`
5. `link_passages({ from_passage: "Start", to_passage: "Pick Lock", display_text: "Try to pick it" })`
6. `link_passages({ from_passage: "Start", to_passage: "Kick Door", display_text: "Kick it down" })`
7. `save_story({ output_dir: "./stories/locked-door" })`

Result on disk:

```text
stories/locked-door/
├── locked-door.twee
├── locked-door.html
└── assets/locked-door/        # empty; ready for images
```

Open `locked-door.html` in any browser → the Start passage renders with two
choice links. Click either → reach the corresponding passage. **US1 acceptance
scenarios 1–3 satisfied.**

Open the same file in the Twine 2 editor → the graph appears with all three
passages and two edges. **US1 scenario 3 satisfied.**

## Exercise the clarification flow (US2)

Ask the LLM to "add a passage" without specifying details, e.g.:

> "Add a passage here."

Tool call: `create_passage({})`
Server response (on a client without elicitation): `kind: "clarification_needed"`
with a question prompting the LLM to ask the author for the passage name. The
LLM relays the question, the author answers, and the LLM calls
`respond_to_clarification` to resume.

On a client with elicitation, the question pops up in the client UI directly;
the author answers inline; the tool resumes without a second LLM turn.

Either way: **zero silent defaults**. US2 and SC-004 satisfied.

## Add an image placeholder (US3)

> "In the Pick Lock passage, add a picture of the lock mechanism. Call it 'brass-lock'."

Tool call: `add_image_placeholder({ passage_name: "Pick Lock", label: "brass-lock" })`
Server response:

```json
{
  "kind": "ok",
  "placeholder": { "label": "brass-lock", "passage_name": "Pick Lock" },
  "expected_filename": "brass-lock.png",
  "expected_path": "stories/locked-door/assets/locked-door/brass-lock.png",
  "path_is_final": true
}
```

Before dropping the file, reload the HTML → the passage shows a dashed-border
box labeled "brass-lock" (US3 scenario 3). Drop a PNG at the reported path →
reload → the image renders inline (US3 scenario 2).

## Test the drift gate (US4)

Try to export a fake release by adding a tool to `src/guide/registry.ts` and
running `npm test`. The `guide-drift` contract test fails until `docs/GUIDE.md`
is regenerated and `README.md` is updated to mention the new tool. **US4 + FR-
009 satisfied.**

## Cross-platform verification (US5)

Repeat the install + first-session steps on Windows, macOS, and Linux. Each
platform's script is in the matching `scripts/<shell>/` folder. No script
edits should be needed. **US5 + SC-005 satisfied.**

## What to read next

- [spec.md](./spec.md) — user stories, requirements, success criteria.
- [plan.md](./plan.md) — technical context and constitution check.
- [contracts/README.md](./contracts/README.md) — every tool + resource contract.
- [data-model.md](./data-model.md) — entity shapes.
- `docs/GUIDE.md` (created at implementation time) — the LLM-facing guide.
