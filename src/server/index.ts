#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TOOL_REGISTRY } from "../guide/registry.js";
import { buildGuide } from "../guide/build.js";
import { CliError, HelpRequested, HELP_TEXT, parseArgs } from "./cli.js";
import { startHttpServer } from "./http_listener.js";

const GUIDE_URI = "twinery://guide";
const GUIDE_FILE_PATH = resolve(process.cwd(), "docs/GUIDE.md");

async function toToolResponse(result: unknown): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  return { content: [{ type: "text", text }] };
}

async function readGuideContents(): Promise<string> {
  try {
    return await readFile(GUIDE_FILE_PATH, "utf8");
  } catch {
    // Fall back to generating on the fly if docs/GUIDE.md isn't present.
    return buildGuide();
  }
}

export async function buildServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "twinery-mcp-poc",
    version: "0.1.0",
  });

  for (const tool of TOOL_REGISTRY) {
    const wrappedHandler = async (args: unknown) => {
      try {
        const result = await tool.handler(args);
        return await toToolResponse(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ kind: "error", message }, null, 2) }],
          isError: true,
        };
      }
    };
    (server.registerTool as unknown as (
      name: string,
      config: { description: string; inputSchema: Record<string, unknown> },
      cb: (args: unknown) => Promise<unknown>,
    ) => void)(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      wrappedHandler,
    );
  }

  (server.registerResource as unknown as (
    name: string,
    uri: string,
    config: { description?: string; mimeType?: string },
    cb: (uri: URL) => Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>,
  ) => void)(
    "guide",
    GUIDE_URI,
    {
      description:
        "LLM-facing tool guide — describes every tool, when to use it, and the clarification protocol. Byte-identical to docs/GUIDE.md in the repo when that file is present.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const text = await readGuideContents();
      return {
        contents: [{ uri: uri.toString(), mimeType: "text/markdown", text }],
      };
    },
  );

  return server;
}

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof HelpRequested) {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (err instanceof CliError) {
      console.error(err.stderrMessage);
      if (err.includeHelp) {
        process.stderr.write(HELP_TEXT);
      }
      process.exit(2);
    }
    throw err;
  }

  if (cfg.transport === "stdio") {
    const server = await buildServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[twinery-mcp-poc] connected over stdio");
    return;
  }

  const requestedPort = cfg.port;
  const handle = await startHttpServer(buildServer, cfg);
  console.error(`[twinery-mcp-poc] listening on ${handle.url}`);
  if (requestedPort === 0) {
    console.error(`[twinery-mcp-poc] http port: ${handle.port}`);
  }
  if (cfg.host !== "127.0.0.1" && cfg.host !== "localhost") {
    console.error(`[twinery-mcp-poc] WARNING: bound to ${cfg.host} — reachable beyond loopback`);
  }

  const shutdown = async (): Promise<void> => {
    try {
      await handle.close();
      process.exit(0);
    } catch (err) {
      console.error("[twinery-mcp-poc] shutdown error:", err);
      process.exit(1);
    }
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[twinery-mcp-poc] fatal:", err);
    process.exit(1);
  });
}
