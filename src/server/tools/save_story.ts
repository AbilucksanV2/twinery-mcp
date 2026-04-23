import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { emitHtml, emitTwee } from "../../twine/adapter.js";
import { requireActiveStory, setLastSavedDir } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";

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
  const { story, slug } = active;

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

  setLastSavedDir(dir);

  return {
    kind: "ok",
    written_files: written,
    assets_dir: assetsDir,
    notes: [
      "The .twee file is the canonical source — openable by any Twine tool.",
      "The .html file contains <tw-storydata> and can be imported into the Twine 2 editor (twinery.org/2) for visual editing.",
      "For standalone browser playback, import the HTML into Twine 2 and click Publish to File; or provide a story-format file and compile with extwee directly.",
    ],
  };
}
