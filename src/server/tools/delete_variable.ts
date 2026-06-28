import { z } from "zod";
import {
  requireActiveStory,
  setDirty,
  getVariableByName,
  removeVariableByName,
  shiftRecordsInPassage,
} from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";
import { validateVariableName } from "../../twine/variables.js";
import * as saveStory from "./save_story.js";

export const description =
  "Atomically remove every setter and every reader for a named variable from the active story's passage text, then drop it from the registry. Honors the unsaved-changes guard from feature 010 (pass discard_unsaved: true to override).";

export const clarificationTriggers: string[] = [
  "active story has unsaved changes AND discard_unsaved is not set: ask save_first | discard_unsaved | cancel.",
  "variable not declared: returns a recoverable error (not a clarification).",
];

export const example = {
  title: "Remove a variable that's no longer needed",
  input: { name: "playerName" },
};

export const inputSchema = {
  name: z.string().min(1),
  discard_unsaved: z.boolean().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const active = requireActiveStory();
  const { story } = active;

  const nameCheck = validateVariableName(args.name);
  if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };

  const variable = getVariableByName(args.name);
  if (variable === undefined) {
    return {
      kind: "error",
      message: `Variable "${args.name}" is not declared. Use list_variables to see what exists.`,
    };
  }

  // Dirty guard — match load_story / create_story (feature 010).
  if (active.dirty && args.discard_unsaved !== true) {
    return needClarification(
      "delete_variable",
      args as Record<string, unknown>,
      `The active story "${story.name}" has unsaved changes. Save first, discard them, or cancel?`,
      {
        valid_answers: ["save_first", "discard_unsaved", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          if (answer === "save_first") {
            const saveResult = await saveStory.handler({});
            if ((saveResult as { kind?: string }).kind === "clarification_needed") return saveResult;
            return handler(args);
          }
          return handler({ ...args, discard_unsaved: true });
        },
      },
    );
  }

  const settersRemoved = variable.setters.length;
  const readersRemoved = variable.readers.length;

  // Group this variable's records by passage; splice each in descending offset
  // order so earlier offsets stay valid, shifting sibling records as we go.
  const byPassage = new Map<string, Array<{ offset: number; block: string }>>();
  for (const rec of [...variable.setters, ...variable.readers]) {
    const list = byPassage.get(rec.passageName) ?? [];
    list.push({ offset: rec.offset, block: rec.block });
    byPassage.set(rec.passageName, list);
  }

  const affected: string[] = [];
  for (const [passageName, recs] of byPassage) {
    const passage = story.getPassageByName(passageName);
    if (passage === null) continue; // passage already gone
    recs.sort((a, b) => b.offset - a.offset);
    for (const rec of recs) {
      passage.text =
        passage.text.slice(0, rec.offset) + passage.text.slice(rec.offset + rec.block.length);
      shiftRecordsInPassage(passageName, rec.offset + rec.block.length, -rec.block.length);
    }
    affected.push(passageName);
  }

  removeVariableByName(args.name);
  setDirty();

  return {
    kind: "ok",
    name: args.name,
    setters_removed: settersRemoved,
    readers_removed: readersRemoved,
    affected_passages: affected,
  };
}
