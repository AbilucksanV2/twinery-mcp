import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { parseTwee, parseTwine2HTML, parseJSON, type Story, type Passage } from "extwee";

const FIXTURES_DIR = resolve(process.cwd(), "fixtures");

interface RoundTrip {
  name: string;
  run: (original: Story) => Story;
}

const ROUND_TRIPS: RoundTrip[] = [
  { name: "twee→twee", run: (s) => parseTwee(s.toTwee()) },
  { name: "twee→html→twee", run: (s) => parseTwine2HTML(s.toTwine2HTML()) },
  { name: "twee→json→twee", run: (s) => parseJSON(s.toJSON()) },
];

interface Failure {
  fixture: string;
  path: string;
  field: string;
  expected: string;
  actual: string;
}

function preview(value: unknown, limit = 80): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s === undefined) return "(undefined)";
  if (s.length <= limit) return s;
  return `${s.slice(0, limit)}…`;
}

function pushIfDiff(failures: Failure[], ctx: { fixture: string; path: string }, field: string, expected: unknown, actual: unknown): void {
  const a = JSON.stringify(expected);
  const b = JSON.stringify(actual);
  if (a !== b) {
    failures.push({ fixture: ctx.fixture, path: ctx.path, field, expected: preview(expected), actual: preview(actual) });
  }
}

function sortedTags(p: Passage): string[] {
  return [...(p.tags ?? [])].sort();
}

function passageMetadata(p: Passage): Record<string, unknown> {
  // Exclude position/size — see plan.md R2.
  const { position, size, ...rest } = p.metadata ?? {};
  void position;
  void size;
  return rest;
}

function comparePassage(failures: Failure[], ctx: { fixture: string; path: string }, name: string, expected: Passage, actual: Passage): void {
  pushIfDiff(failures, ctx, `passage[${name}].text`, expected.text, actual.text);
  pushIfDiff(failures, ctx, `passage[${name}].tags`, sortedTags(expected), sortedTags(actual));
  pushIfDiff(failures, ctx, `passage[${name}].metadata`, passageMetadata(expected), passageMetadata(actual));
}

function compareStory(fixture: string, path: string, expected: Story, actual: Story): Failure[] {
  const failures: Failure[] = [];
  const ctx = { fixture, path };

  pushIfDiff(failures, ctx, "name", expected.name, actual.name);
  pushIfDiff(failures, ctx, "IFID", expected.IFID, actual.IFID);
  pushIfDiff(failures, ctx, "format", expected.format, actual.format);
  pushIfDiff(failures, ctx, "formatVersion", expected.formatVersion, actual.formatVersion);
  pushIfDiff(failures, ctx, "start", expected.start, actual.start);
  pushIfDiff(failures, ctx, "zoom", expected.zoom, actual.zoom);
  pushIfDiff(failures, ctx, "tagColors", expected.tagColors, actual.tagColors);

  // KI-001 (specs/008-fixtures/known-issues.md): extwee's parseJSON drops
  // storyJavaScript / storyStylesheet on read-back. Keep these strict for
  // twee↔twee and twee↔html↔twee — the paths that actually matter today.
  if (path !== "twee→json→twee") {
    pushIfDiff(failures, ctx, "storyJavaScript", expected.storyJavaScript, actual.storyJavaScript);
    pushIfDiff(failures, ctx, "storyStylesheet", expected.storyStylesheet, actual.storyStylesheet);
  }

  const expectedNames = expected.passages.map((p) => p.name).sort();
  const actualNames = actual.passages.map((p) => p.name).sort();
  pushIfDiff(failures, ctx, "passages[].names", expectedNames, actualNames);

  for (const ep of expected.passages) {
    const ap = actual.getPassageByName(ep.name);
    if (ap === null) continue; // already surfaced by the names diff above
    comparePassage(failures, ctx, ep.name, ep, ap);
  }
  return failures;
}

async function listFixtures(): Promise<string[]> {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function main(): Promise<void> {
  console.log("Twinery MCP — All-format round-trip fixtures\n=============================================");

  const fixtureNames = await listFixtures();
  if (fixtureNames.length === 0) {
    console.error("No fixtures found under fixtures/.");
    process.exit(1);
  }

  const allFailures: Failure[] = [];
  let checks = 0;

  for (const fixture of fixtureNames) {
    const sourcePath = join(FIXTURES_DIR, fixture, "source.twee");
    let originalSource: string;
    try {
      originalSource = await readFile(sourcePath, "utf8");
    } catch (err) {
      console.error(`✗ ${fixture}: cannot read ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    let original: Story;
    try {
      original = parseTwee(originalSource);
    } catch (err) {
      console.error(`✗ ${fixture}: parseTwee threw on the source: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    console.log(`\n${fixture}  (${original.passages.length} passages, format=${original.format} ${original.formatVersion})`);

    for (const rt of ROUND_TRIPS) {
      checks += 1;
      let actual: Story;
      try {
        actual = rt.run(original);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${rt.name}: round-trip threw — ${msg}`);
        allFailures.push({ fixture, path: rt.name, field: "(throw)", expected: "(no throw)", actual: msg });
        continue;
      }
      const fs = compareStory(fixture, rt.name, original, actual);
      if (fs.length === 0) {
        console.log(`  ✓ ${rt.name}`);
      } else {
        console.log(`  ✗ ${rt.name}  (${fs.length} field diff(s))`);
        allFailures.push(...fs);
      }
    }
  }

  console.log(`\n=============================================`);
  if (allFailures.length === 0) {
    console.log(`ALL FIXTURE ROUND-TRIPS PASSED ✓  (${checks} checks across ${fixtureNames.length} formats)`);
    return;
  }

  console.error(`FIXTURE ROUND-TRIP FAILURES: ${allFailures.length}`);
  for (const f of allFailures) {
    console.error(`  ✗ ${f.fixture} / ${f.path} / ${f.field}`);
    console.error(`      expected: ${f.expected}`);
    console.error(`      actual:   ${f.actual}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("\nFIXTURE RUNNER FAILED:", err);
  process.exit(1);
});
