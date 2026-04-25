import { z } from "zod";
import { requireActiveStory } from "../state.js";
import { incomingTo, removeIncomingLinkMarkup } from "../../graph/links.js";
import { ClarificationResponse, needClarification } from "../clarification.js";

export const description =
  "Remove a passage. When other passages link to it or it's the story's start, the server asks how to resolve instead of silently dangling the graph. Also cleans up any image placeholders tracked for this passage.";

export const clarificationTriggers: string[] = [
  "name is the story's start_passage: ask which passage becomes the new start (valid answers = other existing passages).",
  "handle_incoming_links='ask' (default) AND incoming links exist: ask remove_link_markup | leave_dangling | cancel.",
  "name does not exist: ask which passage was meant (valid answers = existing passage names).",
];

export const example = {
  title: "Delete an unused side passage and strip stale links",
  input: { name: "Side Passage", handle_incoming_links: "remove_link_markup" },
};

export const inputSchema = {
  name: z.string().min(1),
  handle_incoming_links: z.enum(["ask", "remove_link_markup", "leave_dangling"]).optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export async function handler(args: Args): Promise<object | ClarificationResponse> {
  const active = requireActiveStory();
  const { story, imagePlaceholders } = active;

  if (story.getPassageByName(args.name) === null) {
    const existing = story.passages.map((p) => p.name);
    return needClarification(
      "delete_passage",
      args as Record<string, unknown>,
      `Passage "${args.name}" does not exist. Which passage did you mean?`,
      {
        valid_answers: existing,
        free_text_allowed: true,
        replay: async (merged) => handler({ ...args, name: String(merged.answer ?? "") }),
      },
    );
  }

  if (story.start === args.name) {
    const others = story.passages.map((p) => p.name).filter((n) => n !== args.name);
    if (others.length === 0) {
      return {
        kind: "error",
        message: `Cannot delete "${args.name}" — it's the only passage in the story and is the start. Create another passage first.`,
      };
    }
    return needClarification(
      "delete_passage",
      args as Record<string, unknown>,
      `"${args.name}" is the current start passage. Pick a new start passage before deletion, or cancel?`,
      {
        valid_answers: [...others, "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          if (!others.includes(answer)) {
            throw new Error(`Invalid answer: ${answer}`);
          }
          story.start = answer;
          return handler(args);
        },
      },
    );
  }

  const strategy = args.handle_incoming_links ?? "ask";
  const incoming = incomingTo(story, args.name);

  if (strategy === "ask" && incoming.length > 0) {
    const sources = Array.from(new Set(incoming.map((e) => e.from)));
    return needClarification(
      "delete_passage",
      args as Record<string, unknown>,
      `${incoming.length} link(s) from ${sources.length} passage(s) point at "${args.name}". Remove that markup, leave dangling links, or cancel?`,
      {
        valid_answers: ["remove_link_markup", "leave_dangling", "cancel"],
        free_text_allowed: false,
        replay: async (merged) => {
          const answer = String(merged.answer ?? "");
          if (answer === "cancel") return { kind: "ok", cancelled: true };
          if (answer !== "remove_link_markup" && answer !== "leave_dangling") {
            throw new Error(`Invalid answer: ${answer}`);
          }
          return handler({ ...args, handle_incoming_links: answer });
        },
      },
    );
  }

  let handled: { strategy: "remove_link_markup" | "leave_dangling" | "none"; count: number; affected: string[] };
  if (incoming.length === 0) {
    handled = { strategy: "none", count: 0, affected: [] };
  } else if (strategy === "remove_link_markup") {
    const r = removeIncomingLinkMarkup(story, args.name);
    handled = { strategy: "remove_link_markup", count: r.removed, affected: r.affectedPassages };
  } else {
    handled = {
      strategy: "leave_dangling",
      count: incoming.length,
      affected: Array.from(new Set(incoming.map((e) => e.from))),
    };
  }

  story.removePassageByName(args.name);

  const placeholdersRemoved: string[] = [];
  for (let i = imagePlaceholders.length - 1; i >= 0; i--) {
    if (imagePlaceholders[i]!.passageName === args.name) {
      placeholdersRemoved.push(imagePlaceholders[i]!.label);
      imagePlaceholders.splice(i, 1);
    }
  }

  return {
    kind: "ok",
    deleted: true,
    incoming_links_handled: handled,
    image_placeholders_removed: placeholdersRemoved,
  };
}
