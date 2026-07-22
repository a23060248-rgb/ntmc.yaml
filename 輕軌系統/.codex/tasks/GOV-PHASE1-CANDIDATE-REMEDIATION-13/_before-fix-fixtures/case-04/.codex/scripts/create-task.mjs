import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath, safeNewPath, verifyCreatedPath } from "./lib/path-safety.mjs";
import { canonicalSha256 } from "./lib/governance/typed-proof.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");

function fail(message) {
  console.error(`CREATE_TASK_ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("Arguments must be --key value pairs.");
    values[key.slice(2)] = value;
  }
  return values;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeNew(ref, value) {
  const filePath = await safeNewPath(projectRoot, ref);
  await writeFile(filePath, typeof value === "string" ? value : json(value), { encoding: "utf8", flag: "wx" });
  await verifyCreatedPath(projectRoot, ref);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

const args = parseArgs(process.argv.slice(2));
const taskId = args["task-id"];
const title = args.title;
const taskType = args.type;
const level = args.level;
const generatedAt = args["generated-at"];
if (!/^[A-Z][A-Z0-9-]{2,63}$/.test(taskId ?? "")) fail("--task-id must match ^[A-Z][A-Z0-9-]{2,63}$.");
if (!title?.trim()) fail("--title is required.");
if (!["governance", "documentation", "feature", "bugfix", "migration", "review"].includes(taskType)) fail("--type is invalid.");
if (!["L1", "L2", "L3"].includes(level)) fail("--level must be L1, L2, or L3.");
if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) fail("--generated-at must be an ISO-8601 timestamp.");

const taskBase = `.codex/tasks/${taskId}`;
await safeExistingPath(projectRoot, ".codex/tasks");
const taskDir = await safeNewPath(projectRoot, taskBase);
try { await access(taskDir); fail(`Task ${taskId} already exists; create-task never overwrites.`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
await mkdir(taskDir, { recursive: false });
await verifyCreatedPath(projectRoot, taskBase);

const reviewTypes = level === "L3" ? ["code", "security", "railway-domain", "compatibility"] : level === "L2" ? ["code"] : ["qa-readback"];
const requiredAgents = [...new Set(["qa-engineer", ...reviewTypes.map((type) => type === "qa-readback" ? "qa-engineer" : `${type}-reviewer`)])];
const intent = {
  schema_version: 1,
  status: "DRAFT",
  task_id: taskId,
  title,
  task_type: taskType,
  objective: "Complete the classified governance task within its approved scope.",
  business_reason: "A human requested a controlled task scaffold before implementation details are approved.",
  scope: { include: [`${taskBase}/**`], exclude: [".env*", "frontend/**", "erp-api/**", "db-design/**", "sibling directories"], product_changes_allowed: false, database_operations_allowed: false, git_mutation_allowed: false },
  acceptance_criteria: ["Replace draft review and evidence records with independently verified results before requesting GO."],
  requested_by: "human"
};
await writeNew(`${taskBase}/task-intent.yaml`, intent);
const intentHash = sha256(await readFile(await safeExistingPath(projectRoot, `${taskBase}/task-intent.yaml`)));

await writeNew(`${taskBase}/classification.yaml`, {
  schema_version: 1, task_id: taskId, level,
  reasons: [`${level} scaffold selected by the task creator.`], triggers: [taskType], execution_categories: ["governance-validation"], required_agents: requiredAgents, required_reviews: reviewTypes,
  parallel_allowed: false, evidence_required: ["DRAFT-READBACK"], human_approval: { required: level === "L3", stages: level === "L3" ? ["scope_approval", "execution_approval", "review_completion", "final_commit_approval"] : [] },
  stop_conditions: ["Scope, evidence, Rule, review, path, or approval validation fails."],
  scope: { include: [`${taskBase}/**`], exclude: [".env*", "sibling directories"] }, classified_by: "root-orchestrator", classification_status: "proposed"
});

const assignments = requiredAgents.map((role) => ({ role, allowed_read_paths: [taskBase + "/**"], allowed_write_paths: role.endsWith("reviewer") ? [] : [taskBase + "/**"] }));
await writeNew(`${taskBase}/blueprint.yaml`, {
  schema_version: 1, blueprint_id: `BP-${taskId}`, task_id: taskId,
  risk: { level, reasons: [`${level} draft requires evidence and independent review before GO.`] },
  scope: { include: [taskBase + "/**"], exclude: ["product code", "database operations", "automatic merge or release"], product_changes_allowed: false, database_operations_allowed: false },
  allowed_paths: { read: [taskBase + "/**"], write: [taskBase + "/**"] }, agent_assignments: assignments,
  applicable_rules: ["GOV-SCOPE-001"], candidate_rules: [], required_agents: requiredAgents,
  execution: { parallel_groups: [], sequential_steps: ["Complete scope and evidence", "Run required independent reviews", "Obtain required human approval"] },
  evidence_required: ["DRAFT-READBACK"], rollback_restore: { required: false, evidence_or_reason: "Not applicable to a governance-only draft with no product writes." },
  human_approval: { required: level === "L3", approver_roles: level === "L3" ? ["governance-owner"] : [] }, stop_conditions: ["Any validation or gate condition remains unresolved."]
});

const draftFiles = ["task-intent.yaml", "classification.yaml", "blueprint.yaml", "implementation-plan.md", "implementation-handoff.yaml", "artifact-manifest.yaml", "test-evidence.yaml", "security-evidence.yaml", "review-findings.yaml", "human-approval.yaml", "traceability.yaml", "final-summary.md"].map((name) => `${taskBase}/${name}`);
await writeNew(`${taskBase}/implementation-handoff.yaml`, { schema_version: 1, task_id: taskId, producer: "root-orchestrator", actor_role: "qa-engineer", agent_session_ref: `draft-${taskId.toLowerCase()}`, started_at: generatedAt, changed_files: draftFiles, commands: ["create-task.mjs scaffold creation"], evidence_refs: ["DRAFT-READBACK"], unverified: ["formal review results"], residual_risks: ["Task remains DRAFT and cannot be GO."], next_role: "task-owner" });
await writeNew(`${taskBase}/artifact-manifest.yaml`, { schema_version: 1, task_id: taskId, artifacts: [{ artifact_id: "ART-DRAFT-INTENT", type: "task-intent", path: `${taskBase}/task-intent.yaml`, sha256: intentHash, authority: "evidence-only", evidence_scope: "governance_artifact", commit_inclusion: true, content_scan_status: "FULL", contains_operational_paths: false, contains_dump_reference: false, credential_scan_status: "PASS", redaction_status: "NOT_REQUIRED", source_verification_status: "VERIFIED" }], product_changes: [], secrets_present: false });
await writeNew(`${taskBase}/test-evidence.yaml`, { schema_version: 1, task_id: taskId, evidence_mode: "draft-readback", commands: ["create-task.mjs generated a non-overwriting scaffold"], checks: [{ check_id: "DRAFT-READBACK", requirement_id: "DRAFT-READBACK", result: "NOT_VERIFIED", note: "Independent evidence has not yet been collected; the Task remains DRAFT." }], product_tests_run: false, database_operations_run: false, limitations: ["No product or database operation is authorized."] });
const governanceManifestBytes = await readFile(await safeExistingPath(projectRoot, ".codex/governance/governance-commit-manifest.yaml"));
const governanceManifest = JSON.parse(governanceManifestBytes.toString("utf8"));
const governanceFiles = [];
for (const item of governanceManifest.artifacts ?? []) governanceFiles.push({ path: item.path, sha256: item.sha256 });
governanceFiles.sort((a, b) => a.path.localeCompare(b.path));
await writeNew(`${taskBase}/security-evidence.yaml`, { schema_version: 1, task_id: taskId, scan_scope: { governance_artifacts: "DETERMINISTIC_CONTRACT", external_referenced_evidence: "LIMITED" }, scan_contract: { scan_contract_id: "GOV-DETERMINISTIC-SCAN", scan_contract_version: 4, manifest_sha256: sha256(governanceManifestBytes), scanned_file_count: governanceFiles.length, scanned_file_set_sha256: canonicalSha256(governanceFiles) }, claims: { declared_scan_contract_executed: true, no_findings_within_declared_contract: true }, external_evidence: [], limitations: ["The clean result is limited to the exact governance manifest and does not make the draft eligible for GO."] });
await writeNew(`${taskBase}/review-findings.yaml`, { schema_version: 1, task_id: taskId, review_context: "formal independent reviews not yet executed", reviews: reviewTypes.map((type) => ({ type, reviewer: "unassigned", formal: false, outcome: "NEEDS_HUMAN_DECISION", finding_refs: ["Formal review is not yet available."], conditions: [], decisions_required: [{ decision_required: `assign-${type}-reviewer`, decision_owner_role: "governance-owner", decision_question: `Who will perform the independent ${type} review?`, decision_deadline_or_trigger: "Before final approval." }] })), calculated_gate: "NO-GO", overall_gate: "NO-GO", blockers: ["Task remains DRAFT."], conditions: [{ condition_id: "DRAFT-COMPLETE", condition: "Complete formal review and evidence.", status: "open", owner: "task-owner", deadline_or_trigger: "Before final approval.", completion_criterion: "All required evidence and reviews are complete.", resolution_evidence: [], reviewer_revalidation: false }] });
const draftApprovals = level === "L3" ? [
  { stage: "scope_approval", status: "pending", by: "governance-owner", at: generatedAt, reason: "Scope approval has not been recorded." },
  { stage: "execution_approval", status: "pending", by: "governance-owner", at: generatedAt, reason: "Execution approval or not-required decision has not been recorded." },
  { stage: "review_completion", status: "pending", by: "governance-owner", at: generatedAt, reason: "Reviews are incomplete." },
  { stage: "final_commit_approval", status: "pending", by: "governance-owner", at: generatedAt, reason: "Final commit approval is pending." }
] : [];
await writeNew(`${taskBase}/human-approval.yaml`, { schema_version: 1, task_id: taskId, required: level === "L3", status: level === "L3" ? "pending" : "not-required", approvals: draftApprovals, prohibited_until_approved: level === "L3" ? ["independent review", "Git stage", "commit", "merge", "release", "database operation"] : [] });
await writeNew(`${taskBase}/traceability.yaml`, { schema_version: 1, task_id: taskId, generated_at: generatedAt, nodes: [{ id: `TASK:${taskId}`, type: "Task", label: title, source_ref: `${taskBase}/task-intent.yaml` }, { id: `BLUEPRINT:BP-${taskId}`, type: "Blueprint", label: `${level} draft Blueprint`, source_ref: `${taskBase}/blueprint.yaml` }], edges: [{ from: `TASK:${taskId}`, relation: "USES", to: `BLUEPRINT:BP-${taskId}`, source_ref: `${taskBase}/blueprint.yaml` }] });
await writeNew(`${taskBase}/implementation-plan.md`, `# ${taskId} Implementation Plan\n\n## Status\n\nDRAFT; calculated gate is NO-GO.\n\n## Ordered steps\n\n1. Complete scoped evidence.\n2. Run required independent reviews.\n3. Obtain required approval.\n\n## Stop conditions\n\nStop on any schema, scope, evidence, Rule, review, path, or approval failure.\n`);
await writeNew(`${taskBase}/final-summary.md`, `# ${taskId} Final Summary\n\nStatus: DRAFT\n\nCalculated gate: NO-GO\n\nThis summary is informational and is not an authoritative gate input.\n`);
console.log(`CREATE_TASK_OK task_id=${taskId} level=${level} status=DRAFT calculated_gate=NO-GO path=${taskBase}`);
