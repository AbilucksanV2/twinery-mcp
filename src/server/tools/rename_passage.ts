import { z } from "zod";
import { renamePassage } from "../../graph/rename.js";
import { requireActiveStory } from "../state.js";

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
