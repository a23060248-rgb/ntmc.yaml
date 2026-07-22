import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const outputName = process.argv[2];
if (!/^review-baseline-(before|after)\.json$/.test(outputName ?? "")) throw new Error("A review baseline output name is required.");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();

async function captureFile(ref, artifactType) {
  const absolute = path.join(root, ...ref.split("/"));
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`UNSAFE_BASELINE_ARTIFACT:${ref}`);
  const bytes = await readFile(absolute);
  return {relative_path: ref, byte_size: bytes.length, sha256: sha256(bytes), artifact_type: artifactType};
}
async function collectTree(ref, artifactType, out) {
  const absolute = path.join(root, ...ref.split("/"));
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`SYMLINK_NOT_ALLOWED:${ref}`);
  if (stat.isDirectory()) for (const entry of (await readdir(absolute)).sort((a,b)=>a.localeCompare(b))) await collectTree(`${ref}/${entry}`, artifactType, out);
  else if (stat.isFile()) out.push(await captureFile(ref, artifactType));
  else throw new Error(`UNSUPPORTED_BASELINE_ARTIFACT:${ref}`);
}

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readFile(path.join(root, ...manifestRef.split("/")));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (sha256(manifestBytes) !== "8A76C7A6FCC8B6184AE3E0DBBB23DB6478E00EB34DD3B6A04B9F15ACB152BF51") throw new Error("CANDIDATE_MANIFEST_SHA256_MISMATCH");
if (manifest.artifacts.length !== 92) throw new Error(`CANDIDATE_COUNT:${manifest.artifacts.length}`);
const candidate = [];
for (const item of manifest.artifacts) { const captured = await captureFile(item.path, "bootstrap-candidate"); captured.manifest_sha256 = item.sha256; captured.manifest_hash_match = captured.sha256 === item.sha256; candidate.push(captured); }
candidate.sort((a,b)=>a.relative_path.localeCompare(b.relative_path));
if (!candidate.every((item)=>item.manifest_hash_match)) throw new Error("CANDIDATE_ARTIFACT_HASH_MISMATCH");
if (candidate.some((item)=>item.relative_path.startsWith(".codex/tasks/GOV-PHASE1-L3-REVIEW-A7/"))) throw new Error("A7_PRESENT_IN_CANDIDATE");

const r7Baseline = JSON.parse(await readFile(path.join(root, ".codex", "tasks", "GOV-PHASE1-REMEDIATION-7", "baseline-after.json"), "utf8"));
async function captureRefs(type, expectedCount, artifactType) {
  const refs = r7Baseline.files.filter((item)=>item.artifact_type===type).map((item)=>item.relative_path).sort((a,b)=>a.localeCompare(b));
  if (refs.length !== expectedCount) throw new Error(`${type.toUpperCase()}_EXPECTED_${expectedCount}:${refs.length}`);
  const out=[]; for (const ref of refs) out.push(await captureFile(ref, artifactType)); return out;
}
const frozenHistory = await captureRefs("frozen-history", 340, "frozen-history");
const migration320Task = await captureRefs("migration-320-task", 13, "migration-320-task");
const migration320External = await captureRefs("migration-320-external-evidence", 5, "migration-320-external-evidence");
const remediation7=[]; await collectTree(".codex/tasks/GOV-PHASE1-REMEDIATION-7", "remediation-7", remediation7); remediation7.sort((a,b)=>a.relative_path.localeCompare(b.relative_path));
const record = await captureFile(".codex/tasks/GOV-PHASE1-REMEDIATION-7/bootstrap-candidate-record.json", "bootstrap-candidate-record");
const report = await captureFile(".codex/tasks/GOV-PHASE1-REMEDIATION-7/bootstrap-scanner-report.json", "bootstrap-scanner-report");
const payload = {schema_version:1,task_id:"GOV-PHASE1-L3-REVIEW-A7",baseline_role:outputName.includes("before")?"before":"after",root_token:"${PRODUCT_ROOT}",a7_self_excluded:true,git_diff_used:false,manifest:{relative_path:manifestRef,byte_size:manifestBytes.length,sha256:sha256(manifestBytes),artifact_count:candidate.length},counts:{candidate:candidate.length,frozen_history:frozenHistory.length,remediation_7:remediation7.length,migration_320_task:migration320Task.length,migration_320_external:migration320External.length},candidate,bootstrap_candidate_record:record,bootstrap_scanner_report:report,frozen_history:frozenHistory,remediation_7:remediation7,migration_320_task:migration320Task,migration_320_external:migration320External};
await writeFile(path.join(taskDir, outputName), `${JSON.stringify(payload,null,2)}\n`, {encoding:"utf8",flag:"wx"});
console.log(`A7_BASELINE role=${payload.baseline_role} candidate=${candidate.length} frozen=${frozenHistory.length} r7=${remediation7.length} m320=${migration320Task.length} external=${migration320External.length}`);
