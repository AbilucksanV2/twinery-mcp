import { z } from "zod";
import { requireActiveStory } from "../state.js";
import { allEdges, reachableFrom } from "../../graph/links.js";

const IFID_RE = /^[0-9A-F-]{8,63}$/;

export const description =
  "Run the full integrity sweep: broken links, orphan passages, duplicate names, IFID shape, and start-passage validity. Read-only; never emits a clarification.";

export const clarificationTriggers: string[] = [];

export const example = {
  title: "Audit the story before saving",
  input: {},
  note: "Returns an `ok: true` flag alongside per-category lists; if any list is non-empty, `ok` is false.",
};

export const inputSchema = {};

export async function handler(): Promise<object> {
  const { story } = requireActiveStory();

  const passageNames = story.passages.map((p) => p.name);
  const passageNameSet = new Set(passageNames);

  const duplicateNames: string[] = [];
  const seen = new Set<string>();
  for (const n of passageNames) {
    if (seen.has(n)) duplicateNames.push(n);
    else seen.add(n);
  }

  const brokenLinks: Array<{ from_passage: string; to_passage: string }> = [];
  for (const edge of allEdges(story)) {
    if (!passageNameSet.has(edge.to)) {
      brokenLinks.push({ from_passage: edge.from, to_passage: edge.to });
    }
  }

  const startValid = story.start !== "" && passageNameSet.has(story.start);

  let orphans: string[] = [];
  if (startValid) {
    const reachable = reachableFrom(story, story.start);
    orphans = passageNames.filter((n) => !reachable.has(n));
  } else {
    orphans = [...passageNames];
  }

  const ifidValid = IFID_RE.test(story.IFID);

  const ok =
    brokenLinks.length === 0 &&
    orphans.length === 0 &&
    duplicateNames.length === 0 &&
    ifidValid &&
    startValid;

  return {
    kind: "ok",
    ok,
    broken_links: brokenLinks,
    orphans,
    duplicate_names: duplicateNames,
    ifid_valid: ifidValid,
    start_passage_valid: startValid,
    start_passage: story.start === "" ? null : story.start,
    passage_count: passageNames.length,
  };
}
