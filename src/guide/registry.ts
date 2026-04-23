import type { ZodRawShape } from "zod";

import * as createStory from "../server/tools/create_story.js";
import * as createPassage from "../server/tools/create_passage.js";
import * as linkPassages from "../server/tools/link_passages.js";
import * as renamePassage from "../server/tools/rename_passage.js";
import * as listPassages from "../server/tools/list_passages.js";
import * as saveStory from "../server/tools/save_story.js";
import * as respondToClarification from "../server/tools/respond_to_clarification.js";

export interface ToolExample {
  title: string;
  input: Record<string, unknown>;
  note?: string;
}

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  clarificationTriggers: string[];
  example: ToolExample;
  handler: (args: unknown) => Promise<unknown>;
}

interface ToolModule {
  inputSchema: ZodRawShape;
  description: string;
  clarificationTriggers: string[];
  example: ToolExample;
  handler: (args: unknown) => Promise<unknown>;
}

function bind(name: string, mod: ToolModule): ToolMetadata {
  return {
    name,
    description: mod.description,
    inputSchema: mod.inputSchema,
    clarificationTriggers: mod.clarificationTriggers,
    example: mod.example,
    handler: mod.handler,
  };
}

export const TOOL_REGISTRY: ToolMetadata[] = [
  bind("create_story", createStory as unknown as ToolModule),
  bind("create_passage", createPassage as unknown as ToolModule),
  bind("link_passages", linkPassages as unknown as ToolModule),
  bind("rename_passage", renamePassage as unknown as ToolModule),
  bind("list_passages", listPassages as unknown as ToolModule),
  bind("save_story", saveStory as unknown as ToolModule),
  bind("respond_to_clarification", respondToClarification as unknown as ToolModule),
];

export function getTool(name: string): ToolMetadata | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}
