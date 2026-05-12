import { z } from "zod";
import { requireActiveStory, setDirty } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";

export const description =
  "Mutate text / tags / position / size on an existing passage. Does NOT rename (use rename_passage for that so link integrity is enforced). Pass only the fields you want to change.";

export const clarificationTriggers: string[] = [
  "name does not exist: ask which passage was meant (valid answers = existing passage names).",
];

export const example = {
  title: "Rewrite the Start passage's prose",
  input: {
    name: "Start",
    text: "You stand before a locked door, rusted shut with age.",
  },
  note: "Passing `tags` replaces the tag list; omit it to leave tags alone.",
};

export const inputSchema = {
  name: z.string().min(1),
  text: z.string().optional(),
  tags: z.array(z.string().regex(/^\S+$/)).optional(),
  position: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative() }).optional(),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { story } = requireActiveStory();
  const passage = story.getPassageByName(args.name);
  if (passage === null) {
    const existing = story.passages.map((p) => p.name);
    return needClarification(
      "update_passage",
      args as Record<string, unknown>,
      `Passage "${args.name}" does not exist. Which passage did you mean?`,
      {
        valid_answers: existing,
        free_text_allowed: true,
        replay: async (merged) => handler({ ...args, name: String(merged.answer ?? "") }),
      },
    );
  }

  const changed: string[] = [];
  if (args.text !== undefined) {
    passage.text = args.text;
    changed.push("text");
  }
  if (args.tags !== undefined) {
    passage.tags = args.tags;
    changed.push("tags");
  }
  const meta = { ...(passage.metadata as Record<string, string>) };
  if (args.position !== undefined) {
    meta.position = `${args.position.x},${args.position.y}`;
    changed.push("position");
  }
  if (args.size !== undefined) {
    meta.size = `${args.size.w},${args.size.h}`;
    changed.push("size");
  }
  passage.metadata = meta;

  if (changed.length > 0) setDirty();

  return {
    kind: "ok",
    passage: {
      name: passage.name,
      tags: passage.tags,
      metadata: passage.metadata,
      text: passage.text,
    },
    fields_changed: changed,
  };
}
