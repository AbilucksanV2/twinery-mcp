#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import * as createStory from "./tools/create_story.js";
import * as createPassage from "./tools/create_passage.js";
import * as linkPassages from "./tools/link_passages.js";
import * as renamePassage from "./tools/rename_passage.js";
import * as listPassages from "./tools/list_passages.js";
import * as saveStory from "./tools/save_story.js";
import * as respondToClarification from "./tools/respond_to_clarification.js";

interface ToolModule {
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

const tools: Array<{ name: string; description: string; mod: ToolModule }> = [
  {
    name: "create_story",
    description:
      "Initialise the single active story. Asks for the story format if omitted (no silent defaults). Auto-generates a spec-valid IFID.",
    mod: createStory as unknown as ToolModule,
  },
  {
    name: "create_passage",
    description:
      "Add a passage to the active story. Auto-positions when position is omitted. First passage becomes the start unless told otherwise.",
    mod: createPassage as unknown as ToolModule,
  },
  {
    name: "link_passages",
    description:
      "Insert a [[...]] link from one passage to another, using syntax appropriate to the story's declared format. Does not silently create missing passages.",
    mod: linkPassages as unknown as ToolModule,
  },
  {
    name: "rename_passage",
    description:
      "Rename a passage and rewrite every incoming link across the whole story atomically. Updates story.start if the renamed passage was the start.",
    mod: renamePassage as unknown as ToolModule,
  },
  {
    name: "list_passages",
    description:
      "Return the list of passages with their tags and outgoing links. Read-only.",
    mod: listPassages as unknown as ToolModule,
  },
  {
    name: "save_story",
    description:
      "Persist the active story as <story-slug>.twee (and, by default, a Twine 2 HTML wrapper) into a directory, plus an assets/<story-slug>/ subfolder.",
    mod: saveStory as unknown as ToolModule,
  },
  {
    name: "respond_to_clarification",
    description:
      "Resolve a previously-returned clarification_needed payload by providing the author's answer. The server replays the original tool call with the answer merged in.",
    mod: respondToClarification as unknown as ToolModule,
  },
];

async function toToolResponse(result: unknown): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  return { content: [{ type: "text", text }] };
}

export async function buildServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "twinery-mcp-poc",
    version: "0.0.1",
  });

  for (const t of tools) {
    const handler = async (args: unknown) => {
      try {
        const result = await t.mod.handler(args);
        return await toToolResponse(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ kind: "error", message }, null, 2) }],
          isError: true,
        };
      }
    };
    // MCP SDK's registerTool generics are strict; the schema shape and handler
    // are validated at runtime. Casting here keeps the POC loop-driven.
    (server.registerTool as unknown as (
      name: string,
      config: { description: string; inputSchema: Record<string, unknown> },
      cb: (args: unknown) => Promise<unknown>,
    ) => void)(
      t.name,
      { description: t.description, inputSchema: t.mod.inputSchema },
      handler,
    );
  }

  return server;
}

async function main(): Promise<void> {
  const server = await buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[twinery-mcp-poc] connected over stdio");
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[twinery-mcp-poc] fatal:", err);
    process.exit(1);
  });
}
