import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir, "baseline-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(taskDir, "baseline-after.json"), "utf8"));
const key = (item) => item.relative_path;
const beforeMap = new Map(before.files.map((item) => [key(item), item]));
const afterMap = new Map(after.files.map((item) => [key(item), item]));
const types = ["governance-source-before", "frozen-history", "migration-320-governance-and-evidence"];

function changesFor(type) {
  const paths = [...new Set([
    ...before.files.filter((item) => item.artifact_type === type).map(key),
    ...after.files.filter((item) => item.artifact_type === type).map(key)
  ])].sort((a, b) => a.localeCompare(b));
  const added = [];
  const deleted = [];
  const modified = [];
  const unchanged = [];
  for (const ref of paths) {
    const left = beforeMap.get(ref);
    const right = afterMap.get(ref);
    if (!left) added.push(right);
    else if (!right) deleted.push(left);
    else if (left.sha256 !== right.sha256 || left.byte_size !== right.byte_size) {
      modified.push({ relative_path: ref, before_byte_size: left.byte_size, after_byte_size: right.byte_size, before_sha256: left.sha256, after_sha256: right.sha256 });
    } else unchanged.push(right);
  }
  return { before_count: paths.length - added.length, after_count: paths.length - deleted.length, added, deleted, modified, unchanged_count: unchanged.length, identical: added.length === 0 && deleted.length === 0 && modified.length === 0 };
}

const byType = Object.fromEntries(types.map((type) => [type, changesFor(type)]));
const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-6",
  comparison_type: "sha256-byte-size-baseline-comparison",
  review_task_excluded: true,
  remediation_task_excluded: true,
  git_diff_used: false,
  governance_source_change_expected: true,
  frozen_history_identical: byType["frozen-history"].identical,
  migration_320_identical: byType["migration-320-governance-and-evidence"].identical,
  by_artifact_type: byType
};
await writeFile(path.join(taskDir, "baseline-comparison.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`BASELINE_COMPARISON governance_modified=${byType["governance-source-before"].modified.length} governance_added=${byType["governance-source-before"].added.length} governance_deleted=${byType["governance-source-before"].deleted.length} frozen_identical=${payload.frozen_history_identical} migration_320_identical=${payload.migration_320_identical}`);
process.exit(payload.frozen_history_identical && payload.migration_320_identical ? 0 : 1);
