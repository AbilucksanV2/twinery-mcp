import { z } from "zod";
import { requireActiveStory, setDirty, shiftRecordsInPassage } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";
import { linkSyntaxFor } from "../../twine/formats.js";
import {
  renderCondition,
  emitConditionalBlock,
  findInsertOffsetBeforeTrailingLinks,
  Condition,
} from "../../twine/variables.js";
import { checkConditions } from "./insert_conditional.js";

export const description =
  "Insert a link that only appears when a variable test passes — the state-gated choice pattern (e.g. show the \"Take the exam\" option only when intelligence > 1 and the player attended school). Emits a format-correct conditional wrapping a [[...]] link, so the graph still sees the edge. Provide else_text to show a disabled/explanatory line when the condition fails.";

export const clarificationTriggers: string[] = [
  "passage_name does not exist: ask which passage was meant.",
  "to_passage does not exist: ask create_empty | cancel (parity with link_passages).",
  "a referenced variable is not declared: returns a recoverable error naming it.",
];

export const example = {
  title: "Only offer the exam pass when the player is ready",
  input: {
    passage_name: "Exam",
    conditions: [
      { name: "intelligence", op: "gt", value: 1 },
      { name: "attendedSchool", op: "truthy" },
    ],
    to_passage: "ExamPass",
    display_text: "Answer confidently",
    else_text: "You are not prepared enough to pass.",
  },
};

const conditionSchema = z.object({
  name: z.string().min(1),
  op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "truthy", "falsy", "has", "lacks"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const inputSchema = {
  passage_name: z.string().min(1),
  conditions: z.array(conditionSchema).min(1),
  join: z.enum(["and", "or"]).optional(),
  to_passage: z.string().min(1),
  display_text: z.string().optional(),
  else_text: z.string().optional().describe("Optional line shown when the condition fails (visible-but-inert)."),
  offset: z.number().int().nonnegative().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { story, format } = requireActiveStory();

  const condError = checkConditions(args.conditions as Condition[]);
  if (condError !== null) return condError;

  if (story.getPassageByName(args.passage_name) === null) {
    const existing = story.passages.map((p) => p.name);
    return needClarification(
      "insert_conditional_link",
      args as Record<string, unknown>,
      `Passage "${args.passage_name}" does not exist. Which passage did you mean?`,
      {
        valid_answers: existing,
        free_text_allowed: true,
        replay: async (merged) => handler({ ...args, passage_name: String(merged.answer ?? "") }),
      },
    );
  }

  if (story.getPassageByName(args.to_passage) === null) {
    return needClarification(
      "insert_conditional_link",
      args as Record<string, unknown>,
      `Target passage "${args.to_passage}" does not exist. Create it as an empty passage, or cancel (no silent creation)?`,
      {
        valid_answers: ["create_empty", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          const mod = await import("./create_passage.js");
          await mod.handler({ name: args.to_passage, text: "", tags: [] });
          return handler(args);
        },
      },
    );
  }

  const passage = story.getPassageByName(args.passage_name)!;
  const linkMarkup = linkSyntaxFor(format, args.display_text ?? null, args.to_passage);
  const condition = renderCondition(format, args.conditions as Condition[], args.join ?? "and");
  const block = emitConditionalBlock(format, condition, linkMarkup, args.else_text);

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
    to_passage: args.to_passage,
    condition,
    rendered_link: linkMarkup,
    emitted_block: block,
    offset,
    placement,
  };
}
