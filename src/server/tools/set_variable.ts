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
  inferType,
  insertSetterIntoText,
  emitSetter,
  emitSetterExpression,
  insertExpressionSetterIntoText,
} from "../../twine/variables.js";

export const description =
  "Add or replace a setter for a declared variable inside a named passage. Idempotent within a passage — calling it twice for the same variable in the same passage overwrites the existing setter rather than stacking a second one. Pass expression:true to emit the value verbatim as a format-native expression (e.g. \"$cash + 100\") instead of a quoted literal — use it for computed values, or prefer adjust_variable for simple +/- changes.";

export const clarificationTriggers: string[] = [
  "variable not declared: ask declare_now | cancel.",
  "passage_name does not exist: ask which passage was meant (valid answers = existing passage names).",
];

export const example = {
  title: "Change the player's name when they pick it",
  input: { passage_name: "DecideName", name: "playerName", value: "Mira" },
  note: "For a computed value pass expression:true, e.g. { passage_name: \"Work\", name: \"cash\", value: \"$cash + 100\", expression: true }.",
};

export const inputSchema = {
  passage_name: z.string().min(1),
  name: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  expression: z.boolean().optional().describe(
    "When true, `value` (a string) is emitted verbatim as a format-native expression, not quoted. The caller must write it in the active format's syntax.",
  ),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const active = requireActiveStory();
  const { story, format } = active;

  const nameCheck = validateVariableName(args.name);
  if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };

  const isExpression = args.expression === true;
  if (isExpression && typeof args.value !== "string") {
    return { kind: "error", message: "When expression:true, `value` must be a string containing the expression." };
  }

  const variable = getVariableByName(args.name);
  if (variable === undefined) {
    return needClarification(
      "set_variable",
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
      "set_variable",
      args as Record<string, unknown>,
      `Passage "${args.passage_name}" does not exist. Which passage did you mean?`,
      {
        valid_answers: existing,
        free_text_allowed: true,
        replay: async (merged) => handler({ ...args, passage_name: String(merged.answer ?? "") }),
      },
    );
  }

  // Build the block once; literal setters quote the value, expression setters
  // emit it verbatim.
  const buildBlock = (): string =>
    isExpression
      ? emitSetterExpression(format, args.name, String(args.value))
      : emitSetter(format, args.name, args.value);

  const existingSetter = variable.setters.find((s) => s.passageName === args.passage_name);

  if (existingSetter !== undefined) {
    // Idempotent replace — swap the block in place at the recorded offset.
    const newBlock = buildBlock();
    const oldLen = existingSetter.block.length;
    passage.text =
      passage.text.slice(0, existingSetter.offset) +
      newBlock +
      passage.text.slice(existingSetter.offset + oldLen);
    shiftRecordsInPassage(args.passage_name, existingSetter.offset + oldLen, newBlock.length - oldLen);
    existingSetter.block = newBlock;
    existingSetter.value = args.value;
    if (!isExpression) refreshType(variable);
    setDirty();
    return {
      kind: "ok",
      passage_name: args.passage_name,
      name: args.name,
      value: args.value,
      action: "replaced",
      emitted_block: newBlock,
    };
  }

  // New setter for this passage.
  const ins = isExpression
    ? insertExpressionSetterIntoText(format, passage.text, args.name, String(args.value))
    : insertSetterIntoText(format, passage.text, args.name, args.value);
  shiftRecordsInPassage(args.passage_name, ins.offset, ins.block.length);
  passage.text = ins.text;
  variable.setters.push({
    passageName: args.passage_name,
    value: args.value,
    offset: ins.offset,
    block: ins.block,
  });
  if (!isExpression) refreshType(variable);
  setDirty();
  return {
    kind: "ok",
    passage_name: args.passage_name,
    name: args.name,
    value: args.value,
    action: "created",
    emitted_block: ins.block,
  };
}

/** Keep the declared type / initial value consistent with the Start setter. */
function refreshType(variable: { type: "string" | "number" | "boolean"; initialValue: string | number | boolean | null; setters: Array<{ passageName: string; value: string | number | boolean }> }): void {
  const { story } = requireActiveStory();
  const startSetter = variable.setters.find((s) => s.passageName === story.start);
  const source = startSetter ?? variable.setters[0];
  if (source !== undefined) {
    variable.type = inferType(source.value);
    if (variable.initialValue === null) variable.initialValue = source.value;
  }
}
