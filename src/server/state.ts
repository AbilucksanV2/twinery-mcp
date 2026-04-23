import { Story } from "extwee";
import { StoryFormat } from "../twine/formats.js";

interface ActiveStory {
  story: Story;
  slug: string;
  format: StoryFormat;
  lastSavedDir: string | null;
}

let active: ActiveStory | null = null;

export function setActiveStory(story: Story, slug: string, format: StoryFormat): void {
  active = { story, slug, format, lastSavedDir: null };
}

export function getActiveStory(): ActiveStory | null {
  return active;
}

export function requireActiveStory(): ActiveStory {
  if (active === null) {
    throw new NoActiveStoryError();
  }
  return active;
}

export function setLastSavedDir(dir: string): void {
  if (active !== null) {
    active.lastSavedDir = dir;
  }
}

export class NoActiveStoryError extends Error {
  constructor() {
    super("No active story. Call create_story first.");
    this.name = "NoActiveStoryError";
  }
}
