import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTask } from "../../scripts/validate-task.mjs";
import { collectGovernanceCommitRefs, excludedGovernanceRecords } from "../../scripts/lib/governance-commit-manifest.mjs";

const execute = promisify(execFile);
const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ntmc-create-task-draft-"));
const copyRefs = ["AGENTS.md", ".agents", ".codex/agents", ".codex/blueprints", ".codex/checklists", ".codex/config.toml", ".codex/domain", ".codex/environment", ".codex/governance", ".codex/meta-rules", ".codex/scripts", ".codex/templates", ".codex/tests", ".codex/workflows"];
for (const ref of copyRefs) await cp(path.join(root, ref), path.join(tempRoot, ref), { recursive: true, force: false, errorOnExist: true });
await mkdir(path.join(tempRoot, ".codex", "tasks"), { recursive: true });
const refs = await collectGovernanceCommitRefs(tempRoot);
const artifacts = [];
for (const ref of refs) {
  const bytes = await readFile(path.join(tempRoot, ref));
  artifacts.push({ path: ref, artifact_type: ref === "AGENTS.md" ? "governance-policy" : `governance-${path.extname(ref).slice(1).toLowerCase() || "text"}`, commit_inclusion: true, scan_required: true, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(), binary_allowed: false });
}
const manifest = { schema_version: 1, manifest_type: "governance-commit-manifest", generated_at: "2026-07-18T04:29:00+08:00", self_excluded: true, artifacts, excluded_records: excludedGovernanceRecords };
await writeFile(path.join(tempRoot, ".codex", "governance", "governance-commit-manifest.yaml"), `${JSON.stringify(manifest, null, 2)}\n`);
const taskId = "GOV-DRAFT-CHECK";
const copiedCreateTask = path.join(tempRoot, ".codex", "scripts", "create-task.mjs");
const child = await execute(process.execPath, [copiedCreateTask, "--task-id", taskId, "--title", "Draft production check", "--type", "governance", "--level", "L1", "--generated-at", "2026-07-18T04:30:00+08:00"], { cwd: tempRoot, windowsHide: true });
const validation = await validateTask(taskId, { projectRoot: tempRoot, writeGraph: true });
const report = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-5",
  command: "copied production create-task.mjs in isolated temporary governance root",
  created_task_id: taskId,
  create_output_declares_draft: child.stdout.includes("status=DRAFT"),
  create_output_declares_no_go: child.stdout.includes("calculated_gate=NO-GO"),
  validator_structural_result: validation.errors.length ? "INVALID" : "VALID",
  validator_calculated_gate: validation.calculatedGate,
  validator_exit_code: validation.exitCode,
  validator_errors: validation.errors,
  validator_gate_reasons: validation.gateReasons,
  gate_reason_count: validation.gateReasons.length,
  product_or_database_operation: false,
  source_root_modified: false,
  result: child.stdout.includes("status=DRAFT") && child.stdout.includes("calculated_gate=NO-GO") && validation.errors.length === 0 && validation.calculatedGate === "NO-GO" && validation.exitCode === 2 ? "PASS" : "FAIL"
};
await rm(tempRoot, { recursive: true, force: true });
await writeFile(path.join(taskDir, "create-task-draft-verification.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "w" });
console.log(`CREATE_TASK_DRAFT result=${report.result} structural=${report.validator_structural_result} gate=${report.validator_calculated_gate} exit=${report.validator_exit_code}`);
process.exit(report.result === "PASS" ? 0 : 1);
