import { Story } from "extwee";
import type { ImagePlaceholderRecord } from "../server/state.js";
import { imageBlockHtml } from "./render.js";

export const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const LABEL_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface AddPlaceholderArgs {
  passageName: string;
  label: string;
  extension: AllowedExtension;
  storySlug: string;
  insertionIndex: number | null;
}

export interface AddPlaceholderResult {
  record: ImagePlaceholderRecord;
  renderedHtml: string;
}

export function validateLabel(label: string): void {
  if (!LABEL_RE.test(label)) {
    throw new Error(
      `Invalid label "${label}". Labels must be kebab-case matching ${LABEL_RE}.`,
    );
  }
}

export function isLabelTaken(
  existing: ImagePlaceholderRecord[],
  label: string,
): boolean {
  return existing.some((r) => r.label === label);
}

export function nextAvailableSuffix(
  existing: ImagePlaceholderRecord[],
  baseLabel: string,
): string {
  let i = 2;
  while (isLabelTaken(existing, `${baseLabel}-${i}`)) i++;
  return `${baseLabel}-${i}`;
}

export function addPlaceholder(
  story: Story,
  existing: ImagePlaceholderRecord[],
  args: AddPlaceholderArgs,
): AddPlaceholderResult {
  validateLabel(args.label);
  if (isLabelTaken(existing, args.label)) {
    throw new Error(`Placeholder label "${args.label}" is already in use.`);
  }
  const passage = story.getPassageByName(args.passageName);
  if (passage === null) {
    throw new Error(`Passage "${args.passageName}" does not exist.`);
  }

  const rendered = imageBlockHtml({
    label: args.label,
    extension: args.extension,
    storySlug: args.storySlug,
  });

  const text = passage.text;
  const idx = args.insertionIndex;
  if (idx === null || idx >= text.length) {
    passage.text =
      text.length > 0 && !text.endsWith("\n") ? `${text}\n${rendered}` : `${text}${rendered}`;
  } else {
    const clamped = Math.max(0, idx);
    passage.text = `${text.slice(0, clamped)}${rendered}${text.slice(clamped)}`;
  }

  const record: ImagePlaceholderRecord = {
    label: args.label,
    extension: args.extension,
    passageName: args.passageName,
    expectedFilename: `${args.label}.${args.extension}`,
    expectedPathRelative: `assets/${args.storySlug}/${args.label}.${args.extension}`,
  };

  return { record, renderedHtml: rendered };
}
