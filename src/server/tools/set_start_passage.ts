import { z } from "zod";
import { requireActiveStory, setDirty } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";

export const description =
  "Point the story's start_passage at an existing passage. The first passage created is already the default start — use this when you want to change it explicitly.";

export const clarificationTriggers: string[] = [
  "name does not exist: ask which passage was meant (valid answers = existing passage names).",
];

export const example = {
  title: "Make 'Prologue' the start passage",
  input: { name: "Prologue" },
};

export const inputSchema = {
  name: z.string().min(1),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { story } = requireActiveStory();
  if (story.getPassageByName(args.name) === null) {
    const existing = story.passages.map((p) => p.name);
    return needClarification(
      "set_start_passage",
      args as Record<string, unknown>,
      `Passage "${args.name}" does not exist. Which passage did you mean?`,
      {
        valid_answers: existing,
        free_text_allowed: true,
        replay: async (merged) => handler({ name: String(merged.answer ?? "") }),
      },
    );
  }
  const previous = story.start === "" ? null : story.start;
  if (previous !== args.name) {
    story.start = args.name;
    setDirty();
  }
  return {
    kind: "ok",
    previous_start: previous,
    current_start: args.name,
  };
}
