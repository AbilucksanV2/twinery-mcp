import { z } from "zod";
import { access, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { emitHtml, emitTwee } from "../../twine/adapter.js";
import { markSaved, requireActiveStory } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";

export const description =
  "Persist the active story as <slug>.twee and <slug>.html into a directory, plus a sibling assets/<slug>/ drop zone. Reports every image placeholder whose file is not yet on disk. Asks for the output folder when omitted.";

export const clarificationTriggers: string[] = [
  "output_dir missing: ask for the destination folder (free-form).",
];

export const example = {
  title: "Save to a subfolder of the current working directory",
  input: { output_dir: "stories/locked-door" },
  note: "Writes stories/locked-door/{locked-door.twee, locked-door.html} and creates stories/locked-door/assets/locked-door/.",
};

export const inputSchema = {
  output_dir: z.string().optional()
    .describe("Absolute or cwd-relative directory. Server asks if omitted."),
  compile_html: z.boolean().optional(),
};

type SaveArgs = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: SaveArgs): Promise<object | ClarificationResponse> {
  if (args.output_dir === undefined || args.output_dir === "") {
    return needClarification(
      "save_story",
      args as Record<string, unknown>,
      "Where should the story be saved? Provide a folder path (absolute, or relative to the current working directory).",
      {
        free_text_allowed: true,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "") throw new Error("Empty folder path");
          return handler({ ...args, output_dir: answer });
        },
      },
    );
  }

  const active = requireActiveStory();
  const { story, slug, imagePlaceholders } = active;

  const dir = isAbsolute(args.output_dir)
    ? args.output_dir
    : resolve(process.cwd(), args.output_dir);
  await mkdir(dir, { recursive: true });

  const tweePath = join(dir, `${slug}.twee`);
  await writeFile(tweePath, emitTwee(story), "utf8");

  const written: string[] = [tweePath];
  if (args.compile_html !== false) {
    const htmlPath = join(dir, `${slug}.html`);
    await writeFile(htmlPath, emitHtml(story), "utf8");
    written.push(htmlPath);
  }

  const assetsDir = join(dir, "assets", slug);
  await mkdir(assetsDir, { recursive: true });

  markSaved(dir);

  const pending: Array<{ label: string; expected_path: string }> = [];
  for (const ph of imagePlaceholders) {
    const absPath = join(dir, ph.expectedPathRelative);
    const present = await fileExists(absPath);
    if (!present) {
      pending.push({ label: ph.label, expected_path: absPath });
    }
  }

  return {
    kind: "ok",
    written_files: written,
    assets_dir: assetsDir,
    pending_image_drops: pending,
    notes: [
      "The .twee file is the canonical source — openable by any Twine tool.",
      "The .html file contains <tw-storydata> and can be imported into the Twine 2 editor (twinery.org/2) for visual editing.",
      "For standalone browser playback, import the HTML into Twine 2 and click Publish to File; or provide a story-format file and compile with extwee directly.",
      pending.length > 0
        ? `${pending.length} image placeholder file(s) are still expected — drop them at the paths listed under pending_image_drops.`
        : "All image placeholder files are present (or none were declared).",
    ],
  };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
