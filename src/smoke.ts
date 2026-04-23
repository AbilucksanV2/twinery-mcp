import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as createStory from "./server/tools/create_story.js";
import * as createPassage from "./server/tools/create_passage.js";
import * as linkPassages from "./server/tools/link_passages.js";
import * as renamePassage from "./server/tools/rename_passage.js";
import * as listPassages from "./server/tools/list_passages.js";
import * as saveStory from "./server/tools/save_story.js";
import * as respondToClarification from "./server/tools/respond_to_clarification.js";

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}
function section(title: string): void {
  console.log(`\n${title}`);
}

interface ClarificationShape {
  kind: "clarification_needed";
  clarification: {
    clarification_id: string;
    question: string;
    valid_answers?: string[];
  };
}

function isClarification(x: unknown): x is ClarificationShape {
  return typeof x === "object" && x !== null && (x as { kind?: string }).kind === "clarification_needed";
}

async function main(): Promise<void> {
  console.log("Twinery MCP POC smoke test\n==========================");

  section("1. Clarification path: create_story without format");
  const c1 = await createStory.handler({ name: "Locked Door" });
  if (!isClarification(c1)) fail("expected clarification_needed, got: " + JSON.stringify(c1));
  ok(`server asked: "${c1.clarification.question}"`);
  ok(`valid answers: ${JSON.stringify(c1.clarification.valid_answers)}`);

  section("2. Resolve the clarification with Harlowe");
  const r1 = await respondToClarification.handler({
    clarification_id: c1.clarification.clarification_id,
    answer: "Harlowe",
  }) as { kind: string; story?: { name: string; format: string; ifid: string; story_slug: string } };
  if (r1.kind !== "ok" || r1.story === undefined) fail("expected ok, got: " + JSON.stringify(r1));
  ok(`story created: ${r1.story.name} (${r1.story.format}) IFID=${r1.story.ifid} slug=${r1.story.story_slug}`);

  section("3. Build a 3-passage branching story");
  const p1 = await createPassage.handler({
    name: "Start",
    text: "You stand before a locked door.",
    set_as_start: true,
    tags: [],
  }) as { kind: string; is_start: boolean; passage_count: number };
  if (p1.kind !== "ok" || !p1.is_start) fail("start passage not created");
  ok(`created Start (is_start=${p1.is_start}, count=${p1.passage_count})`);

  await createPassage.handler({ name: "Pick Lock", text: "You pick the lock and slip through.", tags: [] });
  await createPassage.handler({ name: "Kick Door", text: "You kick it open with a splinter of wood.", tags: [] });
  ok("created Pick Lock and Kick Door");

  section("4. link_passages — decision point out of Start");
  const l1 = await linkPassages.handler({ from_passage: "Start", to_passage: "Pick Lock", display_text: "Try to pick it" }) as { kind: string; rendered_syntax: string };
  const l2 = await linkPassages.handler({ from_passage: "Start", to_passage: "Kick Door", display_text: "Kick it down" }) as { kind: string; rendered_syntax: string };
  if (l1.kind !== "ok" || l2.kind !== "ok") fail("link insert failed");
  ok(`link 1: ${l1.rendered_syntax}`);
  ok(`link 2: ${l2.rendered_syntax}`);

  section("5. Clarification path: link to nonexistent target");
  const c2 = await linkPassages.handler({ from_passage: "Start", to_passage: "Nonexistent", display_text: "go nowhere" });
  if (!isClarification(c2)) fail("expected clarification for nonexistent target");
  ok(`server refused silent creation and asked: "${c2.clarification.question}"`);
  const r2 = await respondToClarification.handler({ clarification_id: c2.clarification.clarification_id, answer: "cancel" }) as { kind: string; cancelled?: boolean };
  if (r2.kind !== "ok" || r2.cancelled !== true) fail("cancel branch did not return cancelled=true");
  ok("cancelled cleanly — no silent passage creation");

  section("6. list_passages");
  const lst = await listPassages.handler({ include_text: false }) as { kind: string; passages: Array<{ name: string; outgoing_links: Array<{ to_passage: string }> }> };
  if (lst.kind !== "ok" || lst.passages.length !== 3) fail(`expected 3 passages, got ${lst.passages.length}`);
  const startP = lst.passages.find((p) => p.name === "Start");
  if (startP === undefined || startP.outgoing_links.length !== 2) fail("Start should have 2 outgoing links");
  ok(`3 passages listed; Start has ${startP.outgoing_links.length} outgoing links`);

  section("7. rename_passage — integrity check (Pick Lock → Lockpick)");
  const ren = await renamePassage.handler({ old_name: "Pick Lock", new_name: "Lockpick" }) as { kind: string; incoming_links_rewritten: number; affected_passages: string[] };
  if (ren.kind !== "ok" || ren.incoming_links_rewritten !== 1) fail(`expected 1 rewritten link, got ${ren.incoming_links_rewritten}`);
  ok(`renamed; incoming_links_rewritten=${ren.incoming_links_rewritten}, affected=${JSON.stringify(ren.affected_passages)}`);

  const lst2 = await listPassages.handler({ include_text: false }) as { passages: Array<{ name: string; outgoing_links: Array<{ to_passage: string }> }> };
  const startAfter = lst2.passages.find((p) => p.name === "Start");
  if (startAfter === undefined) fail("Start missing after rename");
  const hasOld = startAfter.outgoing_links.some((l) => l.to_passage === "Pick Lock");
  const hasNew = startAfter.outgoing_links.some((l) => l.to_passage === "Lockpick");
  if (hasOld) fail("old link target still present after rename");
  if (!hasNew) fail("new link target not present after rename");
  ok("graph integrity preserved (no broken incoming links)");

  section("8. save_story — write .twee and .html");
  const tmp = await mkdtemp(join(tmpdir(), "twinery-smoke-"));
  const saved = await saveStory.handler({ output_dir: tmp }) as { kind: string; written_files: string[]; assets_dir: string };
  if (saved.kind !== "ok" || saved.written_files.length !== 2) fail("save_story did not write both files");
  ok(`wrote: ${saved.written_files.map((f) => f.replace(tmp, "<tmp>")).join(", ")}`);
  ok(`assets dir: ${saved.assets_dir.replace(tmp, "<tmp>")}`);

  const tweeBody = await readFile(saved.written_files[0]!, "utf8");
  const htmlBody = await readFile(saved.written_files[1]!, "utf8");
  if (!tweeBody.includes(":: Start")) fail(".twee missing Start passage");
  if (!tweeBody.includes("[[Try to pick it->Lockpick]]")) fail(".twee missing rewritten link");
  if (!htmlBody.includes("<tw-storydata")) fail(".html missing <tw-storydata>");
  if (!htmlBody.includes('format="Harlowe"')) fail(".html missing format attribute");
  ok(".twee contains rewritten link");
  ok(".html contains <tw-storydata> with Harlowe format");

  await rm(tmp, { recursive: true, force: true });

  section("9. Clarification path: save_story without output_dir");
  const c3 = await saveStory.handler({});
  if (!isClarification(c3)) fail("expected clarification for missing output_dir");
  ok(`server asked: "${c3.clarification.question}"`);

  console.log("\n==========================");
  console.log("ALL SMOKE CHECKS PASSED ✓");
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err);
  process.exit(1);
});
