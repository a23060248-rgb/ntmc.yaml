import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir, "historical-integrity-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(taskDir, "historical-integrity-after.json"), "utf8"));
const beforeMap = new Map(before.artifacts.map((item) => [item.relative_path, item]));
const afterMap = new Map(after.artifacts.map((item) => [item.relative_path, item]));
const changed = [], missing = [], added = [];
for (const [ref, item] of beforeMap) if (!afterMap.has(ref)) missing.push(ref); else if (JSON.stringify(item) !== JSON.stringify(afterMap.get(ref))) changed.push({ relative_path: ref, before: item, after: afterMap.get(ref) });
for (const ref of afterMap.keys()) if (!beforeMap.has(ref)) added.push(ref);
const groups = { session_a: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A/", phase1_2: ".codex/tasks/GOV-PHASE1-REMEDIATION-2/", session_a2: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A2/", phase1_3: ".codex/tasks/GOV-PHASE1-REMEDIATION-3/", migration_320_external: "docs/" };
const group_results = Object.fromEntries(Object.entries(groups).map(([name, prefix]) => [name, { artifact_count: after.artifacts.filter((item) => item.relative_path.startsWith(prefix)).length, unchanged: !changed.some((item) => item.relative_path.startsWith(prefix)) && !missing.some((ref) => ref.startsWith(prefix)) && !added.some((ref) => ref.startsWith(prefix)) }]));
const result = !changed.length && !missing.length && !added.length ? "PASS" : "FAIL";
const output = { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A3", before_count: before.artifacts.length, after_count: after.artifacts.length, group_results, changed_artifacts: changed, missing_artifacts: missing, added_artifacts: added, result };
await writeFile(path.join(taskDir, "historical-artifact-integrity.json"), `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`A3_HISTORICAL_COMPARE result=${result} before=${before.artifacts.length} after=${after.artifacts.length}`);
