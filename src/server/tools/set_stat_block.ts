import { z } from "zod";
import { requireActiveStory, setDirty, getVariableByName } from "../state.js";
import { ClarificationResponse } from "../clarification.js";
import { newPassage } from "../../twine/adapter.js";
import { validateVariableName, emitReader } from "../../twine/variables.js";

export const description =
  "Create or replace a persistent stat display shown on every passage — the HUD/sidebar. SugarCube uses the StoryCaption special passage (sidebar); Harlowe uses a header-tagged passage. Declarative and idempotent: pass the full list of variables to show and the block is regenerated. Chapbook and Snowman have no native per-passage header, so the tool declines them (author a stat panel manually).";

export const clarificationTriggers: string[] = [
  "a listed variable is not declared: returns a recoverable error naming it.",
];

export const example = {
  title: "Show the life-sim HUD",
  input: { variables: ["day", "cash", "energy", "intelligence"], title: "Status" },
  note: "SugarCube writes StoryCaption; Harlowe writes a header-tagged StatBar passage.",
};

export const inputSchema = {
  variables: z.array(z.string().min(1)).min(1).describe("Variable names to display, in order."),
  title: z.string().optional().describe("Optional heading line above the stats."),
  separator: z.string().optional().describe("Harlowe only — text between stats on the one-line bar. Default \" | \"."),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const { story, format } = requireActiveStory();

  const undeclared: string[] = [];
  for (const name of args.variables) {
    const nameCheck = validateVariableName(name);
    if (!nameCheck.ok) return { kind: "error", message: nameCheck.message };
    if (getVariableByName(name) === undefined) undeclared.push(name);
  }
  if (undeclared.length > 0) {
    return {
      kind: "error",
      message: `Stat block references undeclared variable(s): ${undeclared.join(", ")}. Call declare_variable first, then retry.`,
    };
  }

  if (format === "Chapbook" || format === "Snowman") {
    return {
      kind: "error",
      message: `${format} has no native per-passage header/sidebar, so there is no automatic stat HUD. Author a stat panel passage and show it where needed (${format === "Chapbook" ? "{embed passage named: 'StatBar'} in each passage" : "render it via story JavaScript / a footer hook"}).`,
    };
  }

  const passageName = format === "SugarCube" ? "StoryCaption" : "StatBar";
  const tags = format === "Harlowe" ? ["header"] : [];

  // Build the block. SugarCube stacks vertically in the sidebar; Harlowe reads
  // as a one-line bar.
  const rows = args.variables.map((name) => `${name}: ${emitReader(format, name)}`);
  let body: string;
  if (format === "SugarCube") {
    body = (args.title !== undefined ? `''${args.title}''\n` : "") + rows.join("\n") + "\n";
  } else {
    body = (args.title !== undefined ? `${args.title}: ` : "") + rows.join(args.separator ?? " | ") + "\n";
  }

  const existing = story.getPassageByName(passageName);
  if (existing !== null) {
    existing.text = body;
    if (format === "Harlowe" && !existing.tags.includes("header")) existing.tags.push("header");
  } else {
    const count = story.size();
    const metadata: Record<string, string> = {
      position: `${100 + (count % 6) * 150},${100 + Math.floor(count / 6) * 150}`,
      size: "100,100",
    };
    story.addPassage(newPassage(passageName, body, tags, metadata));
  }

  setDirty();

  return {
    kind: "ok",
    format,
    passage: passageName,
    variables: args.variables,
    emitted_text: body,
    note:
      format === "SugarCube"
        ? "StoryCaption renders in the UI sidebar on every passage."
        : "The header-tagged passage is prepended to every passage.",
  };
}
