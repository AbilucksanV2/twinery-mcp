import { Story } from "extwee";

export interface RenameResult {
  renamed: true;
  incomingLinksRewritten: number;
  affectedPassages: string[];
  startPassageUpdated: boolean;
}

export function renamePassage(
  story: Story,
  oldName: string,
  newName: string,
): RenameResult {
  if (oldName === newName) {
    throw new Error("new_name is identical to old_name");
  }
  const target = story.getPassageByName(oldName);
  if (target === null) {
    throw new Error(`Passage '${oldName}' does not exist`);
  }
  if (story.getPassageByName(newName) !== null) {
    throw new Error(`A passage named '${newName}' already exists`);
  }

  target.name = newName;

  const escapedOld = escapeForRegex(oldName);
  const affected: string[] = [];
  let rewritten = 0;

  // Matches:   [[oldName]]       →  [[newName]]
  //            [[text->oldName]] →  [[text->newName]]
  //            [[oldName<-text]] →  [[newName<-text]]
  //            [[text|oldName]]  →  [[text|newName]]
  const patterns: RegExp[] = [
    new RegExp(`\\[\\[${escapedOld}\\]\\]`, "g"),
    new RegExp(`\\[\\[([^\\[\\]\\|]*)->${escapedOld}\\]\\]`, "g"),
    new RegExp(`\\[\\[${escapedOld}<-([^\\[\\]\\|]*)\\]\\]`, "g"),
    new RegExp(`\\[\\[([^\\[\\]]*)\\|${escapedOld}\\]\\]`, "g"),
  ];

  for (const p of story.passages) {
    if (p.name === newName) continue;
    const before = p.text;
    let after = before;
    after = after.replace(patterns[0]!, `[[${newName}]]`);
    after = after.replace(patterns[1]!, (_m: string, display: string) => `[[${display}->${newName}]]`);
    after = after.replace(patterns[2]!, (_m: string, display: string) => `[[${newName}<-${display}]]`);
    after = after.replace(patterns[3]!, (_m: string, display: string) => `[[${display}|${newName}]]`);
    if (after !== before) {
      const matches = countMatches(before, patterns);
      rewritten += matches;
      affected.push(p.name);
      p.text = after;
    }
  }

  const startUpdated = story.start === oldName;
  if (startUpdated) {
    story.start = newName;
  }

  return {
    renamed: true,
    incomingLinksRewritten: rewritten,
    affectedPassages: affected,
    startPassageUpdated: startUpdated,
  };
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const pat of patterns) {
    const re = new RegExp(pat.source, pat.flags);
    const matches = text.match(re);
    if (matches !== null) n += matches.length;
  }
  return n;
}
