import { z } from "zod";
import { resolveClarification } from "../clarification.js";

export const inputSchema = {
  clarification_id: z.string().uuid(),
  answer: z.string().min(1),
};

type RespondArgs = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: RespondArgs): Promise<unknown> {
  return await resolveClarification(args.clarification_id, args.answer);
}
