import { z } from "zod";
import { requireActiveStory } from "../state.js";

export const inputSchema = {
  include_text: z.boolean().optional(),
};

type ListArgs = z.infer<z.ZodObject<typeof inputSchema>>;

const LINK_RE = /\[\[([^\[\]]+)\]\]/g;

function extractOutgoingLinks(text: string): Array<{ to_passage: string; display_text: string | null }> {
  const out: Array<{ to_passage: string; display_text: string | null }> = [];
  const matches = text.matchAll(LINK_RE);
  for (const m of matches) {
    const body = m[1]!;
    let display: string | null = null;
    let target = body;
    if (body.includes("->")) {
      const [d, t] = body.split("->", 2) as [string, string];
      display = d;
      target = t;
    } else if (body.includes("<-")) {
      const [t, d] = body.split("<-", 2) as [string, string];
      display = d;
      target = t;
    } else if (body.includes("|")) {
      const [d, t] = body.split("|", 2) as [string, string];
      display = d;
      target = t;
    }
    out.push({ to_passage: target, display_text: display });
  }
  return out;
}

export async function handler(args: ListArgs): Promise<object> {
  const { story } = requireActiveStory();
  const passages = story.passages.map((p) => ({
    name: p.name,
    tags: p.tags,
    metadata: p.metadata,
    outgoing_links: extractOutgoingLinks(p.text),
    ...(args.include_text === true ? { text: p.text } : {}),
  }));
  return {
    kind: "ok",
    start_passage: story.start === "" ? null : story.start,
    passage_count: story.size(),
    passages,
  };
}
