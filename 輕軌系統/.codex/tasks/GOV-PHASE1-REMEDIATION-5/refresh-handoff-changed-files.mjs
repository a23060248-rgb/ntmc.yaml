import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskBase = ".codex/tasks/GOV-PHASE1-REMEDIATION-5";
const comparison = JSON.parse(await readFile(path.join(taskDir, "baseline-comparison.json"), "utf8"));
const handoff = JSON.parse(await readFile(path.join(taskDir, "implementation-handoff.yaml"), "utf8"));

async function walk(absolute, relative, out) {
  for (const entry of (await readdir(absolute, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const ref = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await walk(path.join(absolute, entry.name), ref, out);
    else if (entry.isFile()) out.push(ref);
    else throw new Error(`Unsupported current Task object: ${ref}`);
  }
}

const taskFiles = [];
await walk(taskDir, taskBase, taskFiles);
handoff.changed_files = [...new Set([
  ...comparison.governance_source_changes.map((item) => item.relative_path),
  ...taskFiles
])].sort((a, b) => a.localeCompare(b));
await writeFile(path.join(taskDir, "implementation-handoff.yaml"), `${JSON.stringify(handoff, null, 2)}\n`, { encoding: "utf8", flag: "w" });
console.log(`HANDOFF_CHANGED_FILES concrete=${handoff.changed_files.length}`);
