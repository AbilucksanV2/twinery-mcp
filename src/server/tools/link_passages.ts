import { z } from "zod";
import { insertLink } from "../../graph/link.js";
import { requireActiveStory } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";

export const inputSchema = {
  from_passage: z.string().min(1),
  to_passage: z.string().min(1),
  display_text: z.string().optional(),
  insertion_index: z.number().int().nonnegative().nullable().optional(),
};

type LinkArgs = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: LinkArgs): Promise<object | ClarificationResponse> {
  const active = requireActiveStory();
  const { story, format } = active;

  if (story.getPassageByName(args.from_passage) === null) {
    return needClarification(
      "link_passages",
      args as Record<string, unknown>,
      `Source passage "${args.from_passage}" does not exist. Create it as an empty passage, or cancel?`,
      {
        valid_answers: ["create_empty", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          const mod = await import("./create_passage.js");
          await mod.handler({ name: args.from_passage, text: "", tags: [] });
          return handler(args);
        },
      },
    );
  }

  if (story.getPassageByName(args.to_passage) === null) {
    return needClarification(
      "link_passages",
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

  const result = insertLink(
    story,
    format,
    args.from_passage,
    args.to_passage,
    args.display_text ?? null,
    args.insertion_index ?? null,
  );

  return {
    kind: "ok",
    link_inserted: true,
    rendered_syntax: result.renderedSyntax,
  };
}
