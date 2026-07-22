import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "..", "..", "..");
const outputName = process.argv[2];
if (!["historical-integrity-before.json", "historical-integrity-after.json"].includes(outputName)) throw new Error("Unsupported historical output name.");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const taskRoots = [".codex/tasks/GOV-PHASE1-L3-REVIEW-A", ".codex/tasks/GOV-PHASE1-REMEDIATION-2", ".codex/tasks/GOV-PHASE1-L3-REVIEW-A2", ".codex/tasks/GOV-PHASE1-REMEDIATION-3"];
const externalRefs = ["docs/migration-320-compatibility-report.md", "docs/migration-320-before-after.json", "docs/migration-320-data-anomalies.csv", "docs/cross-module-closure-report.md", "docs/go-no-go-report.md"];

async function walk(ref) {
  const absolute = path.join(root, ...ref.split("/"));
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) throw new Error(`Refusing historical link: ${ref}`);
  if (info.isFile()) return [ref];
  const files = [];
  for (const entry of (await readdir(absolute)).sort()) files.push(...await walk(`${ref}/${entry}`));
  return files;
}

const refs = [...(await Promise.all(taskRoots.map(walk))).flat(), ...externalRefs].sort();
const artifacts = [];
for (const relative_path of refs) {
  const bytes = await readFile(path.join(root, ...relative_path.split("/")));
  artifacts.push({ relative_path, byte_size: bytes.byteLength, sha256: hash(bytes), artifact_type: relative_path.startsWith("docs/") ? "external-reference" : "historical-governance-record" });
}
await writeFile(path.join(taskDir, outputName), `${JSON.stringify({ schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A3", source_count: artifacts.length, artifacts }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`A3_HISTORICAL_SNAPSHOT output=${outputName} artifacts=${artifacts.length}`);
