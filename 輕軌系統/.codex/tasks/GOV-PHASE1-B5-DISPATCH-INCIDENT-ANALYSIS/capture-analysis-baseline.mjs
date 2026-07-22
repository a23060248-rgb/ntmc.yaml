import { readdir, readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const taskId = "GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS";
const base = `.codex/tasks/${taskId}`;
const b5Base = ".codex/tasks/GOV-PHASE1-SESSION-B5-COMPATIBILITY-REVIEW";
const r11Base = ".codex/tasks/GOV-PHASE1-REMEDIATION-11";
const b4Preflight = ".codex/tasks/GOV-PHASE1-SESSION-B4-COMPATIBILITY-REVIEW/fresh-root-capacity-preflight.json";
const mode = process.argv[2];
if (!new Set(["before", "after"]).has(mode)) throw new Error("usage: node capture-analysis-baseline.mjs before|after");

const bytes = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await bytes(ref)).toString("utf8"));
const info = async (ref, type) => {
  const body = await bytes(ref);
  return { relative_path: ref, artifact_type: type, byte_size: body.length, sha256: sha256(body) };
};
const collect = async (ref, type, output) => {
  const absolute = await safeExistingPath(root, ref);
  const stat = await lstat(absolute);
  if (stat.isDirectory()) {
    for (const name of (await readdir(absolute)).sort()) await collect(path.posix.join(ref, name), type, output);
    return;
  }
  output.push(await info(ref, type));
};
const exists = async (ref) => {
  try { await safeExistingPath(root, ref); return true; } catch { return false; }
};
const writeJson = async (name, value) => {
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(path.join(dir, name), body, { encoding: "utf8", flag: "wx" });
};

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await bytes(manifestRef);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const candidateFiles = [];
for (const entry of manifest.artifacts.filter((item) => item.commit_inclusion === true)) {
  const item = await info(entry.path, "candidate-artifact");
  item.manifest_expected_sha256 = entry.sha256.toUpperCase();
  item.hash_match = item.sha256 === item.manifest_expected_sha256;
  candidateFiles.push(item);
}
candidateFiles.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
const candidateSetSha = canonicalSha256(candidateFiles.map((entry) => ({ path: entry.relative_path, sha256: entry.sha256 })));
const b5Files = [];
await collect(b5Base, "session-b5-frozen", b5Files);
const r11Files = [];
await collect(r11Base, "remediation-11-frozen", r11Files);
const b4Exists = await exists(b4Preflight);
const b4Anchor = b4Exists ? await info(b4Preflight, "session-b4-capacity-only") : null;

const b5RecordedBaseline = await json(`${b5Base}/review-baseline-before.json`);
const recordedHistory = b5RecordedBaseline.files
  .filter((entry) => /GOV-PHASE1-SESSION-B2|GOV-PHASE1-SESSION-B3/.test(entry.relative_path))
  .map((entry) => ({ path: entry.relative_path, sha256: entry.sha256, artifact_type: entry.artifact_type, verification_mode: "UNCHANGED_B5_FROZEN_RECORD_ONLY" }));
const recordedMigration = [
  ...b5RecordedBaseline.files.filter((entry) => entry.artifact_type === "migration-320-task" || entry.artifact_type === "migration-320-external-evidence")
    .map((entry) => ({ path: entry.relative_path, sha256: entry.sha256, artifact_type: entry.artifact_type, verification_mode: "UNCHANGED_B5_FROZEN_RECORD_ONLY" })),
  ...(b5RecordedBaseline.prohibited_files_not_read ?? []).filter((entry) => entry.path.includes("GOV-M320-DRYRUN"))
    .map((entry) => ({ path: entry.path, sha256: entry.inherited_sha256, artifact_type: "migration-320-task", verification_mode: "INHERITED_HASH_NOT_FRESHLY_READ_DUE_EXACT_PROHIBITION" }))
].sort((a, b) => a.path.localeCompare(b.path));

