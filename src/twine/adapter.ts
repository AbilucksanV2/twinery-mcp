import { Story, Passage, generateIFID } from "extwee";
import { StoryFormat, DEFAULT_FORMAT_VERSIONS } from "./formats.js";

export interface CreateStoryInput {
  name: string;
  format: StoryFormat;
  formatVersion?: string;
  ifid?: string;
}

export function newStory(input: CreateStoryInput): Story {
  const story = new Story();
  story.name = input.name;
  story.IFID = input.ifid ?? generateIFID();
  story.format = input.format;
  story.formatVersion = input.formatVersion ?? DEFAULT_FORMAT_VERSIONS[input.format];
  story.creator = "twinery-mcp-poc";
  return story;
}

export function newPassage(
  name: string,
  text: string = "",
  tags: string[] = [],
  metadata: Record<string, unknown> = {}
): Passage {
  return new Passage(name, text, tags, metadata);
}

export function emitTwee(story: Story): string {
  return story.toTwee();
}

export function emitHtml(story: Story): string {
  const storyData = story.toTwine2HTML();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(story.name)}</title>
</head>
<body>
${storyData}
<p><em>This file is a Twine 2 HTML source. To play it in a browser, import it into the Twine 2 editor (twinery.org/2) and click Publish to File.</em></p>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
