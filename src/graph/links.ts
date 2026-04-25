import { Story, Passage } from "extwee";

export interface Edge {
  from: string;
  to: string;
  displayText: string | null;
}

const LINK_RE = /\[\[([^\[\]]+)\]\]/g;

export function extractOutgoing(passage: Passage): Edge[] {
  const out: Edge[] = [];
  for (const match of passage.text.matchAll(LINK_RE)) {
    const body = match[1]!;
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
    out.push({ from: passage.name, to: target, displayText: display });
  }
  return out;
}

export function allEdges(story: Story): Edge[] {
  return story.passages.flatMap((p) => extractOutgoing(p));
}

export function incomingTo(story: Story, name: string): Edge[] {
  return allEdges(story).filter((e) => e.to === name);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function linkPatternsFor(name: string): RegExp[] {
  const n = escapeForRegex(name);
  return [
    new RegExp(`\\[\\[${n}\\]\\]`, "g"),
    new RegExp(`\\[\\[([^\\[\\]\\|]*)->${n}\\]\\]`, "g"),
    new RegExp(`\\[\\[${n}<-([^\\[\\]\\|]*)\\]\\]`, "g"),
    new RegExp(`\\[\\[([^\\[\\]]*)\\|${n}\\]\\]`, "g"),
  ];
}

export interface RemoveLinksResult {
  removed: number;
  affectedPassages: string[];
}

export function removeIncomingLinkMarkup(
  story: Story,
  targetName: string,
): RemoveLinksResult {
  const patterns = linkPatternsFor(targetName);
  let removed = 0;
  const affected: string[] = [];
  for (const p of story.passages) {
    if (p.name === targetName) continue;
    const before = p.text;
    let after = before;
    for (const pat of patterns) {
      const re = new RegExp(pat.source, pat.flags);
      const hits = after.match(re);
      if (hits !== null) removed += hits.length;
      after = after.replace(re, "");
    }
    if (after !== before) {
      p.text = after;
      affected.push(p.name);
    }
  }
  return { removed, affectedPassages: affected };
}

export function reachableFrom(story: Story, startName: string): Set<string> {
  const visited = new Set<string>();
  const start = story.getPassageByName(startName);
  if (start === null) return visited;
  const queue: string[] = [startName];
  visited.add(startName);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const passage = story.getPassageByName(current);
    if (passage === null) continue;
    for (const edge of extractOutgoing(passage)) {
      if (story.getPassageByName(edge.to) === null) continue;
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push(edge.to);
    }
  }
  return visited;
}
