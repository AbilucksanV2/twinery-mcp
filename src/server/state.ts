import { Story } from "extwee";
import { StoryFormat } from "../twine/formats.js";

export interface ImagePlaceholderRecord {
  label: string;
  extension: string;
  passageName: string;
  expectedFilename: string;
  expectedPathRelative: string;
}

interface ActiveStory {
  story: Story;
  slug: string;
  format: StoryFormat;
  lastSavedPath: string | null;
  lastSavedAt: number | null;
  dirty: boolean;
  imagePlaceholders: ImagePlaceholderRecord[];
}

let active: ActiveStory | null = null;

export function setActiveStory(story: Story, slug: string, format: StoryFormat): void {
  active = {
    story,
    slug,
    format,
    lastSavedPath: null,
    lastSavedAt: null,
    dirty: false,
    imagePlaceholders: [],
  };
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

export function setDirty(): void {
  if (active !== null) {
    active.dirty = true;
  }
}

export function markSaved(dir: string): void {
  if (active !== null) {
    active.lastSavedPath = dir;
    active.lastSavedAt = Date.now();
    active.dirty = false;
  }
}

export function markLoaded(dir: string): void {
  if (active !== null) {
    active.lastSavedPath = dir;
    active.lastSavedAt = Date.now();
    active.dirty = false;
  }
}

export class NoActiveStoryError extends Error {
  constructor() {
    super("No active story. Call create_story first.");
    this.name = "NoActiveStoryError";
  }
}
