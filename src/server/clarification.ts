import { randomUUID } from "node:crypto";

export interface ClarificationRequest {
  clarification_id: string;
  question: string;
  valid_answers?: string[];
  free_text_allowed: boolean;
  originating_tool: string;
  originating_args: Record<string, unknown>;
}

export interface ClarificationResponse {
  kind: "clarification_needed";
  clarification: ClarificationRequest;
}

type ReplayFn = (mergedArgs: Record<string, unknown>) => Promise<unknown>;

const pending = new Map<string, { tool: string; replay: ReplayFn }>();

export function needClarification(
  originatingTool: string,
  originatingArgs: Record<string, unknown>,
  question: string,
  opts: {
    valid_answers?: string[];
    free_text_allowed?: boolean;
    replay: ReplayFn;
  },
): ClarificationResponse {
  const id = randomUUID();
  pending.set(id, { tool: originatingTool, replay: opts.replay });
  return {
    kind: "clarification_needed",
    clarification: {
      clarification_id: id,
      question,
      valid_answers: opts.valid_answers,
      free_text_allowed: opts.free_text_allowed ?? (opts.valid_answers === undefined),
      originating_tool: originatingTool,
      originating_args: originatingArgs,
    },
  };
}

export async function resolveClarification(
  id: string,
  answer: string,
): Promise<unknown> {
  const entry = pending.get(id);
  if (entry === undefined) {
    throw new Error(`Unknown clarification_id: ${id}`);
  }
  pending.delete(id);
  return entry.replay({ answer });
}
