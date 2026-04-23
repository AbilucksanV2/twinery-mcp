import { z } from "zod";
import { resolveClarification } from "../clarification.js";

export const description =
  "Resolve a previously-returned clarification_needed payload by providing the author's answer. The server replays the original tool call with the answer merged in. Use this only when your MCP client does not support MCP elicitation.";

export const clarificationTriggers: string[] = [];

export const example = {
  title: "Answer a pending clarification",
  input: {
    clarification_id: "8f2c0b9e-1234-4abc-8def-5678abcd9012",
    answer: "Harlowe",
  },
  note: "The clarification_id is returned by whichever tool emitted the clarification.",
};

export const inputSchema = {
  clarification_id: z.string().uuid(),
  answer: z.string().min(1),
};

type RespondArgs = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: RespondArgs): Promise<unknown> {
  return await resolveClarification(args.clarification_id, args.answer);
}
