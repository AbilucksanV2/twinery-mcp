import { spawn } from "node:child_process";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SERVER_PATH = resolve(process.cwd(), "dist/server/index.js");

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}
function section(title: string): void {
  console.log(`\n${title}`);
}

interface SpawnResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

async function runToCompletion(args: string[]): Promise<SpawnResult> {
  return new Promise((resolveFn) => {
    const child = spawn(process.execPath, [SERVER_PATH, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => { stdout += c.toString(); });
    child.stderr?.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.once("exit", (code, signal) => {
      resolveFn({ exitCode: code, signal, stdout, stderr });
    });
  });
}

interface RunningServer {
  port: number;
  stderr: () => string;
  kill: () => Promise<void>;
}

async function spawnServerAndAwaitListen(args: string[], opts: { expectPort?: number } = {}): Promise<RunningServer> {
  const child = spawn(process.execPath, [SERVER_PATH, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.stdout === null || child.stderr === null) {
    throw new Error("expected piped stdout/stderr");
  }
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stderrBuf = "";
  const port = await new Promise<number>((resolveFn, rejectFn) => {
    const onData = (chunk: string): void => {
      stderrBuf += chunk;
      // either listening on http://host:port/mcp gives us the port directly,
      // or http port: <n> resolves an OS-assigned one.
      const explicit = stderrBuf.match(/\[twinery-mcp-poc\] http port: (\d+)/);
      if (explicit) {
        child.stderr!.removeListener("data", onData);
        resolveFn(Number.parseInt(explicit[1]!, 10));
        return;
      }
      const listen = stderrBuf.match(/\[twinery-mcp-poc\] listening on http:\/\/[^:]+:(\d+)\/mcp/);
      if (listen && opts.expectPort !== 0) {
        // wait a tick for any follow-on banners (warning, http port: N) before resolving
        setTimeout(() => {
          child.stderr!.removeListener("data", onData);
          resolveFn(Number.parseInt(listen[1]!, 10));
        }, 50);
      }
    };
    child.stderr!.on("data", onData);
    child.once("exit", (code) => {
      rejectFn(new Error(`server exited before listening (code=${code ?? "null"})\nstderr: ${stderrBuf}`));
    });
    setTimeout(() => {
      child.stderr!.removeListener("data", onData);
      rejectFn(new Error(`timeout waiting for listen banner\nstderr so far: ${stderrBuf}`));
    }, 5000);
  });

  // keep accumulating stderr for later assertions
  child.stderr.on("data", (chunk: string) => { stderrBuf += chunk; });

  const kill = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolveFn) => {
      const t = setTimeout(() => {
        child.kill("SIGKILL");
        resolveFn();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(t);
        resolveFn();
      });
    });
  };

  return { port, stderr: () => stderrBuf, kill };
}

async function findFreePort(): Promise<number> {
  return new Promise((resolveFn, rejectFn) => {
    const srv = createNetServer();
    srv.unref();
    srv.on("error", rejectFn);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as AddressInfo;
      const port = addr.port;
      srv.close(() => resolveFn(port));
    });
  });
}

async function callListToolsOnce(port: number): Promise<string[]> {
  const url = new URL(`http://127.0.0.1:${port}/mcp`);
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: "twinery-mcp-cli-smoke", version: "0.5.0" });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    return result.tools.map((t) => t.name);
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

