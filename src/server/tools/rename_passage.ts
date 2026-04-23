import { z } from "zod";
import { renamePassage } from "../../graph/rename.js";
import { requireActiveStory } from "../state.js";

export const description =
  "Rename a passage and rewrite every incoming link across the story atomically. Updates the story's start passage if the renamed passage was the start. This is the flagship graph-integrity operation — never rewrite passage names by editing raw text.";

export const clarificationTriggers: string[] = [];

export const example = {
  title: "Rename and auto-rewrite all incoming links",
  input: { old_name: "Pick Lock", new_name: "Lockpick" },
  note: "All [[...]] references to Pick Lock across every passage are rewritten atomically.",
};

export const inputSchema = {
  old_name: z.string().min(1),
  new_name: z.string().min(1),
};

type RenameArgs = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: RenameArgs): Promise<object> {
  const { story } = requireActiveStory();
  const result = renamePassage(story, args.old_name, args.new_name);
  return {
    kind: "ok",
    renamed: result.renamed,
    incoming_links_rewritten: result.incomingLinksRewritten,
    affected_passages: result.affectedPassages,
    start_passage_updated: result.startPassageUpdated,
  };
}
