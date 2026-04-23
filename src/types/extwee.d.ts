declare module "extwee" {
  export class Passage {
    constructor(name?: string, text?: string, tags?: string[], metadata?: Record<string, unknown>);
    name: string;
    text: string;
    tags: string[];
    metadata: Record<string, unknown>;
    toTwee(): string;
    toJSON(): string;
    toTwine2HTML(pid?: number): string;
  }

  export class Story {
    constructor();
    name: string;
    IFID: string;
    start: string;
    format: string;
    formatVersion: string;
    zoom: number;
    creator: string;
    creatorVersion: string;
    tagColors: Record<string, string>;
    metadata: Record<string, unknown> | null;
    storyJavaScript: string;
    storyStylesheet: string;
    readonly passages: Passage[];
    addPassage(p: Passage): number;
    removePassageByName(name: string): number;
    getPassageByName(name: string): Passage | null;
    getPassagesByTag(t: string): Passage[];
    size(): number;
    toTwee(): string;
    toJSON(): string;
    toTwine2HTML(): string;
  }

  export class StoryFormat {
    name: string;
    version: string;
    description: string;
    author: string;
    image: string;
    url: string;
    license: string;
    proofing: boolean;
    source: string;
  }

  export function generateIFID(): string;
  export function parseTwee(tweeSource: string): Story;
  export function parseJSON(json: string): Story;
  export function parseStoryFormat(source: string): StoryFormat;
  export function parseTwine2HTML(html: string): Story;
  export function compileTwine2HTML(story: Story, storyFormat: StoryFormat): string;
}
