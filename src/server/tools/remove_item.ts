import { z } from "zod";
import { requireActiveStory, setDirty, shiftRecordsInPassage } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";
import {
  validateVariableName,
  supportsInventory,
  emitInventoryRemove,
  findInsertOffsetBeforeTrailingLinks,
} from "../../twine/variables.js";
import { ensureInventoryInitialized } from "./add_item.js";

export const description =
  "Remove an item from an inventory array inside a passage — e.g. using a key. Emits the format-correct array removal (SugarCube <<run $inv.delete('key')>>, Harlowe (set: $inv to it - (a: 'key')), Snowman <% s.inv = _.without(s.inv, 'key') %>). SugarCube/Harlowe/Snowman only.";

export const clarificationTriggers: string[] = [
  "passage_name does not exist: ask which passage was meant.",
];

export const example = {
  title: "Consume the key when the door opens",
  input: { passage_name: "Unlocked", item: "brass key" },
};

export const inputSchema = {
  passage_name: z.string().min(1),
  item: z.string().min(1),
  inventory_name: z.string().min(1).optional(),
  offset: z.number().int().nonnegative().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { story, format } = requireActiveStory();

  const nameCheck = validateVariableName(args.inventory_name ?? "inventory");
  if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };
  const inv = args.inventory_name ?? "inventory";

  if (!supportsInventory(format)) {
    return {
      kind: "error",
      message: `Chapbook mutates arrays only via raw JavaScript. Use a [JavaScript] modifier with engine.state, or track items as boolean flags.`,
    };
  }

  const passage = story.getPassageByName(args.passage_name);
  if (passage === null) {
    const existing = story.passages.map((p) => p.name);
    return needClarification(
      "remove_item",
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

  const block = emitInventoryRemove(format, inv, args.item);
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
