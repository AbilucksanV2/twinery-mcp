import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeFile } from "node:fs/promises";

import * as createStory from "./server/tools/create_story.js";
import * as createPassage from "./server/tools/create_passage.js";
import * as updatePassage from "./server/tools/update_passage.js";
import * as renamePassage from "./server/tools/rename_passage.js";
import * as deletePassage from "./server/tools/delete_passage.js";
import * as linkPassages from "./server/tools/link_passages.js";
import * as setStartPassage from "./server/tools/set_start_passage.js";
import * as listPassages from "./server/tools/list_passages.js";
import * as getPassage from "./server/tools/get_passage.js";
import * as validateStory from "./server/tools/validate_story.js";
import * as saveStory from "./server/tools/save_story.js";
import * as respondToClarification from "./server/tools/respond_to_clarification.js";
import * as addImagePlaceholder from "./server/tools/add_image_placeholder.js";
import { buildGuide } from "./guide/build.js";
import { TOOL_REGISTRY } from "./guide/registry.js";

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

  section("8. add_image_placeholder — add 'brass-lock' to 'Lockpick' passage");
  const img1 = await addImagePlaceholder.handler({
    passage_name: "Lockpick",
    label: "brass-lock",
  }) as { kind: string; expected_filename: string; expected_path: string; path_is_final: boolean };
  if (img1.kind !== "ok") fail("add_image_placeholder did not return ok: " + JSON.stringify(img1));
  if (img1.expected_filename !== "brass-lock.png") fail(`expected filename brass-lock.png, got ${img1.expected_filename}`);
  if (img1.path_is_final !== false) fail("path_is_final should be false pre-save");
  if (!img1.expected_path.includes("assets/locked-door/brass-lock.png")) fail(`expected path contains assets/locked-door/brass-lock.png, got ${img1.expected_path}`);
  ok(`placeholder added; expected file: ${img1.expected_filename} at ${img1.expected_path}`);

  section("9. add_image_placeholder — duplicate label surfaces clarification (no silent rename)");
  const imgDup = await addImagePlaceholder.handler({
    passage_name: "Lockpick",
    label: "brass-lock",
  });
  if (!isClarification(imgDup)) fail("expected clarification for duplicate label");
  ok(`server asked: "${imgDup.clarification.question}"`);
  if (!imgDup.clarification.valid_answers?.includes("confirm_auto_suffix")) fail("expected confirm_auto_suffix as a valid answer");
  const imgResolved = await respondToClarification.handler({
    clarification_id: imgDup.clarification.clarification_id,
    answer: "confirm_auto_suffix",
  }) as { kind: string; placeholder?: { label: string } };
  if (imgResolved.kind !== "ok" || imgResolved.placeholder?.label !== "brass-lock-2") {
    fail("expected auto-suffixed label brass-lock-2, got: " + JSON.stringify(imgResolved));
  }
  ok("auto-suffix accepted; second placeholder labeled brass-lock-2");

  section("10. save_story — write .twee/.html and report pending_image_drops");
  const tmp = await mkdtemp(join(tmpdir(), "twinery-smoke-"));
  const saved = await saveStory.handler({ output_dir: tmp }) as {
    kind: string;
    written_files: string[];
    assets_dir: string;
    pending_image_drops: Array<{ label: string; expected_path: string }>;
  };
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

  // Passage text is HTML-encoded inside <tw-storydata> per the Twine 2 HTML spec;
  // the Twine runtime decodes it at play time. Check for the decoded substrings.
  if (!htmlBody.includes("twinery-mcp-image")) fail(".html missing image placeholder block identifier");
  if (!htmlBody.includes("brass-lock.png")) fail(".html missing brass-lock image src");
  ok(".html contains image placeholder block with brass-lock.png reference");

  if (saved.pending_image_drops.length !== 2) fail(`expected 2 pending image drops, got ${saved.pending_image_drops.length}`);
  ok(`save_story reports ${saved.pending_image_drops.length} pending image drops: ${saved.pending_image_drops.map((d) => d.label).join(", ")}`);

  section("11. pending_image_drops shrinks after a file appears on disk");
  const dropPath = saved.pending_image_drops[0]!.expected_path;
  await writeFile(dropPath, "fake-png-bytes", "utf8");
  const saved2 = await saveStory.handler({ output_dir: tmp }) as { pending_image_drops: Array<{ label: string }> };
  if (saved2.pending_image_drops.length !== 1) fail(`expected 1 pending drop after file appeared, got ${saved2.pending_image_drops.length}`);
  ok(`after dropping one file: ${saved2.pending_image_drops.length} pending drop(s) remain`);

  await rm(tmp, { recursive: true, force: true });

  section("12. Guide generator — covers every registered tool");
  const guide = buildGuide();
  if (!guide.startsWith("# Twinery MCP Server — Tool Guide")) fail("guide missing title");
  for (const tool of TOOL_REGISTRY) {
    const heading = `### \`${tool.name}\``;
    if (!guide.includes(heading)) fail(`guide missing heading for ${tool.name}`);
  }
  ok(`guide mentions all ${TOOL_REGISTRY.length} registered tools`);
  ok(`guide size: ${guide.length} bytes`);

  section("13. get_passage — full passage read");
  const g1 = await getPassage.handler({ name: "Lockpick" }) as {
    kind: string;
    passage: { name: string; text: string; outgoing_links: Array<{ to_passage: string }> };
  };
  if (g1.kind !== "ok" || g1.passage.name !== "Lockpick") fail("get_passage did not return Lockpick");
  ok(`returned passage "${g1.passage.name}" with ${g1.passage.text.length} chars of text`);

  section("14. get_passage — clarification on unknown name lists existing passages");
  const gMiss = await getPassage.handler({ name: "NoSuchPassage" });
  if (!isClarification(gMiss)) fail("expected clarification for unknown passage");
  if (!(gMiss.clarification.valid_answers?.includes("Start") ?? false)) fail("valid_answers should include existing passage names");
  ok(`server asked; valid answers include existing passages: ${JSON.stringify(gMiss.clarification.valid_answers)}`);

  section("15. update_passage — rewrite Kick Door's text and tag it");
  const upd = await updatePassage.handler({
    name: "Kick Door",
    text: "You kick it open with a splintering crash.",
    tags: ["violent"],
  }) as { kind: string; fields_changed: string[]; passage: { text: string; tags: string[] } };
  if (upd.kind !== "ok") fail("update_passage failed");
  if (!upd.fields_changed.includes("text") || !upd.fields_changed.includes("tags")) {
    fail(`fields_changed should include text and tags, got ${JSON.stringify(upd.fields_changed)}`);
  }
  if (!upd.passage.tags.includes("violent")) fail("tag not applied");
  ok(`updated; fields_changed=${JSON.stringify(upd.fields_changed)}, tags=${JSON.stringify(upd.passage.tags)}`);

  section("16. set_start_passage — flip to Lockpick and back to Start");
  const setA = await setStartPassage.handler({ name: "Lockpick" }) as { kind: string; previous_start: string | null; current_start: string };
  if (setA.kind !== "ok" || setA.previous_start !== "Start" || setA.current_start !== "Lockpick") {
    fail(`set_start to Lockpick unexpected: ${JSON.stringify(setA)}`);
  }
  ok(`start moved: previous=${setA.previous_start}, current=${setA.current_start}`);
  const setB = await setStartPassage.handler({ name: "Start" }) as { kind: string; current_start: string };
  if (setB.kind !== "ok" || setB.current_start !== "Start") fail("set_start back to Start failed");
  ok(`restored start to ${setB.current_start}`);

  section("17. delete_passage — incoming-link clarification + remove_link_markup");
  const del1 = await deletePassage.handler({ name: "Kick Door" });
  if (!isClarification(del1)) fail("expected clarification when deleting a linked-to passage");
  if (!(del1.clarification.valid_answers?.includes("remove_link_markup") ?? false)) fail("valid_answers should offer remove_link_markup");
  ok(`server asked: "${del1.clarification.question}"`);
  const delResolved = await respondToClarification.handler({
    clarification_id: del1.clarification.clarification_id,
    answer: "remove_link_markup",
  }) as {
    kind: string;
    deleted: boolean;
    incoming_links_handled: { strategy: string; count: number; affected: string[] };
  };
  if (delResolved.kind !== "ok" || !delResolved.deleted) fail("delete did not complete");
  if (delResolved.incoming_links_handled.count !== 1) fail(`expected 1 incoming link handled, got ${delResolved.incoming_links_handled.count}`);
  ok(`deleted; ${delResolved.incoming_links_handled.count} incoming link(s) stripped from ${JSON.stringify(delResolved.incoming_links_handled.affected)}`);

  const lst3 = await listPassages.handler({ include_text: true }) as {
    passage_count: number;
    passages: Array<{ name: string; text?: string; outgoing_links: Array<{ to_passage: string }> }>;
  };
  if (lst3.passage_count !== 2) fail(`expected 2 passages remaining, got ${lst3.passage_count}`);
  const startP2 = lst3.passages.find((p) => p.name === "Start");
  if (startP2 === undefined || startP2.text?.includes("Kick Door") === true) fail("Start still references Kick Door after removal");
  ok(`2 passages remain; Start no longer links to Kick Door`);

  section("18. validate_story — clean graph after all mutations");
  const v = await validateStory.handler() as {
    kind: string;
    ok: boolean;
    broken_links: unknown[];
    orphans: string[];
    duplicate_names: string[];
    ifid_valid: boolean;
    start_passage_valid: boolean;
  };
  if (v.kind !== "ok" || !v.ok) fail(`validate_story reported issues: ${JSON.stringify(v)}`);
  if (v.broken_links.length !== 0) fail(`expected 0 broken links, got ${v.broken_links.length}`);
  if (v.orphans.length !== 0) fail(`expected 0 orphans, got ${JSON.stringify(v.orphans)}`);
  if (!v.ifid_valid || !v.start_passage_valid) fail("IFID or start_passage invalid");
  ok(`validate_story: ok=true, broken=0, orphans=0, duplicates=0, ifid_valid, start_passage_valid`);

  section("19. save_story without output_dir reuses the remembered path");
  const sFinal = await saveStory.handler({}) as { kind: string; output_dir: string; used_remembered_path: boolean };
  if (sFinal.kind !== "ok") fail("expected save_story to succeed via remembered path: " + JSON.stringify(sFinal));
  if (sFinal.used_remembered_path !== true) fail("expected used_remembered_path=true");
  ok(`re-saved to remembered path (used_remembered_path=${sFinal.used_remembered_path})`);
  await rm(sFinal.output_dir, { recursive: true, force: true });

  console.log("\n==========================");
  console.log("ALL SMOKE CHECKS PASSED ✓");
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err);
  process.exit(1);
});
