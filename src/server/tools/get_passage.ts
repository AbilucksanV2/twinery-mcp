import { z } from "zod";
import { requireActiveStory } from "../state.js";
import { extractOutgoing } from "../../graph/links.js";
import { ClarificationResponse, needClarification } from "../clarification.js";

export const description =
  "Return a single passage in full — name, tags, position, size, text, and its outgoing links. Read-only.";

export const clarificationTriggers: string[] = [
  "name does not exist: ask which passage was meant (valid answers = existing passage names).",
];

export const example = {
  title: "Read the Start passage verbatim",
  input: { name: "Start" },
};

export const inputSchema = {
  name: z.string().min(1),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { story } = requireActiveStory();
  const passage = story.getPassageByName(args.name);
  if (passage === null) {
    const existing = story.passages.map((p) => p.name);
    return needClarification(
      "get_passage",
      args as Record<string, unknown>,
      `Passage "${args.name}" does not exist. Which passage did you mean?`,
      {
        valid_answers: existing,
        free_text_allowed: true,
        replay: async (merged) => handler({ name: String(merged.answer ?? "") }),
      },
    );
  }

  return {
    kind: "ok",
    passage: {
      name: passage.name,
      tags: passage.tags,
      metadata: passage.metadata,
      text: passage.text,
      outgoing_links: extractOutgoing(passage).map((e) => ({
        to_passage: e.to,
        display_text: e.displayText,
      })),
    },
  };
}
