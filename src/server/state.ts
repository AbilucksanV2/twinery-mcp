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

/**
 * After splicing / inserting text in a passage, keep every cached setter and
 * reader offset for that passage accurate: shift records at or after
 * `fromOffset` by `delta` (positive for insertion, negative for deletion).
 */
export function shiftRecordsInPassage(
  passageName: string,
  fromOffset: number,
  delta: number,
): void {
  if (active === null || delta === 0) return;
  for (const v of active.variables) {
    for (const s of v.setters) {
      if (s.passageName === passageName && s.offset >= fromOffset) s.offset += delta;
    }
    for (const r of v.readers) {
      if (r.passageName === passageName && r.offset >= fromOffset) r.offset += delta;
    }
  }
}

/** Replace the entire registry — used by load_story extract-on-load. */
export function setVariables(variables: Variable[]): void {
  if (active !== null) active.variables = variables;
}

/**
 * Drop every setter / reader owned by a deleted passage from the registry, and
 * remove any variable whose setter and reader lists both become empty
 * (research R7). Called by delete_passage to keep the registry in sync.
 */
export function dropPassageFromRegistry(passageName: string): void {
  if (active === null) return;
  for (let i = active.variables.length - 1; i >= 0; i--) {
    const v = active.variables[i]!;
    v.setters = v.setters.filter((s) => s.passageName !== passageName);
    v.readers = v.readers.filter((r) => r.passageName !== passageName);
    if (v.setters.length === 0 && v.readers.length === 0) {
      active.variables.splice(i, 1);
    }
  }
}

export class NoActiveStoryError extends Error {
  constructor() {
    super("No active story. Call create_story first.");
    this.name = "NoActiveStoryError";
  }
}
