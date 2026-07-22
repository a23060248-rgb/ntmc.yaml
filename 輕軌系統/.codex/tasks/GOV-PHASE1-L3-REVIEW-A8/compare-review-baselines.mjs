import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir, "review-baseline-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(taskDir, "review-baseline-after.json"), "utf8"));
const sections = ["candidate", "frozen_history", "remediation_8", "migration_320_task", "migration_320_external"];
function compare(name) {
  const left = new Map(before[name].map((item) => [item.relative_path, item]));
  const right = new Map(after[name].map((item) => [item.relative_path, item]));
  const refs = [...new Set([...left.keys(), ...right.keys()])].sort();
  const added = [], deleted = [], modified = [];
  for (const ref of refs) {
    const a = left.get(ref), b = right.get(ref);
    if (!a) added.push(ref);
    else if (!b) deleted.push(ref);
    else if (a.byte_size !== b.byte_size || a.sha256 !== b.sha256) modified.push({relative_path: ref, before_byte_size: a.byte_size, after_byte_size: b.byte_size, before_sha256: a.sha256, after_sha256: b.sha256});
  }
  return {before_count: left.size, after_count: right.size, added, deleted, modified, identical: !added.length && !deleted.length && !modified.length};
}
const comparisons = Object.fromEntries(sections.map((name) => [name, compare(name)]));
const singletonNames = ["manifest", "bootstrap_candidate_record", "bootstrap_scanner_report", "binary_magic_registry", "governance_schema_set"];
const singletons = Object.fromEntries(singletonNames.map((name) => [name, before[name].byte_size === after[name].byte_size && before[name].sha256 === after[name].sha256]));
const bindingsIdentical = JSON.stringify(before.bindings) === JSON.stringify(after.bindings) && Object.values(after.bindings).every(Boolean);
const allIdentical = bindingsIdentical && Object.values(singletons).every(Boolean) && Object.values(comparisons).every((item) => item.identical);
const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A8",
  comparison_type: "reviewed-source-byte-size-and-sha256",
  a8_self_excluded: true,
  git_diff_used: false,
  bindings_identical: bindingsIdentical,
  singleton_integrity: singletons,
  all_reviewed_sources_identical: allIdentical,
  candidate_97_identical: comparisons.candidate.identical && comparisons.candidate.before_count === 97,
  frozen_history_425_identical: comparisons.frozen_history.identical && comparisons.frozen_history.before_count === 425,
  remediation_8_identical: comparisons.remediation_8.identical,
  migration_320_task_13_identical: comparisons.migration_320_task.identical && comparisons.migration_320_task.before_count === 13,
  migration_320_external_5_identical: comparisons.migration_320_external.identical && comparisons.migration_320_external.before_count === 5,
  sections: comparisons
};
await writeFile(path.join(taskDir, "baseline-comparison.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await writeFile(path.join(taskDir, "historical-artifact-integrity.json"), `${JSON.stringify({schema_version: 1, task_id: payload.task_id, counts: before.counts, singleton_integrity: singletons, bindings_identical: bindingsIdentical, integrity_result: allIdentical ? "PASS" : "FAIL"}, null, 2)}\n`, "utf8");
console.log(`A8_BASELINE_COMPARISON all_identical=${allIdentical} candidate=${comparisons.candidate.before_count} frozen=${comparisons.frozen_history.before_count} r8=${comparisons.remediation_8.before_count} m320=${comparisons.migration_320_task.before_count} external=${comparisons.migration_320_external.before_count}`);
process.exit(allIdentical ? 0 : 1);
