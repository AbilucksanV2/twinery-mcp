import { z } from "zod";
import { newStory } from "../../twine/adapter.js";
import { storySlug } from "../../lib/slug.js";
import { getActiveStory, setActiveStory } from "../state.js";
import { STORY_FORMATS, StoryFormat } from "../../twine/formats.js";
import { needClarification, ClarificationResponse } from "../clarification.js";
import * as saveStory from "./save_story.js";

export const description =
  "Initialise the single active story. Asks for the story format if omitted (no silent defaults). Refuses if the active story has unsaved changes (pass discard_unsaved: true to override) — same dirty-guard contract as load_story so format-switching mid-session never silently clobbers work. Auto-generates a spec-valid IFID.";

export const clarificationTriggers: string[] = [
  "active story has unsaved changes AND discard_unsaved is not set: ask save_first | discard_unsaved | cancel.",
  "format omitted: ask Harlowe | SugarCube | Chapbook | Snowman.",
];

export const example = {
  title: "Start a Harlowe story",
  input: { name: "Locked Door", format: "Harlowe" },
  note: "If you omit `format`, the server will surface a clarification instead of picking a default. If an unsaved active story is present, the server asks before clobbering it.",
};

export const inputSchema = {
  name: z.string().min(1, "name is required").max(200),
  format: z.enum(["Harlowe", "SugarCube", "Chapbook", "Snowman"]).optional()
    .describe("Story format. Omit to have the server ask (no silent defaults)."),
  format_version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  ifid: z.string().regex(/^[0-9A-F-]{8,63}$/).optional(),
  discard_unsaved: z.boolean().optional()
    .describe("Set true to bypass the unsaved-changes guard. Default: false (server asks before clobbering)."),
};

type CreateStoryArgs = {
  name: string;
  format?: StoryFormat;
  format_version?: string;
  ifid?: string;
  discard_unsaved?: boolean;
};

export async function handler(args: CreateStoryArgs): Promise<object | ClarificationResponse> {
  // Dirty guard — match load_story so format-switching or starting a new
  // story mid-session doesn't silently clobber unsaved work.
  const active = getActiveStory();
  if (active !== null && active.dirty && args.discard_unsaved !== true) {
    return needClarification(
      "create_story",
      args as Record<string, unknown>,
      `The active story "${active.story.name}" has unsaved changes. Save first, discard them, or cancel?`,
      {
        valid_answers: ["save_first", "discard_unsaved", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          if (answer === "save_first") {
            const saveResult = await saveStory.handler({});
            const saveKind = (saveResult as { kind?: string }).kind;
            if (saveKind === "clarification_needed") {
              return saveResult;
            }
            return handler(args);
          }
          return handler({ ...args, discard_unsaved: true });
        },
      },
    );
  }

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
