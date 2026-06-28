import { z } from "zod";
import {
  requireActiveStory,
  setDirty,
  getVariableByName,
  shiftRecordsInPassage,
} from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";
import {
  validateVariableName,
  emitReader,
  findInsertOffsetBeforeTrailingLinks,
} from "../../twine/variables.js";

export const description =
  "Insert a format-correct reader expression for a declared variable into a passage. By default the reader lands immediately before the first trailing [[...]] link block so it renders inside the prose, not after the choices. Pass `offset` to place it at an exact character index.";

export const clarificationTriggers: string[] = [
  "variable not declared: ask declare_now | cancel.",
  "passage_name does not exist: ask which passage was meant (valid answers = existing passage names).",
];

export const example = {
  title: "Show the player's name in a greeting passage",
  input: { passage_name: "Greeting", name: "playerName" },
  note: "Emits e.g. $playerName (Harlowe) before any trailing links in Greeting.",
};

export const inputSchema = {
  passage_name: z.string().min(1),
  name: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const active = requireActiveStory();
  const { story, format } = active;

  const nameCheck = validateVariableName(args.name);
  if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };

  const variable = getVariableByName(args.name);
  if (variable === undefined) {
    return needClarification(
      "insert_variable_reader",
      args as Record<string, unknown>,
      `Variable "${args.name}" is not declared. Declare it now (no initial value), or cancel?`,
      {
        valid_answers: ["declare_now", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          if (answer === "declare_now") {
            const mod = await import("./declare_variable.js");
            const declared = await mod.handler({ name: args.name });
            if ((declared as { kind?: string }).kind === "error") return declared;
            return handler(args);
          }
          throw new Error(`Invalid answer: ${answer}`);
        },
      },
    );
  }

  const passage = story.getPassageByName(args.passage_name);
  if (passage === null) {
    const existing = story.passages.map((p) => p.name);
    return needClarification(
      "insert_variable_reader",
      args as Record<string, unknown>,
      `Passage "${args.passage_name}" does not exist. Which passage did you mean?`,
      {
        valid_answers: existing,
        free_text_allowed: true,
        replay: async (merged) => handler({ ...args, passage_name: String(merged.answer ?? "") }),
      },
    );
  }

  let offset: number;
  let placement: "before_trailing_links" | "appended" | "explicit_offset";
  if (args.offset !== undefined) {
    offset = Math.min(args.offset, passage.text.length);
    placement = "explicit_offset";
  } else {
    offset = findInsertOffsetBeforeTrailingLinks(format, passage.text);
    placement = offset === passage.text.length ? "appended" : "before_trailing_links";
  }

  const block = emitReader(format, args.name);
  passage.text = passage.text.slice(0, offset) + block + passage.text.slice(offset);
  shiftRecordsInPassage(args.passage_name, offset, block.length);
  variable.readers.push({ passageName: args.passage_name, offset, block });

  setDirty();

  return {
    kind: "ok",
    passage_name: args.passage_name,
    name: args.name,
    reader_block: block,
    offset,
    placement,
  };
}
