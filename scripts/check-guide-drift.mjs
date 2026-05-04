#!/usr/bin/env node
// Constitution principle II: the LLM-facing guide MUST stay in sync with the
// tool registry. The guide is auto-generated from src/guide/build.ts; this
// script regenerates it in-process and asserts byte-equivalence with the
// committed docs/GUIDE.md.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const GUIDE_PATH = join(REPO_ROOT, "docs", "GUIDE.md");
const BUILD_MODULE = pathToFileURL(join(REPO_ROOT, "dist", "guide", "build.js")).href;

let buildGuide;
try {
  ({ buildGuide } = await import(BUILD_MODULE));
} catch (err) {
  console.error(`[check-guide-drift] Could not import dist/guide/build.js — run 'npm run build' first.`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const live = buildGuide();
let onDisk;
try {
  onDisk = await readFile(GUIDE_PATH, "utf8");
} catch (err) {
  console.error(`[check-guide-drift] docs/GUIDE.md missing — run 'npm run guide:generate' and commit.`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

if (live === onDisk) {
  console.log(`[check-guide-drift] OK — docs/GUIDE.md is byte-equivalent to the registry-generated guide (${live.length} bytes).`);
  process.exit(0);
}

// Show a small unified-diff style summary so the failure log is actionable.
const liveLines = live.split("\n");
const diskLines = onDisk.split("\n");
const maxLines = Math.max(liveLines.length, diskLines.length);
const diff = [];
for (let i = 0; i < maxLines; i++) {
  if (liveLines[i] !== diskLines[i]) {
    if (diskLines[i] !== undefined) diff.push(`  - ${i + 1}: ${diskLines[i]}`);
    if (liveLines[i] !== undefined) diff.push(`  + ${i + 1}: ${liveLines[i]}`);
    if (diff.length >= 40) {
      diff.push("  ... (truncated)");
      break;
    }
  }
}

console.error("[check-guide-drift] docs/GUIDE.md drift detected — run 'npm run guide:generate' and commit:");
console.error(diff.join("\n"));
process.exit(1);
