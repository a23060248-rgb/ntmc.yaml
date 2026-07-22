import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir, "baseline-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(taskDir, "baseline-after.json"), "utf8"));
const mapByPath = (items) => new Map(items.map((item) => [item.relative_path, item]));
const b = mapByPath(before.files);
const a = mapByPath(after.files);
const allPaths = [...new Set([...b.keys(), ...a.keys()])].sort((x, y) => x.localeCompare(y));
const changes = [];
for (const ref of allPaths) {
  const oldItem = b.get(ref), newItem = a.get(ref);
  if (!oldItem) changes.push({ relative_path: ref, change: "added", artifact_type: newItem.artifact_type, after_sha256: newItem.sha256 });
  else if (!newItem) changes.push({ relative_path: ref, change: "deleted", artifact_type: oldItem.artifact_type, before_sha256: oldItem.sha256 });
  else if (oldItem.sha256 !== newItem.sha256 || oldItem.byte_size !== newItem.byte_size) changes.push({ relative_path: ref, change: "modified", artifact_type: oldItem.artifact_type, before_sha256: oldItem.sha256, after_sha256: newItem.sha256 });
}
const frozenChanges = changes.filter((item) => item.artifact_type === "frozen-history");
const migrationChanges = changes.filter((item) => item.artifact_type === "migration-320-governance-and-evidence");
const governanceChanges = changes.filter((item) => item.artifact_type.startsWith("governance-source"));
const report = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-5",
  before_counts: before.counts,
  after_counts: after.counts,
  frozen_history_unchanged: frozenChanges.length === 0,
  migration_320_task_unchanged: migrationChanges.length === 0,
  current_task_excluded_from_both: !before.files.some((item) => item.relative_path.includes("GOV-PHASE1-REMEDIATION-5")) && !after.files.some((item) => item.relative_path.includes("GOV-PHASE1-REMEDIATION-5")),
  governance_source_changes: governanceChanges,
  frozen_history_changes: frozenChanges,
  migration_320_changes: migrationChanges,
  comparison_result: frozenChanges.length || migrationChanges.length ? "FAIL" : "PASS"
};
await writeFile(path.join(taskDir, "baseline-comparison.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "w" });
console.log(`BASELINE_COMPARISON result=${report.comparison_result} governance_changes=${governanceChanges.length} frozen_changes=${frozenChanges.length} migration_changes=${migrationChanges.length}`);
process.exit(report.comparison_result === "PASS" ? 0 : 1);