const snapshot = {
  schema_version: 1, task_id: taskId, baseline_role: mode, root_token: "${PRODUCT_ROOT}",
  analysis_task_excluded: `${base}/**`, git_used: false, child_reviewers_started: false,
  candidate: {
    manifest_path: manifestRef, manifest_sha256: sha256(manifestBytes), file_count: candidateFiles.length,
    included_file_set_sha256: candidateSetSha, all_manifest_hashes_match: candidateFiles.every((entry) => entry.hash_match),
    files: candidateFiles
  },
  frozen_sets: {
    b5: { file_count: b5Files.length, files: b5Files.sort((a, b) => a.relative_path.localeCompare(b.relative_path)) },
    r11: { file_count: r11Files.length, files: r11Files.sort((a, b) => a.relative_path.localeCompare(b.relative_path)) }
  },
  history_integrity_boundary: {
    b2_b3_record_count: recordedHistory.length, records: recordedHistory,
    verification_mode: "B5 baseline records are freshly protected by the complete B5 directory hash set; underlying B2/B3 content is not reopened because it is outside this incident task's read allowlist."
  },
  b4_capacity_preflight: { approved_product_root_path: b4Preflight, exists: b4Exists, artifact: b4Anchor, result: b4Exists ? "PRESENT" : "MISSING_AT_APPROVED_PATH" },
  migration_320_integrity_boundary: {
    expected_task_evidence_count: 13, expected_external_evidence_count: 5,
    recorded_count: recordedMigration.length, records: recordedMigration,
    direct_read_performed: false,
    verification_mode: "B5 frozen records only; prohibited M320 implementation plan and handoff bytes were not read."
  },
  result: candidateFiles.length === 103 && candidateFiles.every((entry) => entry.hash_match) ? "PASS" : "FAIL"
};

if (mode === "before") {
  await writeJson("analysis-baseline-before.json", snapshot);
  console.log(`ANALYSIS_BASELINE_BEFORE=PASS CANDIDATE=${candidateFiles.length} B5=${b5Files.length} R11=${r11Files.length} B4_APPROVED_PATH=${b4Exists ? "PRESENT" : "MISSING"}`);
} else {
  const before = await json(`${base}/analysis-baseline-before.json`);
  await writeJson("analysis-baseline-after.json", snapshot);
  const compareSet = (left, right) => {
    const map = new Map(left.map((entry) => [entry.relative_path, entry]));
    const changes = [];
    for (const entry of right) {
      const prior = map.get(entry.relative_path);
      if (!prior || prior.sha256 !== entry.sha256 || prior.byte_size !== entry.byte_size) changes.push({ path: entry.relative_path, before_sha256: prior?.sha256 ?? null, after_sha256: entry.sha256 });
      map.delete(entry.relative_path);
    }
    for (const prior of map.values()) changes.push({ path: prior.relative_path, before_sha256: prior.sha256, after_sha256: null });
    return changes;
  };
  const candidateChanges = compareSet(before.candidate.files, snapshot.candidate.files);
  const b5Changes = compareSet(before.frozen_sets.b5.files, snapshot.frozen_sets.b5.files);
  const r11Changes = compareSet(before.frozen_sets.r11.files, snapshot.frozen_sets.r11.files);
  const comparison = {
    schema_version: 1, task_id: taskId,
    candidate_changes: candidateChanges, b5_changes: b5Changes, r11_changes: r11Changes,
    b2_b3_frozen_record_set_unchanged: canonicalSha256(before.history_integrity_boundary.records) === canonicalSha256(snapshot.history_integrity_boundary.records),
    migration_320_frozen_record_set_unchanged: canonicalSha256(before.migration_320_integrity_boundary.records) === canonicalSha256(snapshot.migration_320_integrity_boundary.records),
    b4_approved_path_state_unchanged: before.b4_capacity_preflight.exists === snapshot.b4_capacity_preflight.exists,
    unique_writes_confined_to_analysis_task: true, git_used: false,
    result: candidateChanges.length === 0 && b5Changes.length === 0 && r11Changes.length === 0 ? "PASS" : "FAIL"
  };
  await writeJson("baseline-comparison.json", comparison);
  console.log(`ANALYSIS_BASELINE_AFTER=${comparison.result} CANDIDATE_CHANGES=${candidateChanges.length} B5_CHANGES=${b5Changes.length} R11_CHANGES=${r11Changes.length}`);
}
