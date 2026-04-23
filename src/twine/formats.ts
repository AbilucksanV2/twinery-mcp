export type StoryFormat = "Harlowe" | "SugarCube" | "Chapbook" | "Snowman";

export const STORY_FORMATS: StoryFormat[] = [
  "Harlowe",
  "SugarCube",
  "Chapbook",
  "Snowman",
];

export const DEFAULT_FORMAT_VERSIONS: Record<StoryFormat, string> = {
  Harlowe: "3.3.8",
  SugarCube: "2.36.1",
  Chapbook: "2.1.0",
  Snowman: "2.0.2",
};

export function linkSyntaxFor(format: StoryFormat, displayText: string | null, target: string): string {
  if (displayText === null || displayText === "") {
    return `[[${target}]]`;
  }
  if (format === "SugarCube" || format === "Snowman") {
    return `[[${displayText}|${target}]]`;
  }
  return `[[${displayText}->${target}]]`;
}