async function main(): Promise<void> {
  console.log("Twinery MCP POC — CLI / host / port smoke\n=========================================");

  // T011 — explicit --port works and an HTTP client can connect
  section("T011. --port <free> binds the requested port and serves tools/list");
  const explicitPort = await findFreePort();
  const s11 = await spawnServerAndAwaitListen(["--transport", "http", "--port", String(explicitPort)], { expectPort: explicitPort });
  try {
    if (s11.port !== explicitPort) fail(`expected bound port ${explicitPort}, got ${s11.port}`);
    const expectedBanner = `[twinery-mcp-poc] listening on http://127.0.0.1:${explicitPort}/mcp`;
    if (!s11.stderr().includes(expectedBanner)) fail(`missing exact banner; stderr was:\n${s11.stderr()}`);
    ok(`banner verbatim: ${expectedBanner}`);
    const names = await callListToolsOnce(s11.port);
    if (names.length !== 24) fail(`expected 24 tools via HTTP, got ${names.length}`);
    ok(`HTTP client got ${names.length} tools at port ${s11.port}`);
  } finally {
    await s11.kill();
  }

  // T011b — sequential clients against the same server (Claude Desktop / mcp-remote reconnect path)
  section("T011b. Sequential clients can both initialize against one long-lived server");
  const seqPort = await findFreePort();
  const seqServer = await spawnServerAndAwaitListen(["--transport", "http", "--port", String(seqPort)], { expectPort: seqPort });
  try {
    const namesA = await callListToolsOnce(seqServer.port);
    if (namesA.length !== 24) fail(`first client: expected 24 tools, got ${namesA.length}`);
    ok(`first client got ${namesA.length} tools`);
    const namesB = await callListToolsOnce(seqServer.port);
    if (namesB.length !== 24) fail(`second client (reconnect): expected 24 tools, got ${namesB.length}`);
    ok(`second client (simulating Claude Desktop reconnect / mcp-remote restart) got ${namesB.length} tools`);
  } finally {
    await seqServer.kill();
  }

  // T012 — --host 0.0.0.0 emits the non-loopback warning verbatim
  section("T012. --host 0.0.0.0 --port 0 emits the non-loopback warning and serves on loopback");
  const s12 = await spawnServerAndAwaitListen(["--transport", "http", "--host", "0.0.0.0", "--port", "0"], { expectPort: 0 });
  try {
    // give the warning + http-port banner time to flush
    await new Promise((resolveFn) => setTimeout(resolveFn, 100));
    const expectedListen = `[twinery-mcp-poc] listening on http://0.0.0.0:${s12.port}/mcp`;
    const expectedResolved = `[twinery-mcp-poc] http port: ${s12.port}`;
    const expectedWarn = `[twinery-mcp-poc] WARNING: bound to 0.0.0.0 — reachable beyond loopback`;
    const stderr = s12.stderr();
    if (!stderr.includes(expectedListen)) fail(`missing listen banner; stderr was:\n${stderr}`);
    if (!stderr.includes(expectedResolved)) fail(`missing resolved-port banner; stderr was:\n${stderr}`);
    if (!stderr.includes(expectedWarn)) fail(`missing non-loopback warning verbatim; stderr was:\n${stderr}`);
    ok(`listen banner present`);
    ok(`resolved-port banner present`);
    ok(`warning verbatim: ${expectedWarn}`);
    const names = await callListToolsOnce(s12.port); // loopback connection still works
    if (names.length !== 24) fail(`expected 24 tools via loopback after 0.0.0.0 bind, got ${names.length}`);
    ok(`loopback HTTP client got ${names.length} tools`);
  } finally {
    await s12.kill();
  }

  // T013 — second server on same explicit port exits 1 with port_in_use
  section("T013. EADDRINUSE — second server on same port exits 1 with the contracted message");
  const collidePort = await findFreePort();
  const first = await spawnServerAndAwaitListen(["--transport", "http", "--port", String(collidePort)], { expectPort: collidePort });
  try {
    const second = await runToCompletion(["--transport", "http", "--port", String(collidePort)]);
    if (second.exitCode !== 1) fail(`expected exit 1, got ${second.exitCode} (signal=${second.signal ?? "null"})`);
    const expected = `[twinery-mcp-poc] port ${collidePort} is already in use. Pass --port to choose another port.`;
    if (!second.stderr.includes(expected)) fail(`missing port_in_use line; stderr was:\n${second.stderr}`);
    ok(`exit 1 + verbatim: ${expected}`);
  } finally {
    await first.kill();
  }

  // T013b — stale session id (server restart simulation) returns 404 not 400
  section("T013b. POST with unknown mcp-session-id returns 404 (post-restart recovery signal)");
  const sessPort = await findFreePort();
  const sessServer = await spawnServerAndAwaitListen(["--transport", "http", "--port", String(sessPort)], { expectPort: sessPort });
  try {
    // Bogus session id, non-initialize body → expect 404.
    const stale = await fetch(`http://127.0.0.1:${sessPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        "mcp-session-id": "00000000-0000-0000-0000-000000000000",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    if (stale.status !== 404) fail(`stale session id: expected 404, got ${stale.status}`);
    const staleBody = await stale.json() as { error?: { message?: string } };
    if (!(staleBody.error?.message ?? "").toLowerCase().includes("session")) {
      fail(`stale session id: response body should mention session; got ${JSON.stringify(staleBody)}`);
    }
    ok(`stale session id → 404 + JSON-RPC error referencing session`);

    // No session id, non-initialize body → expect 400 (existing behavior preserved).
    const missing = await fetch(`http://127.0.0.1:${sessPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    if (missing.status !== 400) fail(`missing session id: expected 400, got ${missing.status}`);
    ok(`missing session id (no header) → 400 (existing behavior preserved)`);
  } finally {
    await sessServer.kill();
  }

  // T014 — invalid --transport variants
  section("T014. Invalid --transport values exit 2 with the invalid_transport message");
  for (const value of ["bogus", "http2", ""]) {
    const r = await runToCompletion(["--transport", value]);
    if (r.exitCode !== 2) fail(`--transport "${value}": expected exit 2, got ${r.exitCode}`);
    const expected = `[twinery-mcp-poc] --transport must be 'stdio' or 'http' (got '${value}')`;
    if (!r.stderr.includes(expected)) fail(`--transport "${value}": missing expected line; stderr was:\n${r.stderr}`);
    ok(`--transport "${value}" → exit 2 + invalid_transport`);
  }
  const missingTransport = await runToCompletion(["--transport"]);
  if (missingTransport.exitCode !== 2) fail(`--transport (no value): expected exit 2, got ${missingTransport.exitCode}`);
  if (!missingTransport.stderr.includes("[twinery-mcp-poc] --transport must be 'stdio' or 'http' (got '')")) {
    fail(`--transport (no value): missing line; stderr was:\n${missingTransport.stderr}`);
  }
  ok(`--transport (no value) → exit 2 + invalid_transport with empty value`);

  // T015 — invalid --port and missing --host value
  section("T015. Invalid --port and missing --host value");
  for (const value of ["abc", "-1", "99999"]) {
    const r = await runToCompletion(["--transport", "http", "--port", value]);
    if (r.exitCode !== 2) fail(`--port ${value}: expected exit 2, got ${r.exitCode}`);
    const expected = `[twinery-mcp-poc] --port must be an integer 0–65535 (got '${value}')`;
    if (!r.stderr.includes(expected)) fail(`--port ${value}: missing expected line; stderr was:\n${r.stderr}`);
    ok(`--port ${value} → exit 2 + invalid_port`);
  }
  const missingHost = await runToCompletion(["--transport", "http", "--host"]);
  if (missingHost.exitCode !== 2) fail(`--host (no value): expected exit 2, got ${missingHost.exitCode}`);
  if (!missingHost.stderr.includes("[twinery-mcp-poc] --host requires a value")) {
    fail(`--host (no value): missing line; stderr was:\n${missingHost.stderr}`);
  }
  ok(`--host (no value) → exit 2 + missing_host_value`);

  // T016 — unknown flag and --help
  section("T016. Unknown flag exits 2 with help; --help alone exits 0 with help");
  const unk = await runToCompletion(["--bogus"]);
  if (unk.exitCode !== 2) fail(`--bogus: expected exit 2, got ${unk.exitCode}`);
  if (!unk.stderr.includes("[twinery-mcp-poc] unknown flag: --bogus")) {
    fail(`--bogus: missing unknown_flag line; stderr was:\n${unk.stderr}`);
  }
  if (!unk.stderr.includes("twinery-mcp-poc [OPTIONS]")) {
    fail(`--bogus: stderr should include help text; got:\n${unk.stderr}`);
  }
  ok(`--bogus → exit 2 + unknown_flag + help text`);

  const help = await runToCompletion(["--help"]);
  if (help.exitCode !== 0) fail(`--help: expected exit 0, got ${help.exitCode}\nstderr: ${help.stderr}\nstdout: ${help.stdout}`);
  if (!help.stdout.includes("twinery-mcp-poc [OPTIONS]")) fail(`--help: missing help title in stdout; got:\n${help.stdout}`);
  if (!help.stdout.includes("--transport <stdio|http>")) fail(`--help: missing --transport line in stdout`);
  ok(`--help → exit 0 + help text on stdout`);

  console.log("\n=========================================");
  console.log("ALL CLI / HOST / PORT SMOKE CHECKS PASSED ✓");
}

main().catch((err) => {
  console.error("\nCLI SMOKE FAILED:", err);
  process.exit(1);
});
