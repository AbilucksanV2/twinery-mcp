import { z } from "zod";
import { newPassage } from "../../twine/adapter.js";
import { requireActiveStory, setDirty } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";

export const description =
  "Add a passage to the active story. Auto-positions when `position` is omitted. The first passage becomes the start unless told otherwise.";

export const clarificationTriggers: string[] = [
  "duplicate name: ask suffix | replace | cancel (no silent rename).",
];

export const example = {
  title: "Create the start passage",
  input: {
    name: "Start",
    text: "You stand before a locked door.",
    set_as_start: true,
  },
};

export const inputSchema = {
  name: z.string().min(1, "passage name is required"),
  text: z.string().optional(),
  tags: z.array(z.string().regex(/^\S+$/)).optional(),
  position: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative() }).optional(),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
  set_as_start: z.boolean().optional(),
};

type CreatePassageArgs = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: CreatePassageArgs): Promise<object | ClarificationResponse> {
  const active = requireActiveStory();
  const { story } = active;

  if (story.getPassageByName(args.name) !== null) {
    return needClarification(
      "create_passage",
      args as Record<string, unknown>,
      `A passage named "${args.name}" already exists. Append a suffix, replace it, or cancel?`,
      {
        valid_answers: ["suffix", "replace", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          if (answer === "replace") {
            story.removePassageByName(args.name);
            return handler(args);
          }
          if (answer === "suffix") {
            let i = 2;
            while (story.getPassageByName(`${args.name}-${i}`) !== null) i++;
            return handler({ ...args, name: `${args.name}-${i}` });
          }
          throw new Error(`Invalid answer: ${answer}`);
        },
      },
    );
  }

  const metadata: Record<string, string> = {};
  if (args.position !== undefined) metadata.position = `${args.position.x},${args.position.y}`;
  if (args.size !== undefined) metadata.size = `${args.size.w},${args.size.h}`;
  if (metadata.position === undefined) {
    const count = story.size();
    metadata.position = `${100 + (count % 6) * 150},${100 + Math.floor(count / 6) * 150}`;
  }
  if (metadata.size === undefined) metadata.size = "100,100";

  const passage = newPassage(args.name, args.text ?? "", args.tags ?? [], metadata);
  story.addPassage(passage);

  const shouldBeStart = args.set_as_start === true || story.start === "";
  if (shouldBeStart) story.start = args.name;

  setDirty();

  return {
    kind: "ok",
    passage: {
      name: passage.name,
      tags: passage.tags,
      metadata: passage.metadata,
      text: passage.text,
    },
    is_start: story.start === args.name,
    passage_count: story.size(),
  };
}
