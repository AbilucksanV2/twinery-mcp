#!/usr/bin/env node
// Constitution principle V: all production deps must carry an OSI-approved
// license compatible with MIT redistribution. Fails CI if anything in the
// production dep tree is outside the allowlist.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const ALLOWED = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MPL-2.0",
  "BlueOak-1.0.0",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "CC-BY-4.0",
]);

function isAllowed(licenseField) {
  if (licenseField === undefined || licenseField === null) return false;
  const raw = typeof licenseField === "string"
    ? licenseField
    : typeof licenseField === "object" && typeof licenseField.type === "string"
      ? licenseField.type
      : "";
  if (raw.length === 0) return false;
  const trimmed = raw.replace(/^\s*\(\s*/, "").replace(/\s*\)\s*$/, "").trim();
  if (/\bOR\b/i.test(trimmed)) {
    return trimmed.split(/\s+OR\s+/i).some((part) => ALLOWED.has(part.trim().replace(/^\(|\)$/g, "")));
  }
  if (/\bAND\b/i.test(trimmed)) {
    return trimmed.split(/\s+AND\s+/i).every((part) => ALLOWED.has(part.trim().replace(/^\(|\)$/g, "")));
  }
  return ALLOWED.has(trimmed);
}

let parseable;
try {
  parseable = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (err) {
  // npm ls exits non-zero on extraneous deps but still produces output on stdout.
  if (err.stdout !== undefined && err.stdout.length > 0) parseable = err.stdout;
  else throw err;
}

const paths = parseable
  .split(/\r?\n/)
  .map((p) => p.trim())
  .filter((p) => p.length > 0 && p !== REPO_ROOT);

const violations = [];
const missing = [];
for (const pkgPath of paths) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(pkgPath, "package.json"), "utf8"));
  } catch (err) {
    missing.push(`${pkgPath}: ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  const lic = manifest.license ?? manifest.licenses;
  if (!isAllowed(lic)) {
    violations.push(`${manifest.name}@${manifest.version}: license = ${JSON.stringify(lic ?? "(none)")}`);
  }
}

if (missing.length > 0) {
  console.error("[check-licenses] FAIL — could not read manifest for some packages:");
  for (const m of missing) console.error(`  • ${m}`);
  process.exit(1);
}

if (violations.length > 0) {
  console.error(`[check-licenses] Constitution principle V violation — ${violations.length} package(s) outside the allowlist:`);
  for (const v of violations) console.error(`  • ${v}`);
  console.error(`\nAllowlist: ${[...ALLOWED].sort().join(", ")}`);
  process.exit(1);
}

console.log(`[check-licenses] OK — all ${paths.length} production packages carry an allowed license.`);
