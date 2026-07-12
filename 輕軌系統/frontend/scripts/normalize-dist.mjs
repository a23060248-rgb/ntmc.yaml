import { readFile, writeFile } from "node:fs/promises";

const outputPath = new URL("../dist/index.html", import.meta.url);
const source = await readFile(outputPath, "utf8");
const normalized = source
  .replace(/[ \t]+(?=\r?$)/gm, "")
  .replace(/(?:\r?\n)*$/, "\n");

if (normalized !== source) {
  await writeFile(outputPath, normalized, "utf8");
}
