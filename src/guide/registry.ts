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
import * as declareVariable from "../server/tools/declare_variable.js";
import * as readVariable from "../server/tools/read_variable.js";
import * as insertVariableReader from "../server/tools/insert_variable_reader.js";
import * as setVariable from "../server/tools/set_variable.js";
import * as adjustVariable from "../server/tools/adjust_variable.js";
import * as insertConditional from "../server/tools/insert_conditional.js";
import * as insertConditionalLink from "../server/tools/insert_conditional_link.js";
import * as setStatBlock from "../server/tools/set_stat_block.js";
import * as addWidget from "../server/tools/add_widget.js";
import * as addItem from "../server/tools/add_item.js";
import * as removeItem from "../server/tools/remove_item.js";
import * as listVariables from "../server/tools/list_variables.js";
import * as deleteVariable from "../server/tools/delete_variable.js";

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
  bind("declare_variable", declareVariable as unknown as ToolModule),
  bind("read_variable", readVariable as unknown as ToolModule),
  bind("insert_variable_reader", insertVariableReader as unknown as ToolModule),
  bind("set_variable", setVariable as unknown as ToolModule),
  bind("adjust_variable", adjustVariable as unknown as ToolModule),
  bind("insert_conditional", insertConditional as unknown as ToolModule),
  bind("insert_conditional_link", insertConditionalLink as unknown as ToolModule),
  bind("set_stat_block", setStatBlock as unknown as ToolModule),
  bind("add_widget", addWidget as unknown as ToolModule),
  bind("add_item", addItem as unknown as ToolModule),
  bind("remove_item", removeItem as unknown as ToolModule),
  bind("list_variables", listVariables as unknown as ToolModule),
  bind("delete_variable", deleteVariable as unknown as ToolModule),
  bind("save_story", saveStory as unknown as ToolModule),
  bind("respond_to_clarification", respondToClarification as unknown as ToolModule),
];

export function getTool(name: string): ToolMetadata | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}
