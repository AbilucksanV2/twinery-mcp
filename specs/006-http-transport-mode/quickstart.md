# Quickstart: HTTP Transport Mode

**Audience**: A maintainer who wants the connect-once dev loop, or an end
user who wants to run the Twinery MCP server as a long-lived HTTP service
instead of a per-session stdio process.

This doc mirrors what the README will document at v0.5 release time. The
working session inputs are the spec ([spec.md](./spec.md)), the plan
([plan.md](./plan.md)), and the CLI contract
([contracts/cli-flags.json](./contracts/cli-flags.json)).

---

## Default — stdio (unchanged)

After `npm install && npm run build`:

```bash
node dist/server/index.js
# → [twinery-mcp-poc] connected over stdio
```

MCP client config (Claude Desktop):

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

Identical to v0.4. Existing client configs keep working unchanged.

## HTTP (opt-in)

Start the server with `--transport http`:

```bash
node dist/server/index.js --transport http
# → [twinery-mcp-poc] listening on http://127.0.0.1:4173/mcp
```

MCP client config — for clients with native Streamable-HTTP support
(MCP Inspector, Cursor recent versions, claude.ai web Custom Connectors):

```json
{
  "mcpServers": {
    "twinery": {
      "url": "http://127.0.0.1:4173/mcp"
    }
  }
}
```

For Claude Desktop (which is stdio-only and ignores `url`), bridge through
the `mcp-remote` devDependency that ships with this repo:

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

`command` must be an absolute path to a Node ≥20.18.1 binary — Claude Desktop's
launchd-derived PATH does not see nvm/asdf installs. Don't go through `npx`;
its `env node` shebang re-introduces the wrong-Node bug. See README.md
"Claude Desktop — HTTP" for the full rationale.

Now the **dev-iteration loop** is one client connect away:

1. Edit any source file under `src/`.
2. `npm run build`.
3. Restart only the server (Ctrl+C the server process, re-run the command above).
4. Make a tool call from the same client window. The new behaviour is live.

No client restart, no `claude_desktop_config.json` reload, no spawning a
new node process per session.

### Custom port / host

```bash
# Pick a specific port
node dist/server/index.js --transport http --port 5500

# OS-assigned (useful for parallel test runs)
node dist/server/index.js --transport http --port 0
# → [twinery-mcp-poc] listening on http://127.0.0.1:51234/mcp
# → [twinery-mcp-poc] http port: 51234

# Bind beyond loopback (gets a warning banner)
node dist/server/index.js --transport http --host 0.0.0.0
# → [twinery-mcp-poc] listening on http://0.0.0.0:4173/mcp
# → [twinery-mcp-poc] WARNING: bound to 0.0.0.0 — reachable beyond loopback
```

### Failure modes

| What you typed | What happens |
|---|---|
| `--transport http2` | Exit 2; stderr: "--transport must be 'stdio' or 'http' (got 'http2')" |
| `--port abc` | Exit 2; stderr: "--port must be an integer 0–65535 (got 'abc')" |
| `--bogus` | Exit 2; stderr: "unknown flag: --bogus" plus help text |
| `--port <in use>` | Exit 1; stderr: "port N is already in use. Pass --port to choose another port." |
| `--help` | Exit 0; prints flag reference |

## Verifying

```bash
# Run the smoke test in both transports (default)
npm run smoke

# Or one at a time:
npm run smoke:stdio
npm run smoke:http
```

Each runs the same 24 functional checks against its transport. On success
you'll see "ALL SMOKE CHECKS PASSED ✓" twice (once per transport). The
combined run completes in under 60 seconds on a typical dev laptop.

## Choosing between stdio and HTTP

| Use stdio when | Use HTTP when |
|---|---|
| You're a regular user; the server starts when your client starts | You're a maintainer iterating on server code |
| You want the simplest config — no port, no host | You want one server process across many client sessions |
| Your client doesn't support HTTP MCP transports yet | You want to share one server with multiple local clients |

Rule of thumb: **stdio for users, HTTP for developers**. Both connect to
the same 15 tools, the same `twinery://guide` resource, and the same
clarification protocol. Tool behaviour is byte-equivalent modulo
timestamps and UUIDs (see [contracts/cli-flags.json](./contracts/cli-flags.json)
"tool_surface_contract").

## Where this goes next

This is the spec/plan stage. Implementation lives on a follow-up branch
(`007-implement-http-transport-mode` or similar). Until that ships, run
the v0.4 server normally (stdio only).
