import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const a4Dir = path.dirname(fileURLToPath(import.meta.url));
const productRoot = path.resolve(a4Dir, "..", "..", "..");
const testsDir = path.join(productRoot, ".codex", "tests");
const sourcePath = path.join(testsDir, "run-governance-fixtures.mjs");
let source = await readFile(sourcePath, "utf8");
source = source.replaceAll(/from "(\.\.\/scripts\/[^"]+)"/g, (_match, relative) => `from ${JSON.stringify(pathToFileURL(path.resolve(testsDir, relative)).href)}`);
source = source.replace("const testsDir = path.dirname(fileURLToPath(import.meta.url));", `const testsDir = ${JSON.stringify(testsDir)};`);
source = source.replace("const transientBase = path.join(testsDir, \".tmp\");", `const transientBase = ${JSON.stringify(path.join(a4Dir, "fixture-tmp"))};`);
if (!source.includes(JSON.stringify(path.join(a4Dir, "fixture-tmp")))) throw new Error("fixture transient-root substitution failed");
await import(`data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`);
