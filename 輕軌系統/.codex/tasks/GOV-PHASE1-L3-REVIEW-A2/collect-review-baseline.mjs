import { readdir, readFile, lstat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "..", "..", "..");
const ownPrefix = ".codex/tasks/GOV-PHASE1-L3-REVIEW-A2/";
const outputName = process.argv[2];
if (!["review-baseline-before.json", "review-baseline-after.json"].includes(outputName)) throw new Error("Unsupported baseline output name.");

async function walk(relativeDir) {
  const entries = await readdir(path.join(root, ...relativeDir.split("/")), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const ref = `${relativeDir}/${entry.name}`;
    if (ref.startsWith(ownPrefix) || ref.startsWith(".codex/tests/.tmp/") || entry.name.toLowerCase().startsWith(".env")) continue;
    const absolute = path.join(root, ...ref.split("/"));
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Refusing link or reparse artifact: ${ref}`);
    if (info.isDirectory()) files.push(...await walk(ref));
    else if (info.isFile()) files.push(ref);
    else throw new Error(`Unsupported filesystem object: ${ref}`);
  }
  return files;
}

const refs = ["AGENTS.md", ...await walk(".agents"), ...await walk(".codex")].sort();
const artifacts = [];
for (const relative_path of refs) {
  const bytes = await readFile(path.join(root, ...relative_path.split("/")));
  artifacts.push({ relative_path, byte_size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(), artifact_type: relative_path === "AGENTS.md" ? "governance-policy" : `governance-${path.extname(relative_path).slice(1).toLowerCase() || "text"}` });
}
await writeFile(path.join(taskDir, outputName), `${JSON.stringify({ schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A2", excluded: [ownPrefix + "**", ".codex/tests/.tmp/**", "transient runtime roots"], source_count: artifacts.length, artifacts }, null, 2)}\n`, { flag: "wx" });
