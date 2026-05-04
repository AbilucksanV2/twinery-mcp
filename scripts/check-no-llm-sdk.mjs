#!/usr/bin/env node
// Constitution principle II: no LLM-provider SDK at runtime.
// Fails CI if any blocked vendor SDK shows up in package.json deps or src/ imports.

import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();
const BLOCKED_PACKAGES = [
  "@anthropic-ai/sdk",
  "openai",
  "@google/generative-ai",
  "@google-ai/generativelanguage",
  "cohere-ai",
  "@mistralai/mistralai",
];

const violations = [];

const pkg = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8"));
for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
  const map = pkg[section] ?? {};
  for (const name of Object.keys(map)) {
    if (BLOCKED_PACKAGES.includes(name)) {
      violations.push(`package.json/${section}: blocked SDK "${name}"`);
    }
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const srcDir = join(REPO_ROOT, "src");
let srcExists = true;
try { await stat(srcDir); } catch { srcExists = false; }

if (srcExists) {
  const files = await walk(srcDir);
  const importPattern = new RegExp(
    `(?:from|require\\()\\s*['"](?:${BLOCKED_PACKAGES.map((p) => p.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})(?:\\/[^'"]*)?['"]`,
  );
  for (const file of files) {
    const text = await readFile(file, "utf8");
    text.split(/\r?\n/).forEach((line, i) => {
      if (importPattern.test(line)) {
        violations.push(`${relative(REPO_ROOT, file)}:${i + 1}  ${line.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error("[check-no-llm-sdk] Constitution principle II violation — blocked LLM SDK imports / deps:");
  for (const v of violations) console.error(`  • ${v}`);
  console.error(`\nBlocklist: ${BLOCKED_PACKAGES.join(", ")}`);
  process.exit(1);
}

console.log(`[check-no-llm-sdk] OK — no blocked SDKs in deps or imports (checked ${BLOCKED_PACKAGES.length} packages).`);
