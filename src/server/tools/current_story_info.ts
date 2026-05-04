import { getActiveStory } from "../state.js";

export const description =
  "Read-only probe of session state. Returns { active: false } when no story is loaded, or a record describing the active story (name, format, IFID, passage count, start, last-saved path/timestamp, dirty flag). Never mutates state, never emits a clarification.";

export const clarificationTriggers: string[] = [];

export const example = {
  title: "Check what's loaded before doing anything",
  input: {},
  note: "Useful for the LLM to confirm it's working with the story the human expects.",
};

export const inputSchema = {};

export async function handler(): Promise<object> {
  const active = getActiveStory();
  if (active === null) {
    return { kind: "ok", active: false };
  }
  const { story, slug, lastSavedPath, lastSavedAt, dirty } = active;
  return {
    kind: "ok",
    active: true,
    name: story.name,
    format: story.format,
    format_version: story.formatVersion,
    ifid: story.IFID,
    story_slug: slug,
    passage_count: story.size(),
    start_passage: story.start === "" ? null : story.start,
    last_saved_path: lastSavedPath,
    last_saved_at: lastSavedAt,
    dirty,
    image_placeholder_count: active.imagePlaceholders.length,
  };
}
