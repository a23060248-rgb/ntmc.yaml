import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir, "baseline-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(taskDir, "baseline-after.json"), "utf8"));
const beforeMap = new Map(before.files.map((item) => [item.relative_path, item]));
const afterMap = new Map(after.files.map((item) => [item.relative_path, item]));
const types = ["governance-source", "frozen-history", "remediation-8", "review-a8", "migration-320-task", "migration-320-external-evidence"];

function changesFor(type) {
  const paths = [...new Set([...before.files.filter((item) => item.artifact_type === type).map((item) => item.relative_path), ...after.files.filter((item) => item.artifact_type === type).map((item) => item.relative_path)])].sort();
  const added = [], deleted = [], modified = [], unchanged = [];
  for (const ref of paths) {
    const left = beforeMap.get(ref), right = afterMap.get(ref);
    if (!left) added.push(right);
    else if (!right) deleted.push(left);
    else if (left.sha256 !== right.sha256 || left.byte_size !== right.byte_size) modified.push({relative_path: ref, before_byte_size: left.byte_size, after_byte_size: right.byte_size, before_sha256: left.sha256, after_sha256: right.sha256});
    else unchanged.push(right);
  }
  return {before_count: paths.length - added.length, after_count: paths.length - deleted.length, added, deleted, modified, unchanged_count: unchanged.length, identical: added.length === 0 && deleted.length === 0 && modified.length === 0};
}

const byType = Object.fromEntries(types.map((type) => [type, changesFor(type)]));
const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-9",
  comparison_type: "sha256-byte-size-baseline-comparison",
  remediation_task_excluded: true,
  git_diff_used: false,
  governance_source_change_expected: true,
  frozen_history_identical: byType["frozen-history"].identical,
  remediation_8_identical: byType["remediation-8"].identical,
  review_a8_identical: byType["review-a8"].identical,
  migration_320_task_identical: byType["migration-320-task"].identical,
  migration_320_external_evidence_identical: byType["migration-320-external-evidence"].identical,
  by_artifact_type: byType
};
await writeFile(path.join(taskDir, "baseline-comparison.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`BASELINE_COMPARISON governance_modified=${byType["governance-source"].modified.length} governance_added=${byType["governance-source"].added.length} governance_deleted=${byType["governance-source"].deleted.length} frozen_identical=${payload.frozen_history_identical} r8_identical=${payload.remediation_8_identical} a8_identical=${payload.review_a8_identical} m320_task_identical=${payload.migration_320_task_identical} m320_external_identical=${payload.migration_320_external_evidence_identical}`);
process.exit(payload.frozen_history_identical && payload.remediation_8_identical && payload.review_a8_identical && payload.migration_320_task_identical && payload.migration_320_external_evidence_identical ? 0 : 1);
