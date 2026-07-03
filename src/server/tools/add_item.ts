import { z } from "zod";
import { Story } from "extwee";
import { requireActiveStory, setDirty, shiftRecordsInPassage } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";
import { StoryFormat } from "../../twine/formats.js";
import {
  validateVariableName,
  supportsInventory,
  emitInventoryInit,
  emitInventoryAdd,
  insertBlockIntoText,
  findInsertOffsetBeforeTrailingLinks,
} from "../../twine/variables.js";

export const description =
  "Add an item to an inventory (an array-of-item-names variable) inside a passage — e.g. picking up a key. Auto-initialises the inventory to an empty array in the Start passage on first use. Emits the format-correct array push (SugarCube <<run $inv.push('key')>>, Harlowe (set: $inv to it + (a: 'key')), Snowman <% s.inv.push('key') %>). Gate links on inventory with insert_conditional_link using op \"has\"/\"lacks\". SugarCube/Harlowe/Snowman only (Chapbook mutates arrays via raw JS).";

export const clarificationTriggers: string[] = [
  "passage_name does not exist: ask which passage was meant.",
];

export const example = {
  title: "Pick up the brass key",
  input: { passage_name: "Vault", item: "brass key" },
  note: "Then gate a door: insert_conditional_link({ passage_name: \"Door\", conditions: [{name:\"inventory\", op:\"has\", value:\"brass key\"}], to_passage: \"Unlocked\" }).",
};

export const inputSchema = {
  passage_name: z.string().min(1),
  item: z.string().min(1),
  inventory_name: z.string().min(1).optional().describe("Inventory variable name. Default \"inventory\"."),
  offset: z.number().int().nonnegative().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

/**
 * Ensure the inventory array is initialised to empty in the Start passage.
 * Idempotent — detects an existing init line anywhere in the story first.
 */
export function ensureInventoryInitialized(story: Story, format: StoryFormat, name: string): void {
  const initBlock = emitInventoryInit(format, name);
  const initTrim = initBlock.trim();
  const already = story.passages.some((p) => p.text.includes(initTrim));
  if (already) return;
  const startName = story.start;
  const start = startName === "" ? null : story.getPassageByName(startName);
  if (start === null) return;
  const ins = insertBlockIntoText(format, start.text, initBlock);
  shiftRecordsInPassage(startName, ins.offset, ins.block.length);
  start.text = ins.text;
}

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { story, format } = requireActiveStory();

  const nameCheck = validateVariableName(args.inventory_name ?? "inventory");
  if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };
  const inv = args.inventory_name ?? "inventory";

  if (!supportsInventory(format)) {
    return {
      kind: "error",
      message: `Chapbook mutates arrays only via raw JavaScript, so the inventory tools don't support it. Use a [JavaScript] modifier with engine.state.get('${inv}').push(...), or track items as individual boolean flags with declare_variable/set_variable.`,
    };
  }

  const passage = story.getPassageByName(args.passage_name);
  if (passage === null) {
    const existing = story.passages.map((p) => p.name);
    return needClarification(
      "add_item",
      args as Record<string, unknown>,
      `Passage "${args.passage_name}" does not exist. Which passage did you mean?`,
      {
        valid_answers: existing,
        free_text_allowed: true,
        replay: async (merged) => handler({ ...args, passage_name: String(merged.answer ?? "") }),
      },
    );
  }

  ensureInventoryInitialized(story, format, inv);

  const block = emitInventoryAdd(format, inv, args.item);
  const offset = args.offset !== undefined
    ? Math.min(args.offset, passage.text.length)
    : findInsertOffsetBeforeTrailingLinks(format, passage.text);
  passage.text = passage.text.slice(0, offset) + block + passage.text.slice(offset);
  shiftRecordsInPassage(args.passage_name, offset, block.length);
  setDirty();

  return {
    kind: "ok",
    passage_name: args.passage_name,
    inventory: inv,
    item: args.item,
    emitted_block: block,
    offset,
  };
}
