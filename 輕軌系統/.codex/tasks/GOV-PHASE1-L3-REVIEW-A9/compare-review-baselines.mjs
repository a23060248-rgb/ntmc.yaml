import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir, "review-baseline-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(taskDir, "review-baseline-after.json"), "utf8"));
const key = (item) => `${item.artifact_type}|${item.relative_path}`;
const beforeMap = new Map(before.files.map((item) => [key(item), item]));
const afterMap = new Map(after.files.map((item) => [key(item), item]));
const types = ["candidate-artifact", "frozen-history", "remediation-8", "review-a8", "remediation-9", "migration-320-task", "migration-320-external-evidence"];

function changesFor(type) {
  const ids = [...new Set([...before.files.filter((item) => item.artifact_type === type).map(key), ...after.files.filter((item) => item.artifact_type === type).map(key)])].sort();
  const added = [], deleted = [], modified = [];
  let unchangedCount = 0;
  for (const id of ids) {
    const left = beforeMap.get(id), right = afterMap.get(id);
    if (!left) added.push(right);
    else if (!right) deleted.push(left);
    else if (left.sha256 !== right.sha256 || left.byte_size !== right.byte_size) modified.push({relative_path: left.relative_path, before_byte_size: left.byte_size, after_byte_size: right.byte_size, before_sha256: left.sha256, after_sha256: right.sha256});
    else unchangedCount += 1;
  }
  return {before_count: ids.length - added.length, after_count: ids.length - deleted.length, added, deleted, modified, unchanged_count: unchangedCount, identical: added.length === 0 && deleted.length === 0 && modified.length === 0};
}

const byType = Object.fromEntries(types.map((type) => [type, changesFor(type)]));
const identical = types.every((type) => byType[type].identical);
const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A9",
  comparison_type: "sha256-byte-size-review-baseline-comparison",
  review_task_excluded: true,
  git_diff_used: false,
  candidate_binding_identical: JSON.stringify(before.candidate) === JSON.stringify(after.candidate),
  all_reviewed_sources_identical: identical,
  by_artifact_type: byType
};
await writeFile(path.join(taskDir, "baseline-comparison.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`A9_BASELINE_COMPARISON candidate=${byType["candidate-artifact"].identical} frozen=${byType["frozen-history"].identical} r8=${byType["remediation-8"].identical} a8=${byType["review-a8"].identical} r9=${byType["remediation-9"].identical} m320=${byType["migration-320-task"].identical} external=${byType["migration-320-external-evidence"].identical}`);
process.exit(identical && payload.candidate_binding_identical ? 0 : 1);
