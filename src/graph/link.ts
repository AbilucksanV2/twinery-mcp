import { Story } from "extwee";
import { StoryFormat, linkSyntaxFor } from "../twine/formats.js";

export interface InsertLinkResult {
  renderedSyntax: string;
}

export function insertLink(
  story: Story,
  format: StoryFormat,
  fromPassageName: string,
  toPassageName: string,
  displayText: string | null,
  insertionIndex: number | null,
): InsertLinkResult {
  const from = story.getPassageByName(fromPassageName);
  if (from === null) {
    throw new Error(`from_passage '${fromPassageName}' does not exist`);
  }
  const to = story.getPassageByName(toPassageName);
  if (to === null) {
    throw new Error(`to_passage '${toPassageName}' does not exist`);
  }
  const rendered = linkSyntaxFor(format, displayText, toPassageName);
  const text = from.text;
  if (insertionIndex === null || insertionIndex >= text.length) {
    from.text = text.length > 0 && !text.endsWith("\n") ? `${text}\n${rendered}` : `${text}${rendered}`;
  } else {
    const idx = Math.max(0, insertionIndex);
    from.text = `${text.slice(0, idx)}${rendered}${text.slice(idx)}`;
  }
  return { renderedSyntax: rendered };
}
