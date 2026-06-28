import { Story } from "extwee";
import { StoryFormat } from "../twine/formats.js";
import { Variable } from "../twine/variables.js";

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
  variables: Variable[];
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
    variables: [],
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

// ---------------------------------------------------------------------------
// Variable registry helpers (feature 011). The registry mirrors the setter /
// reader text that lives in passage bodies; it is rebuilt on every load_story.
// ---------------------------------------------------------------------------

export function getVariableByName(name: string): Variable | undefined {
  if (active === null) return undefined;
  return active.variables.find((v) => v.name === name);
}

/** Insert the variable, or replace the existing entry with the same name. */
export function upsertVariable(variable: Variable): void {
  if (active === null) return;
  const idx = active.variables.findIndex((v) => v.name === variable.name);
  if (idx === -1) {
    active.variables.push(variable);
  } else {
    active.variables[idx] = variable;
  }
}

export function removeVariableByName(name: string): boolean {
  if (active === null) return false;
  const idx = active.variables.findIndex((v) => v.name === name);
  if (idx === -1) return false;
  active.variables.splice(idx, 1);
  return true;
}

export class NoActiveStoryError extends Error {
  constructor() {
    super("No active story. Call create_story first.");
    this.name = "NoActiveStoryError";
  }
}
