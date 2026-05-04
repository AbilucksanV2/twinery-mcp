import type { ZodRawShape } from "zod";

import * as createStory from "../server/tools/create_story.js";
import * as loadStory from "../server/tools/load_story.js";
import * as currentStoryInfo from "../server/tools/current_story_info.js";
import * as createPassage from "../server/tools/create_passage.js";
import * as updatePassage from "../server/tools/update_passage.js";
import * as renamePassage from "../server/tools/rename_passage.js";
import * as deletePassage from "../server/tools/delete_passage.js";
import * as linkPassages from "../server/tools/link_passages.js";
import * as setStartPassage from "../server/tools/set_start_passage.js";
import * as listPassages from "../server/tools/list_passages.js";
import * as getPassage from "../server/tools/get_passage.js";
import * as validateStory from "../server/tools/validate_story.js";
import * as saveStory from "../server/tools/save_story.js";
import * as respondToClarification from "../server/tools/respond_to_clarification.js";
import * as addImagePlaceholder from "../server/tools/add_image_placeholder.js";

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
  bind("load_story", loadStory as unknown as ToolModule),
  bind("current_story_info", currentStoryInfo as unknown as ToolModule),
  bind("create_passage", createPassage as unknown as ToolModule),
  bind("update_passage", updatePassage as unknown as ToolModule),
  bind("rename_passage", renamePassage as unknown as ToolModule),
  bind("delete_passage", deletePassage as unknown as ToolModule),
  bind("link_passages", linkPassages as unknown as ToolModule),
  bind("set_start_passage", setStartPassage as unknown as ToolModule),
  bind("list_passages", listPassages as unknown as ToolModule),
  bind("get_passage", getPassage as unknown as ToolModule),
  bind("validate_story", validateStory as unknown as ToolModule),
  bind("add_image_placeholder", addImagePlaceholder as unknown as ToolModule),
  bind("save_story", saveStory as unknown as ToolModule),
  bind("respond_to_clarification", respondToClarification as unknown as ToolModule),
];

export function getTool(name: string): ToolMetadata | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}
