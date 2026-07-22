import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(dir, "review-baseline-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(dir, "review-baseline-after.json"), "utf8"));
const beforeByPath = new Map(before.artifacts.map((item) => [item.relative_path, item]));
const afterByPath = new Map(after.artifacts.map((item) => [item.relative_path, item]));
const missing = [...beforeByPath.keys()].filter((ref) => !afterByPath.has(ref));
const unexpected = [...afterByPath.keys()].filter((ref) => !beforeByPath.has(ref));
const changed = [...beforeByPath].filter(([ref, item]) => {
  const current = afterByPath.get(ref);
  return current && (current.byte_size !== item.byte_size || current.sha256 !== item.sha256 || current.artifact_type !== item.artifact_type || current.commit_inclusion !== item.commit_inclusion || current.scan_required !== item.scan_required);
}).map(([ref]) => ref);
const pass = before.included_file_count === 103 && after.included_file_count === 103 && before.manifest_sha256 === after.manifest_sha256 && before.included_file_set_sha256 === after.included_file_set_sha256 && !missing.length && !unexpected.length && !changed.length;
const result = { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A4", before_count: before.included_file_count, after_count: after.included_file_count, before_manifest_sha256: before.manifest_sha256, after_manifest_sha256: after.manifest_sha256, before_file_set_sha256: before.included_file_set_sha256, after_file_set_sha256: after.included_file_set_sha256, missing, unexpected, changed, a4_task_excluded_from_candidate: ![...afterByPath.keys()].some((ref) => ref.startsWith(".codex/tasks/GOV-PHASE1-L3-REVIEW-A4/")), result: pass ? "PASS" : "FAIL" };
await writeFile(path.join(dir, "baseline-comparison.json"), `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`A4_BASELINE_COMPARISON result=${result.result} changed=${changed.length} missing=${missing.length} unexpected=${unexpected.length}`);
