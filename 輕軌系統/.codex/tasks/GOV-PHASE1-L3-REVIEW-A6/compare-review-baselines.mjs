import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir, "review-baseline-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(taskDir, "review-baseline-after.json"), "utf8"));
const sections = ["candidate", "frozen_history", "remediation_6", "migration_320_task", "migration_320_external"];

function compareSection(name) {
  const left = new Map(before[name].map((item) => [item.relative_path, item]));
  const right = new Map(after[name].map((item) => [item.relative_path, item]));
  const refs = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a.localeCompare(b));
  const added = [], deleted = [], modified = [];
  for (const ref of refs) {
    const a = left.get(ref), b = right.get(ref);
    if (!a) added.push(ref);
    else if (!b) deleted.push(ref);
    else if (a.byte_size !== b.byte_size || a.sha256 !== b.sha256) modified.push({ relative_path: ref, before_byte_size: a.byte_size, after_byte_size: b.byte_size, before_sha256: a.sha256, after_sha256: b.sha256 });
  }
  return { before_count: left.size, after_count: right.size, added, deleted, modified, identical: added.length === 0 && deleted.length === 0 && modified.length === 0 };
}

const comparisons = Object.fromEntries(sections.map((name) => [name, compareSection(name)]));
const manifestIdentical = before.manifest.byte_size === after.manifest.byte_size && before.manifest.sha256 === after.manifest.sha256 && before.manifest.artifact_count === after.manifest.artifact_count;
const allIdentical = manifestIdentical && Object.values(comparisons).every((item) => item.identical);
const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A6",
  comparison_type: "reviewed-source-byte-size-and-sha256",
  a6_self_excluded: true,
  git_diff_used: false,
  manifest_identical: manifestIdentical,
  all_reviewed_sources_identical: allIdentical,
  candidate_81_identical: comparisons.candidate.identical && comparisons.candidate.before_count === 81,
  frozen_history_256_identical: comparisons.frozen_history.identical && comparisons.frozen_history.before_count === 256,
  remediation_6_identical: comparisons.remediation_6.identical,
  migration_320_task_13_identical: comparisons.migration_320_task.identical && comparisons.migration_320_task.before_count === 13,
  migration_320_external_5_identical: comparisons.migration_320_external.identical && comparisons.migration_320_external.before_count === 5,
  sections: comparisons
};
await writeFile(path.join(taskDir, "baseline-comparison.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await writeFile(path.join(taskDir, "historical-artifact-integrity.json"), `${JSON.stringify({
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A6",
  frozen_history_file_count: comparisons.frozen_history.before_count,
  frozen_history_identical: comparisons.frozen_history.identical,
  remediation_6_file_count: comparisons.remediation_6.before_count,
  remediation_6_identical: comparisons.remediation_6.identical,
  migration_320_task_file_count: comparisons.migration_320_task.before_count,
  migration_320_task_identical: comparisons.migration_320_task.identical,
  migration_320_external_file_count: comparisons.migration_320_external.before_count,
  migration_320_external_identical: comparisons.migration_320_external.identical,
  integrity_result: allIdentical ? "PASS" : "FAIL"
}, null, 2)}\n`, "utf8");
console.log(`A6_BASELINE_COMPARISON all_identical=${allIdentical} candidate=${comparisons.candidate.before_count} frozen=${comparisons.frozen_history.before_count} r6=${comparisons.remediation_6.before_count} m320=${comparisons.migration_320_task.before_count} external=${comparisons.migration_320_external.before_count}`);
process.exit(allIdentical ? 0 : 1);
