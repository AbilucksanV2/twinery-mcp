import { z } from "zod";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseTwee } from "extwee";
import { storySlug } from "../../lib/slug.js";
import { allEdges, reachableFrom } from "../../graph/links.js";
import { StoryFormat, STORY_FORMATS } from "../../twine/formats.js";
import {
  getActiveStory,
  markLoaded,
  setActiveStory,
} from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";
import * as saveStory from "./save_story.js";

export const description =
  "Load a .twee file from disk into the active story, replacing whatever was loaded before. Refuses if the active story has unsaved changes (pass discard_unsaved: true to override). Runs validation on load and includes any issues in the response — load is non-blocking on validation problems so authors can load broken stories specifically to fix them.";

export const clarificationTriggers: string[] = [
  "active story has unsaved changes AND discard_unsaved is not set: ask save_first | discard_unsaved | cancel.",
  "path ends in .html: ask cancel (only .twee is parsed in this version) — extract Twee and retry, or cancel.",
];

export const example = {
  title: "Resume work on a saved story",
  input: { path: "./stories/locked-door/locked-door.twee" },
  note: "After load, current_story_info reports the loaded story's name, IFID, and dirty=false.",
};

export const inputSchema = {
  path: z.string().min(1),
  discard_unsaved: z.boolean().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const IFID_RE = /^[0-9A-F-]{8,63}$/;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const active = getActiveStory();
  if (active !== null && active.dirty && args.discard_unsaved !== true) {
    return needClarification(
      "load_story",
      args as Record<string, unknown>,
      `The active story "${active.story.name}" has unsaved changes. Save first, discard them, or cancel?`,
      {
        valid_answers: ["save_first", "discard_unsaved", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          if (answer === "save_first") {
            const saveResult = await saveStory.handler({});
            const saveKind = (saveResult as { kind?: string }).kind;
            if (saveKind === "clarification_needed") {
              return saveResult;
            }
            return handler(args);
          }
          return handler({ ...args, discard_unsaved: true });
        },
      },
    );
  }

  if (args.path.toLowerCase().endsWith(".html")) {
    return needClarification(
      "load_story",
      args as Record<string, unknown>,
      `"${args.path}" looks like a .html file. This version only parses .twee — extract the Twee source and retry, or cancel?`,
      {
        valid_answers: ["cancel"],
        free_text_allowed: false,
        replay: async () => ({ kind: "ok", cancelled: true }),
      },
    );
  }

  const absPath = isAbsolute(args.path) ? args.path : resolve(process.cwd(), args.path);

  let source: string;
  try {
    source = await readFile(absPath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "error", message: `Could not read "${absPath}": ${message}` };
  }

  let loaded;
  try {
    loaded = parseTwee(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "error",
      message: `Failed to parse "${absPath}" as Twee 3: ${message}`,
    };
  }

  const formatRaw = loaded.format === "" ? "Harlowe" : loaded.format;
  if (!STORY_FORMATS.includes(formatRaw as StoryFormat)) {
    return {
      kind: "error",
      message: `Story declares an unrecognised format "${formatRaw}". Expected one of: ${STORY_FORMATS.join(", ")}.`,
    };
  }
  const format = formatRaw as StoryFormat;
  const slug = storySlug(loaded.name === "" ? "untitled" : loaded.name);

  setActiveStory(loaded, slug, format);
  markLoaded(dirname(absPath));

  const validation = computeValidation(loaded);

  return {
    kind: "ok",
    info: {
      active: true,
      name: loaded.name,
      format: loaded.format,
      format_version: loaded.formatVersion,
      ifid: loaded.IFID,
      story_slug: slug,
      passage_count: loaded.size(),
      start_passage: loaded.start === "" ? null : loaded.start,
      last_saved_path: dirname(absPath),
      last_saved_at: Date.now(),
      dirty: false,
    },
    validation,
    source_path: absPath,
  };
}

interface ValidationSummary {
  ok: boolean;
  broken_links: Array<{ from_passage: string; to_passage: string }>;
  orphans: string[];
  duplicate_names: string[];
  ifid_valid: boolean;
  start_passage_valid: boolean;
}

function computeValidation(story: ReturnType<typeof parseTwee>): ValidationSummary {
  const passageNames = story.passages.map((p) => p.name);
  const passageNameSet = new Set(passageNames);

  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const n of passageNames) {
    if (seen.has(n)) duplicates.push(n);
    else seen.add(n);
  }

  const broken: Array<{ from_passage: string; to_passage: string }> = [];
  for (const edge of allEdges(story)) {
    if (!passageNameSet.has(edge.to)) {
      broken.push({ from_passage: edge.from, to_passage: edge.to });
    }
  }

  const startValid = story.start !== "" && passageNameSet.has(story.start);
  const orphans = startValid
    ? passageNames.filter((n) => !reachableFrom(story, story.start).has(n))
    : [...passageNames];
  const ifidValid = IFID_RE.test(story.IFID);

  return {
    ok:
      broken.length === 0 &&
      orphans.length === 0 &&
      duplicates.length === 0 &&
      ifidValid &&
      startValid,
    broken_links: broken,
    orphans,
    duplicate_names: duplicates,
    ifid_valid: ifidValid,
    start_passage_valid: startValid,
  };
}
