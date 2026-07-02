import { z } from "zod";
import { requireActiveStory, setDirty, getVariableByName, shiftRecordsInPassage } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";
import {
  validateVariableName,
  renderCondition,
  emitConditionalBlock,
  findInsertOffsetBeforeTrailingLinks,
  Condition,
} from "../../twine/variables.js";

export const description =
  "Insert a format-correct conditional block into a passage — content that renders only when a variable test passes (with an optional else branch). Conditions are structured ({name, op, value}) and rendered into the active format's dialect (SugarCube <<if>>, Harlowe (if:)[…], Chapbook [if]…[continue], Snowman <% if(){} %>), so you never hand-write macro syntax. Use it for state-gated text, day/location event triggers, or wrapping a setter for a clock rollover.";

export const clarificationTriggers: string[] = [
  "passage_name does not exist: ask which passage was meant (valid answers = existing passage names).",
  "a referenced variable is not declared: returns a recoverable error naming it (declare_variable then retry).",
];

export const example = {
  title: "Show an exam event only on day 2 at the school",
  input: {
    passage_name: "School",
    conditions: [{ name: "day", op: "eq", value: 2 }],
    then_text: "A proctor waves you toward the exam hall.\n[[Take the exam->Exam]]",
  },
  note: "Multiple conditions join with `join` (default \"and\"): [{name:\"intelligence\",op:\"gt\",value:1},{name:\"attendedSchool\",op:\"truthy\"}].",
};

const conditionSchema = z.object({
  name: z.string().min(1),
  op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "truthy", "falsy"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const inputSchema = {
  passage_name: z.string().min(1),
  conditions: z.array(conditionSchema).min(1),
  join: z.enum(["and", "or"]).optional().describe("How to combine multiple conditions. Default \"and\"."),
  then_text: z.string().min(1).describe("Content rendered when the condition holds (may contain links / setters)."),
  else_text: z.string().optional().describe("Optional content rendered when the condition fails."),
  offset: z.number().int().nonnegative().optional().describe("Explicit character offset; defaults to before the first trailing [[...]] link block."),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export function checkConditions(conditions: Condition[]): { kind: "error"; message: string } | null {
  const undeclared: string[] = [];
  for (const c of conditions) {
    const nameCheck = validateVariableName(c.name);
    if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };
    if (c.op !== "truthy" && c.op !== "falsy" && c.value === undefined) {
      return { kind: "error", message: `Condition on "${c.name}" uses op "${c.op}" but has no value.` };
    }
    if (getVariableByName(c.name) === undefined) undeclared.push(c.name);
  }
  if (undeclared.length > 0) {
    return {
      kind: "error",
      message: `Condition references undeclared variable(s): ${undeclared.join(", ")}. Call declare_variable first, then retry.`,
    };
  }
  return null;
}

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { story, format } = requireActiveStory();

  const condError = checkConditions(args.conditions as Condition[]);
  if (condError !== null) return condError;

  const passage = story.getPassageByName(args.passage_name);
  if (passage === null) {
    const existing = story.passages.map((p) => p.name);
    return needClarification(
      "insert_conditional",
      args as Record<string, unknown>,
      `Passage "${args.passage_name}" does not exist. Which passage did you mean?`,
      {
        valid_answers: existing,
        free_text_allowed: true,
        replay: async (merged) => handler({ ...args, passage_name: String(merged.answer ?? "") }),
      },
    );
  }

  const condition = renderCondition(format, args.conditions as Condition[], args.join ?? "and");
  const block = emitConditionalBlock(format, condition, args.then_text, args.else_text);

  let offset: number;
  let placement: "before_trailing_links" | "appended" | "explicit_offset";
  if (args.offset !== undefined) {
    offset = Math.min(args.offset, passage.text.length);
    placement = "explicit_offset";
  } else {
    offset = findInsertOffsetBeforeTrailingLinks(format, passage.text);
    placement = offset === passage.text.length ? "appended" : "before_trailing_links";
  }

  passage.text = passage.text.slice(0, offset) + block + passage.text.slice(offset);
  shiftRecordsInPassage(args.passage_name, offset, block.length);
  setDirty();

  return {
    kind: "ok",
    passage_name: args.passage_name,
    condition,
    emitted_block: block,
    offset,
    placement,
    has_else: args.else_text !== undefined && args.else_text !== "",
  };
}
