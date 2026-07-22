import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir, "review-baseline-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(taskDir, "review-baseline-after.json"), "utf8"));
const compare = (name, left, right) => {
  const a = new Map(left.map((item) => [item.relative_path, item]));
  const b = new Map(right.map((item) => [item.relative_path, item]));
  const changes = [];
  for (const ref of [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x.localeCompare(y))) {
    const oldItem = a.get(ref), newItem = b.get(ref);
    if (!oldItem) changes.push({ collection: name, relative_path: ref, change: "added" });
    else if (!newItem) changes.push({ collection: name, relative_path: ref, change: "deleted" });
    else if (oldItem.sha256 !== newItem.sha256 || oldItem.byte_size !== newItem.byte_size) changes.push({ collection: name, relative_path: ref, change: "modified", before_sha256: oldItem.sha256, after_sha256: newItem.sha256, before_size: oldItem.byte_size, after_size: newItem.byte_size });
  }
  return changes;
};
const candidateChanges = compare("candidate", before.candidate_files, after.candidate_files);
const frozenChanges = compare("frozen_history", before.frozen_history, after.frozen_history);
const m320TaskChanges = compare("migration_320_task", before.migration_320_task, after.migration_320_task);
const m320ExternalChanges = compare("migration_320_external", before.migration_320_external, after.migration_320_external);
const proofChanged = before.candidate_proof.sha256 !== after.candidate_proof.sha256 || before.candidate_proof.byte_size !== after.candidate_proof.byte_size || before.candidate_proof.execution_id !== after.candidate_proof.execution_id || before.candidate_proof.proof_payload_sha256 !== after.candidate_proof.proof_payload_sha256;
const manifestChanged = before.manifest_sha256 !== after.manifest_sha256;
const countsValid = before.counts.candidate === 97 && after.counts.candidate === 97 && before.counts.frozen_history === 167 && after.counts.frozen_history === 167 && before.counts.migration_320_task === 13 && after.counts.migration_320_task === 13 && before.counts.migration_320_external === 5 && after.counts.migration_320_external === 5;
const report = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A5",
  candidate_baseline: "phase-1.5",
  counts_before: before.counts,
  counts_after: after.counts,
  manifest_unchanged: !manifestChanged,
  candidate_proof_unchanged: !proofChanged,
  candidate_changes: candidateChanges,
  frozen_history_changes: frozenChanges,
  migration_320_task_changes: m320TaskChanges,
  migration_320_external_changes: m320ExternalChanges,
  a5_task_excluded: before.a5_task_excluded && after.a5_task_excluded,
  comparison_result: countsValid && !manifestChanged && !proofChanged && candidateChanges.length === 0 && frozenChanges.length === 0 && m320TaskChanges.length === 0 && m320ExternalChanges.length === 0 ? "PASS" : "FAIL"
};
await writeFile(path.join(taskDir, "baseline-comparison.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "w" });
console.log(`A5_BASELINE_COMPARISON result=${report.comparison_result} candidate_changes=${candidateChanges.length} frozen_changes=${frozenChanges.length} m320_task_changes=${m320TaskChanges.length} m320_external_changes=${m320ExternalChanges.length}`);
process.exit(report.comparison_result === "PASS" ? 0 : 1);
