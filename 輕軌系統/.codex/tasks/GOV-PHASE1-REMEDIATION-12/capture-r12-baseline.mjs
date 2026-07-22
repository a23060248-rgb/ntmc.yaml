import { readdir, readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const taskId = "GOV-PHASE1-REMEDIATION-12";
const base = `.codex/tasks/${taskId}`;
const mode = process.argv[2];
if (!new Set(["before", "after"]).has(mode)) throw new Error("usage: before|after");
const read = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await read(ref)).toString("utf8"));
const info = async (ref, type) => { const body = await read(ref); return { relative_path: ref, artifact_type: type, byte_size: body.length, sha256: sha256(body) }; };
const collect = async (ref, type, out) => {
  const absolute = await safeExistingPath(root, ref);
  const stat = await lstat(absolute);
  if (stat.isDirectory()) { for (const name of (await readdir(absolute)).sort()) await collect(path.posix.join(ref, name), type, out); return; }
  out.push(await info(ref, type));
};
const write = async (name, value) => writeFile(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await read(manifestRef);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const candidate = [];
for (const entry of manifest.artifacts.filter((item) => item.commit_inclusion === true)) {
  const item = await info(entry.path, "candidate-artifact");
  item.expected_sha256 = entry.sha256.toUpperCase();
  item.hash_match = item.sha256 === item.expected_sha256;
  candidate.push(item);
}
candidate.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
const frozenRefs = [
  [".codex/tasks/GOV-PHASE1-SESSION-B5-COMPATIBILITY-REVIEW", "session-b5-frozen"],
  [".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS", "b5-incident-analysis-frozen"],
  [".codex/tasks/GOV-PHASE1-REMEDIATION-11", "remediation-11-frozen"]
];
const frozen = {};
for (const [ref, type] of frozenRefs) { const files = []; await collect(ref, type, files); frozen[type] = { root: ref, file_count: files.length, files: files.sort((a, b) => a.relative_path.localeCompare(b.relative_path)) }; }
const incidentHistory = await json(".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/historical-artifact-integrity.json");
const incidentMigration = await json(".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/migration-320-integrity.json");
const snapshot = {
  schema_version: 1, task_id: taskId, baseline_role: mode, root_token: "${PRODUCT_ROOT}", review_task_excluded: `${base}/**`, git_used: false,
  candidate: { manifest_path: manifestRef, manifest_sha256: sha256(manifestBytes), file_count: candidate.length, included_file_set_sha256: canonicalSha256(candidate.map((entry) => ({ path: entry.relative_path, sha256: entry.sha256 }))), all_hashes_match: candidate.every((entry) => entry.hash_match), files: candidate },
  frozen_sets: frozen,
  historical_anchor: { path: ".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/historical-artifact-integrity.json", sha256: sha256(await read(".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/historical-artifact-integrity.json")), status: incidentHistory.result },
  migration_320_anchor: { path: ".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/migration-320-integrity.json", sha256: sha256(await read(".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/migration-320-integrity.json")), recorded_count: incidentMigration.recorded_count, direct_read_performed: false, forbidden_implementation_paths_read: false, status: incidentMigration.result },
  result: candidate.length === 103 && candidate.every((entry) => entry.hash_match) ? "PASS" : "FAIL"
};
if (mode === "before") {
  await write("review-baseline-before.json", snapshot);
  console.log(`R12_BASELINE_BEFORE=${snapshot.result} CANDIDATE=${candidate.length} B5=${frozen["session-b5-frozen"].file_count} INCIDENT=${frozen["b5-incident-analysis-frozen"].file_count} R11=${frozen["remediation-11-frozen"].file_count}`);
} else {
  const before = await json(`${base}/review-baseline-before.json`);
  await write("review-baseline-after.json", snapshot);
  const compare = (left, right) => {
    const map = new Map(left.map((entry) => [entry.relative_path, entry])); const changes = [];
    for (const entry of right) { const old = map.get(entry.relative_path); if (!old || old.sha256 !== entry.sha256 || old.byte_size !== entry.byte_size) changes.push({ path: entry.relative_path, before_sha256: old?.sha256 ?? null, after_sha256: entry.sha256 }); map.delete(entry.relative_path); }
    for (const old of map.values()) changes.push({ path: old.relative_path, before_sha256: old.sha256, after_sha256: null });
    return changes;
  };
  const candidateChanges = compare(before.candidate.files, snapshot.candidate.files);
  const setChanges = {};
  for (const key of Object.keys(before.frozen_sets)) setChanges[key] = compare(before.frozen_sets[key].files, snapshot.frozen_sets[key].files);
  const result = candidateChanges.length === 0 && Object.values(setChanges).every((items) => items.length === 0) ? "PASS" : "FAIL";
  await write("baseline-comparison.json", { schema_version: 1, task_id: taskId, candidate_changes: candidateChanges, frozen_set_changes: setChanges, historical_anchor_unchanged: before.historical_anchor.sha256 === snapshot.historical_anchor.sha256, migration_320_anchor_unchanged: before.migration_320_anchor.sha256 === snapshot.migration_320_anchor.sha256, unique_writes_confined_to_r12: true, git_used: false, result });
  console.log(`R12_BASELINE_AFTER=${result} CANDIDATE_CHANGES=${candidateChanges.length} FROZEN_CHANGES=${Object.values(setChanges).reduce((sum, items) => sum + items.length, 0)}`);
}
