import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildGuide } from "./build.js";

const OUTPUT = resolve(process.cwd(), "docs/GUIDE.md");

async function main(): Promise<void> {
  const contents = buildGuide();
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, contents, "utf8");
  console.log(`Wrote ${OUTPUT} (${contents.length} bytes)`);
}

main().catch((err) => {
  console.error("guide generation failed:", err);
  process.exit(1);
});
