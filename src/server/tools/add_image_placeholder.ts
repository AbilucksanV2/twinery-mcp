import { z } from "zod";
import { join } from "node:path";
import {
  addPlaceholder,
  ALLOWED_EXTENSIONS,
  isLabelTaken,
  LABEL_RE,
  nextAvailableSuffix,
  validateLabel,
} from "../../images/placeholder.js";
import { requireActiveStory } from "../state.js";
import { ClarificationResponse, needClarification } from "../clarification.js";

export const description =
  "Insert an image placeholder in a passage and return the exact filename and folder path where the author must drop the image. Played HTML requests the image from that path; a labeled dashed-border fallback renders when the file is missing.";

export const clarificationTriggers: string[] = [
  "label collides with an existing placeholder: ask pick_new_label | confirm_auto_suffix | cancel (no silent rename).",
  "passage_name does not exist: ask create_empty | cancel.",
];

export const example = {
  title: "Drop an illustration into the Forest passage",
  input: { passage_name: "Forest", label: "ancient-tree" },
  note: "Server reports e.g. assets/<story-slug>/ancient-tree.png — drop a file there and the played HTML will load it automatically.",
};

export const inputSchema = {
  passage_name: z.string().min(1),
  label: z.string().regex(LABEL_RE).describe(
    "Kebab-case identifier; becomes the filename stem. Unique within the story.",
  ),
  extension: z.enum(ALLOWED_EXTENSIONS).optional(),
  insertion_index: z.number().int().nonnegative().nullable().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const active = requireActiveStory();
  const { story, slug, imagePlaceholders, lastSavedPath } = active;

  if (story.getPassageByName(args.passage_name) === null) {
    return needClarification(
      "add_image_placeholder",
      args as Record<string, unknown>,
      `Passage "${args.passage_name}" does not exist. Create it as an empty passage, or cancel?`,
      {
        valid_answers: ["create_empty", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          const mod = await import("./create_passage.js");
          await mod.handler({ name: args.passage_name, text: "", tags: [] });
          return handler(args);
        },
      },
    );
  }

  try {
    validateLabel(args.label);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: "error", message };
  }

  if (isLabelTaken(imagePlaceholders, args.label)) {
    const suggested = nextAvailableSuffix(imagePlaceholders, args.label);
    return needClarification(
      "add_image_placeholder",
      args as Record<string, unknown>,
      `Placeholder label "${args.label}" is already used in this story. Pick a new label, accept the auto-suffix "${suggested}", or cancel?`,
      {
        valid_answers: ["pick_new_label", "confirm_auto_suffix", "cancel"],
        free_text_allowed: true,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          if (answer === "confirm_auto_suffix") {
            return handler({ ...args, label: suggested });
          }
          if (answer === "pick_new_label") {
            throw new Error("Re-call add_image_placeholder with a new `label`.");
          }
          // Treat any other non-canned answer as a new label the user provided.
          return handler({ ...args, label: answer });
        },
      },
    );
  }

  const extension = args.extension ?? "png";
  const { record } = addPlaceholder(story, imagePlaceholders, {
    passageName: args.passage_name,
    label: args.label,
    extension,
    storySlug: slug,
    insertionIndex: args.insertion_index ?? null,
  });
  imagePlaceholders.push(record);

  const pathIsFinal = lastSavedPath !== null;
  const expectedPath = pathIsFinal
    ? join(lastSavedPath!, record.expectedPathRelative)
    : record.expectedPathRelative;

  return {
    kind: "ok",
    placeholder: {
      label: record.label,
      passage_name: record.passageName,
      extension: record.extension,
    },
    expected_filename: record.expectedFilename,
    expected_path: expectedPath,
    path_is_final: pathIsFinal,
    note: pathIsFinal
      ? "Drop the image file at the reported path; played HTML will pick it up on next render."
      : "The reported path is relative. Call save_story to write the story, then the path becomes final.",
  };
}
