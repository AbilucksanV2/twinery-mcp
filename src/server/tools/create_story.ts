import { z } from "zod";
import { newStory } from "../../twine/adapter.js";
import { storySlug } from "../../lib/slug.js";
import { setActiveStory } from "../state.js";
import { STORY_FORMATS, StoryFormat } from "../../twine/formats.js";
import { needClarification, ClarificationResponse } from "../clarification.js";

export const description =
  "Initialise the single active story. Asks for the story format if omitted (no silent defaults). Auto-generates a spec-valid IFID.";

export const clarificationTriggers: string[] = [
  "format omitted: ask Harlowe | SugarCube | Chapbook | Snowman.",
];

export const example = {
  title: "Start a Harlowe story",
  input: { name: "Locked Door", format: "Harlowe" },
  note: "If you omit `format`, the server will surface a clarification instead of picking a default.",
};

export const inputSchema = {
  name: z.string().min(1, "name is required").max(200),
  format: z.enum(["Harlowe", "SugarCube", "Chapbook", "Snowman"]).optional()
    .describe("Story format. Omit to have the server ask (no silent defaults)."),
  format_version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  ifid: z.string().regex(/^[0-9A-F-]{8,63}$/).optional(),
};

type CreateStoryArgs = {
  name: string;
  format?: StoryFormat;
  format_version?: string;
  ifid?: string;
};

export async function handler(args: CreateStoryArgs): Promise<object | ClarificationResponse> {
  if (args.format === undefined) {
    return needClarification(
      "create_story",
      args as Record<string, unknown>,
      "Which Twine story format should this story use?",
      {
        valid_answers: [...STORY_FORMATS],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (!STORY_FORMATS.includes(answer as StoryFormat)) {
            throw new Error(`Invalid format answer: ${answer}`);
          }
          return handler({ ...args, format: answer as StoryFormat });
        },
      },
    );
  }

  const story = newStory({
    name: args.name,
    format: args.format,
    formatVersion: args.format_version,
    ifid: args.ifid,
  });
  const slug = storySlug(args.name);
  setActiveStory(story, slug, args.format);

  return {
    kind: "ok",
    story: {
      name: story.name,
      ifid: story.IFID,
      format: story.format,
      format_version: story.formatVersion,
      story_slug: slug,
      passage_count: story.size(),
      start_passage: story.start === "" ? null : story.start,
    },
  };
}
