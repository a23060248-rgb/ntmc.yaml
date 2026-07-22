import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const m320Task = ".codex/tasks/GOV-M320-DRYRUN";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const readJson = async (ref) => JSON.parse(await readFile(path.join(root, ref), "utf8"));

const manifest = await readJson(`${m320Task}/artifact-manifest.yaml`);
const findings = await readJson(`${m320Task}/review-findings.yaml`);
const evidence = await readJson(`${m320Task}/test-evidence.yaml`);
const violations = [];
if (manifest.task_id !== "GOV-M320-DRYRUN") violations.push("TASK_ID_MISMATCH");
if (manifest.artifacts.length !== 5) violations.push("EXTERNAL_EVIDENCE_COUNT_NOT_FIVE");
const artifacts = [];
for (const artifact of manifest.artifacts) {
  if (artifact.evidence_scope !== "external_reference" || artifact.commit_inclusion !== false) violations.push(`EVIDENCE_BOUNDARY_INVALID:${artifact.artifact_id}`);
  const bytes = await readFile(path.join(root, artifact.path));
  const actual = sha256(bytes);
  artifacts.push({ artifact_id: artifact.artifact_id, relative_path: artifact.path, expected_sha256: artifact.sha256, actual_sha256: actual, unchanged: actual === artifact.sha256 });
  if (actual !== artifact.sha256) violations.push(`HASH_MISMATCH:${artifact.artifact_id}`);
}
if (findings.calculated_gate !== "NO-GO" || findings.overall_gate !== "NO-GO") violations.push("M320_GATE_NOT_NO_GO");
if (!findings.blockers?.length || !findings.conditions?.some((item) => item.status === "open")) violations.push("M320_BLOCKING_STATE_MISSING");
if (evidence.product_tests_run !== false || evidence.database_operations_run !== false) violations.push("PROHIBITED_EXECUTION_CLAIM");

const report = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-5",
  verification_target: "GOV-M320-DRYRUN",
  mode: "read-only-hash-and-gate-wrapper",
  external_evidence_count: artifacts.length,
  artifacts,
  structural_result: violations.length ? "INVALID" : "VALID",
  calculated_gate: "NO-GO",
  expected_exit_code: violations.length ? 1 : 2,
  migration_execution_authorized: false,
  product_tests_run: false,
  database_operations_run: false,
  original_evidence_modified: false,
  violations
};
await writeFile(path.join(taskDir, "migration-320-verification.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "w" });
console.log(`M320_WRAPPER structural=${report.structural_result} calculated_gate=${report.calculated_gate} exit=${report.expected_exit_code} evidence=${artifacts.length}`);
process.exit(report.expected_exit_code);
