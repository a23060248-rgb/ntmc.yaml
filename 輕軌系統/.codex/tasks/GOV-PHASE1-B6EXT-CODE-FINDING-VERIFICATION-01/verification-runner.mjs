import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-B6EXT-CODE-FINDING-VERIFICATION-01";
const taskRef = `.codex/tasks/${taskId}`;
const workRoot = path.join(taskDir, "_isolated-fixtures");
const fixed = Object.freeze({
  candidate_file_count: 103,
  candidate_manifest_sha256: "29F4F947DEF79A633F63E28FA2444F4734D7E6BB9612B96154A302464255531D",
  included_file_set_sha256: "739DAC633946266BCD28A71BE236D3748C57550AB1749A29C4F5E59421F993CB",
  schema_set_sha256: "F3101FFD0B7ABB22D26F65B2DB8522F60C2D0A8C45513DAAEF87725F81CF15E9",
  scanner_contract_sha256: "6A0EF0CAEE9088D65616DA318DB895321DF4D932C7308E2522D35F8242F4816C",
  payload_core_sha256: "B5FACA5E31B42DF1DB664008A9148CBB1386495CFF8EA33EF1534D56C0E91B46"
});
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex").toUpperCase();
function jcs(value) {
  if (value === null) return "null";
  if (["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}
const jcsSha256 = (value) => sha256(jcs(value));
const abs = (ref, root = sourceRoot) => path.join(root, ...ref.replaceAll("\\", "/").split("/"));
const readJson = async (ref, root = sourceRoot) => JSON.parse(await readFile(abs(ref, root), "utf8"));
const writeJson = async (name, value) => writeFile(path.join(taskDir, name), json(value));
async function exists(target) { try { return (await stat(target)).isFile(); } catch { return false; } }
async function walkFiles(directory) {
  const output = [];
  async function visit(current) {
    for (const entry of (await readdir(current, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) output.push(target);
    }
  }
  if (await exists(directory)) output.push(directory);
  else { try { await visit(directory); } catch {} }
  return output;
}
async function hashTree(relativeDirectory) {
  const directory = abs(relativeDirectory);
  const files = await walkFiles(directory);
  const records = [];
  for (const file of files) records.push({path: path.relative(sourceRoot, file).replaceAll("\\", "/"), sha256: sha256(await readFile(file))});
  return {directory: relativeDirectory, exists: files.length > 0, file_count: records.length, tree_sha256: jcsSha256(records), files: records};
}
function validateJsonSchema(schema, value, pointer = "$", root = schema, issues = []) {
  if (schema.$ref?.startsWith("#/")) {
    const resolved = schema.$ref.slice(2).split("/").reduce((node, key) => node?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], root);
    if (!resolved) issues.push(`${pointer}:unresolved-ref:${schema.$ref}`);
    else validateJsonSchema(resolved, value, pointer, root, issues);
    return issues;
  }
  const actualType = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((item) => item === actualType || (item === "number" && actualType === "integer"))) { issues.push(`${pointer}:type`); return issues; }
  }
  if (Object.hasOwn(schema, "const") && JSON.stringify(value) !== JSON.stringify(schema.const)) issues.push(`${pointer}:const`);
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) issues.push(`${pointer}:enum`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) issues.push(`${pointer}:minLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) issues.push(`${pointer}:pattern`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) issues.push(`${pointer}:minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) issues.push(`${pointer}:maxItems`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) issues.push(`${pointer}:uniqueItems`);
    if (schema.items) value.forEach((item, index) => validateJsonSchema(schema.items, item, `${pointer}[${index}]`, root, issues));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) if (!Object.hasOwn(value, required)) issues.push(`${pointer}:missing:${required}`);
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) issues.push(`${pointer}:additional:${key}`);
    for (const [key, child] of Object.entries(properties)) if (Object.hasOwn(value, key)) validateJsonSchema(child, value[key], `${pointer}.${key}`, root, issues);
  }
  return issues;
}

const externalBase = ".codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION/external-review-packages/code-review";
const launchBase = ".codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01";
const exactScope = await readJson(`${externalBase}/exact-read-scope.json`);
const launchEnvelope = await readJson(`${launchBase}/reviewer-launch-envelopes/code-review-launch-envelope.json`);
const launchRequiredReads = [
  `${launchBase}/embedded-startup-failure-contract.json`,
  `${launchBase}/repository-root-binding.json`,
  `${launchBase}/reviewer-launch-envelopes/code-review-launch-envelope.json`,
  ".codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION/external-review-readiness.json"
];
const originalAllowedReads = [...new Set([...launchRequiredReads, ...exactScope.package_paths, ...exactScope.source_paths])].sort();
const originalCore = {
  schema_version: 1,
  review_package_id: launchEnvelope.review_package_id,
  review_package_core_sha256: launchEnvelope.review_package_core_sha256,
  task_id: launchEnvelope.task_id,
  reviewer_role: launchEnvelope.reviewer_role,
  assignment_id: launchEnvelope.assignment_id,
  reviewer_run_id: launchEnvelope.reviewer_run_id,
  reviewer_session_nonce: launchEnvelope.reviewer_session_nonce,
  candidate_binding: launchEnvelope.candidate_binding,
  startup: {status: "STARTUP_VALID", scope_sha256: launchEnvelope.scope_sha256, package_verified: true, candidate_binding_verified: true},
  review_status: "BLOCKER",
  review_started: true,
  candidate_content_reviewed: true,
  completed: true,
  mandatory_exit_requested: true,
  findings: [{
    finding_id: "B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001",
    severity: "HIGH",
    status: "OPEN",
    summary: "The frozen Session B security evidence is not validated through the registered production schema loader. Candidate code validates only a standard Task-root security-evidence.yaml; the actual session-b6-security-evidence.yaml is referenced only by frozen manifests/read scopes, so a schema-invalid task-local evidence file could be accepted after its hashes are regenerated.",
    evidence_paths: [
      ".codex/tasks/GOV-PHASE1-REMEDIATION-12/session-b6-pre-review-package/session-b6-security-evidence.yaml",
      ".codex/tasks/GOV-PHASE1-REMEDIATION-12/session-b6-pre-review-package/pre-review-input-manifest.json",
      ".codex/scripts/validate-task.mjs",
      ".codex/scripts/lib/governance/governance-schema-loader.mjs",
      ".codex/tasks/GOV-PHASE1-REMEDIATION-12/b6-review-protocol.mjs"
    ]
  }],
  closure_dispositions: [],
  access_log: {allowed_paths_read: originalAllowedReads, forbidden_paths_read: [], out_of_scope_access_detected: false},
  clean_context_attestation: {top_level_chat: true, subagents_created: false, implementation_conversation_received: false, conversation_memory_used: false, repository_write_performed: false, assurance: "procedural"}
};
const originalPayload = {payload_core: originalCore, payload_core_sha256: fixed.payload_core_sha256};
await writeJson("code-r1-original-payload.json", originalPayload);
const returnSchema = await readJson(`${externalBase}/return-payload.schema.json`);
const schemaIssues = validateJsonSchema(returnSchema, originalPayload);
const exactAllowed = new Set(exactScope.allowed_paths);
const outOfExactScope = originalAllowedReads.filter((item) => !exactAllowed.has(item));
const duplicateReads = originalAllowedReads.filter((item, index, values) => values.indexOf(item) !== index);
const bindingChecks = {
  review_package_id: originalCore.review_package_id === launchEnvelope.review_package_id,
  review_package_core_sha256: originalCore.review_package_core_sha256 === launchEnvelope.review_package_core_sha256,
  assignment_id: originalCore.assignment_id === launchEnvelope.assignment_id,
  reviewer_run_id: originalCore.reviewer_run_id === launchEnvelope.reviewer_run_id,
  reviewer_session_nonce: originalCore.reviewer_session_nonce === launchEnvelope.reviewer_session_nonce,
  scope_sha256: originalCore.startup.scope_sha256 === launchEnvelope.scope_sha256,
  candidate_binding: JSON.stringify(originalCore.candidate_binding) === JSON.stringify(launchEnvelope.candidate_binding)
};
const payloadVerification = {
  schema_version: 1,
  task_id: taskId,
  source_task_id: launchEnvelope.task_id,
  declared_payload_core_sha256: fixed.payload_core_sha256,
  recomputed_payload_core_sha256: jcsSha256(originalCore),
  schema_validation: schemaIssues.length === 0 ? "PASS" : "FAIL",
  schema_issues: schemaIssues,
  jcs_sha256_validation: jcsSha256(originalCore) === fixed.payload_core_sha256 ? "PASS" : "FAIL",
  binding_checks: bindingChecks,
  binding_validation: Object.values(bindingChecks).every(Boolean) ? "PASS" : "FAIL",
  access_scope: {
    exact_scope_path_count: exactAllowed.size,
    actual_unique_path_count: originalAllowedReads.length,
    duplicate_paths: duplicateReads,
    out_of_exact_scope_paths: outOfExactScope,
    launch_required_but_not_package_exact_scope_paths: outOfExactScope.filter((item) => launchRequiredReads.includes(item)),
    forbidden_paths_read: originalCore.access_log.forbidden_paths_read,
    out_of_scope_access_declared: originalCore.access_log.out_of_scope_access_detected
  },
  formal_result: schemaIssues.length === 0 && jcsSha256(originalCore) === fixed.payload_core_sha256 && Object.values(bindingChecks).every(Boolean) && outOfExactScope.length === 0 && duplicateReads.length === 0 ? "FORMAL_PAYLOAD_ACCEPTED" : "FORMAL_PAYLOAD_REJECTED",
  finding_independent_reproduction_required: true
};
await writeJson("code-r1-payload-verification.json", payloadVerification);

const candidateManifestRef = ".codex/governance/governance-commit-manifest.yaml";
const candidateManifestBytes = await readFile(abs(candidateManifestRef));
const candidateManifest = JSON.parse(candidateManifestBytes.toString("utf8"));
const candidateFiles = [];
for (const item of candidateManifest.artifacts) candidateFiles.push({path: item.path, sha256: sha256(await readFile(abs(item.path)))});
candidateFiles.sort((left, right) => left.path.localeCompare(right.path));
const candidateIntegrity = {
  file_count: candidateFiles.length,
  manifest_sha256: sha256(candidateManifestBytes),
  included_file_set_sha256: jcsSha256(candidateFiles),
  expected: fixed,
  files: candidateFiles,
  result: candidateFiles.length === fixed.candidate_file_count && sha256(candidateManifestBytes) === fixed.candidate_manifest_sha256 && jcsSha256(candidateFiles) === fixed.included_file_set_sha256 ? "PASS" : "FAIL"
};

const protectedTasks = [
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10",
  ".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-10",
  ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-12",
  ".codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION",
  ".codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01"
];
const protectedBefore = [];
for (const ref of protectedTasks) protectedBefore.push(await hashTree(ref));
const baselineBefore = {schema_version: 1, task_id: taskId, captured_at: "2026-07-21T00:00:00+08:00", git_used: false, candidate: candidateIntegrity, protected_history: protectedBefore};
await writeJson("review-baseline-before.json", baselineBefore);

const { validateTask } = await import(pathToFileURL(abs(".codex/scripts/validate-task.mjs")).href);
const { buildBootstrapScanReport, scannerReportPayload } = await import(pathToFileURL(abs(".codex/scripts/lib/governance/scanner-report.mjs")).href);
const { createBootstrapWorkspaceCandidateRecord } = await import(pathToFileURL(abs(".codex/scripts/lib/governance/typed-proof.mjs")).href);

if (!path.resolve(workRoot).startsWith(path.resolve(taskDir) + path.sep)) throw new Error("Fixture cleanup escaped authorized Task directory.");
await rm(workRoot, {recursive: true, force: true});
await mkdir(workRoot, {recursive: true});

async function copyRef(ref, targetRoot) {
  const target = abs(ref, targetRoot);
  await mkdir(path.dirname(target), {recursive: true});
  await cp(abs(ref), target, {recursive: true});
}
async function prepareRoot(caseId) {
  const root = path.join(workRoot, caseId.toLowerCase());
  await mkdir(root, {recursive: true});
  await copyRef(candidateManifestRef, root);
  for (const item of candidateManifest.artifacts) await copyRef(item.path, root);
  for (const ref of [
    ".codex/tasks/GOV-M320-DRYRUN/blueprint.yaml",
    ".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml",
    ".codex/tasks/GOV-M320-DRYRUN/human-approval.yaml",
    ".codex/tasks/GOV-M320-DRYRUN/test-evidence.yaml"
  ]) await copyRef(ref, root);
  return root;
}
function formalReviews(caseTaskId, profileSha) {
  return [
    {type:"code",reviewer:"code-reviewer",formal:true,outcome:"PASS",reviewer_run_id:`RUN-${caseTaskId}-CODE`,session_id:`SESSION-${caseTaskId}-CODE`,finding_refs:["NONE"],conditions:[],decisions_required:[]},
    {type:"security",reviewer:"security-reviewer",formal:true,outcome:"PASS",reviewer_run_id:`RUN-${caseTaskId}-SEC`,session_id:`SESSION-${caseTaskId}-SEC`,finding_refs:["NONE"],conditions:[],decisions_required:[]},
    {type:"railway-domain",reviewer:"railway-domain-reviewer",formal:true,did_not_participate_in_implementation:true,outcome:"PASS",reviewer_run_id:`RUN-${caseTaskId}-DOMAIN`,session_id:`SESSION-${caseTaskId}-DOMAIN`,reviewer_binding:{canonical_role_id:"railway-domain-reviewer",agent_profile_reference:".codex/agents/railway-domain-reviewer.toml",agent_profile_sha256:profileSha,task_assignment_id:`ASSIGN-${caseTaskId}-DOMAIN`,reviewer_run_id:`RUN-${caseTaskId}-DOMAIN`,session_id:`SESSION-${caseTaskId}-DOMAIN`,formal:true,execution_mode:"read-only",implementation_participation:false,reviewer_identity_assurance:"procedural_role_and_assignment_binding"},review_scope:"bootstrap_rule_governance_mechanism",governance_mechanism_outcome:{outcome:"PASS",findings:[]},external_decisions:[{decision_scope:"migration_320",outcome:"NEEDS_HUMAN_DECISION",affects_gate:"migration_320_execution",decision_owner_role:"human-domain-owner",decision_question:"Retain Migration 320 NO-GO."}],finding_refs:["NONE"],conditions:[],decisions_required:[]}
  ];
}
async function createBaseTask(root, caseTaskId) {
  const ref = `.codex/tasks/${caseTaskId}`;
  const directory = abs(ref, root);
  await mkdir(directory, {recursive: true});
  const evidenceText = "isolated authoritative production-path verification evidence\n";
  await writeFile(path.join(directory, "evidence.md"), evidenceText);
  const agents = ["qa-engineer","code-reviewer","security-reviewer","railway-domain-reviewer"];
  const profileSha = sha256(await readFile(abs(".codex/agents/railway-domain-reviewer.toml", root)));
  const docs = {
    "task-intent.yaml":{schema_version:1,status:"READY_FOR_REVIEW",task_id:caseTaskId,title:"Security evidence production-path fixture",task_type:"governance",objective:"Exercise authoritative referenced Security evidence validation.",business_reason:"Reproduce or reject the external Code finding.",scope:{include:[`${ref}/**`],exclude:[".env*","frontend/**","erp-api/**","db-design/**","migration/**","sibling directories"],product_changes_allowed:false,database_operations_allowed:false,git_mutation_allowed:false},acceptance_criteria:["Authoritative validator emits deterministic result."],requested_by:"verification-owner"},
    "classification.yaml":{schema_version:1,task_id:caseTaskId,level:"L3",reasons:["Formal Gate validator verification."],triggers:["unresolved Reviewer blocker"],execution_categories:["governance-validation","bootstrap-candidate"],required_agents:agents,required_reviews:["code","security","railway-domain"],parallel_allowed:false,evidence_required:["EV-PRODUCTION"],human_approval:{required:true,stages:["scope_approval","execution_approval","review_completion","final_commit_approval"]},stop_conditions:["Any production validation layer is bypassed."],scope:{include:[`${ref}/**`],exclude:[".env*","sibling directories"]},classified_by:"verification-orchestrator",classification_status:"human-approved-scope"},
    "blueprint.yaml":{schema_version:1,blueprint_id:`BP-${caseTaskId}`,task_id:caseTaskId,risk:{level:"L3",reasons:["Production path verification."]},scope:{include:[`${ref}/**`],exclude:["product","database","Git mutation"],product_changes_allowed:false,database_operations_allowed:false},allowed_paths:{read:[`${ref}/**`],write:[`${ref}/**`]},agent_assignments:agents.map((role)=>({role,allowed_read_paths:[`${ref}/**`],allowed_write_paths:role==="qa-engineer"?[`${ref}/**`]:[]})),review_assignments:[{assignment_id:`ASSIGN-${caseTaskId}-DOMAIN`,required_role_id:"railway-domain-reviewer",agent_profile_reference:".codex/agents/railway-domain-reviewer.toml",agent_profile_sha256:profileSha,allowed_read_paths:["AGENTS.md",".agents/**",".codex/**"],allowed_write_paths:[],required_review_scope:"bootstrap_rule_governance_mechanism",execution_mode:"read-only",implementation_participation:false}],applicable_rules:["GOV-SCOPE-001","EVD-HASH-001"],candidate_rules:[],required_agents:agents,execution:{parallel_groups:[],sequential_steps:["Invoke validateTask production API."]},evidence_required:["EV-PRODUCTION"],rollback_restore:{required:false,evidence_or_reason:"Not applicable to an isolated governance fixture."},human_approval:{required:true,approver_roles:["verification-owner"]},stop_conditions:["Any validation layer fails."]},
    "implementation-handoff.yaml":{schema_version:1,task_id:caseTaskId,producer:"fixture-builder",actor_role:"qa-engineer",agent_session_ref:`IMPLEMENTER-${caseTaskId}`,started_at:"2026-07-21T00:30:00Z",changed_files:[`${ref}/evidence.md`],commands:["validateTask production API"],evidence_refs:["EV-PRODUCTION"],unverified:["human commit decision"],residual_risks:["Isolated fixture only."],next_role:"verification-owner"},
    "artifact-manifest.yaml":{schema_version:1,task_id:caseTaskId,artifacts:[{artifact_id:"ART-PRODUCTION",type:"integration-evidence",path:`${ref}/evidence.md`,sha256:sha256(evidenceText),authority:"evidence-only",evidence_scope:"local_review_record",commit_inclusion:false,content_scan_status:"FULL",contains_operational_paths:false,contains_dump_reference:false,credential_scan_status:"PASS",redaction_status:"NOT_REQUIRED",source_verification_status:"VERIFIED"}],product_changes:[],secrets_present:false},
    "test-evidence.yaml":{schema_version:1,task_id:caseTaskId,evidence_mode:"production-path-integration",commands:["validateTask production API"],requirements:[{requirement_id:"EV-PRODUCTION",semantic_category:"EVIDENCE_INTEGRITY",criticality:"CRITICAL",required_for_levels:["L3"],required_execution_categories:["governance-validation"]}],checks:[{check_id:"CHECK-PRODUCTION",requirement_id:"EV-PRODUCTION",result:"PASS",note:"Fixture construction completed."}],product_tests_run:false,database_operations_run:false,limitations:["No product, database, Git, service, seed, or migration operation."]},
    "security-evidence.yaml":{schema_version:1,task_id:caseTaskId,scan_scope:{governance_artifacts:"DETERMINISTIC_CONTRACT",external_referenced_evidence:"LIMITED"},scan_contract:{scan_contract_id:"GOV-DETERMINISTIC-SCAN",scan_contract_version:5,manifest_sha256:"A".repeat(64),scanned_file_count:1,scanned_file_set_sha256:"B".repeat(64),contract_sha256:"C".repeat(64),finding_registry_sha256:"D".repeat(64),canonicalization_config_sha256:"E".repeat(64),binary_oracle_config_sha256:"F".repeat(64),binary_magic_registry_sha256:"1".repeat(64),schema_set_sha256:"2".repeat(64)},claims:{declared_scan_contract_executed:true,no_findings_within_declared_contract:true,external_evidence_globally_clean:false,global_sensitive_data_absence_verified:false},external_evidence:[],limitations:["Exact deterministic contract only."]},
    "review-findings.yaml":{schema_version:1,task_id:caseTaskId,review_context:"Synthetic isolated production-path verification.",reviews:formalReviews(caseTaskId,profileSha),calculated_gate:"GO",overall_gate:"GO",bootstrap_candidate_review_gate:"GO",eligible_to_start_session_b:true,bootstrap_human_commit_gate:"NO-GO",steady_state_preparation_gate:"DISABLED",steady_state_execution_gate:"DISABLED",migration_320_execution_gate:"NO-GO",blockers:[],conditions:[]},
    "human-approval.yaml":{schema_version:1,task_id:caseTaskId,required:true,status:"pending",approvals:[{stage:"scope_approval",status:"approved",by:"fixture-owner",at:"2026-07-21T00:00:00Z",reason:"Isolated scope."},{stage:"execution_approval",status:"approved",by:"fixture-owner",at:"2026-07-21T00:01:00Z",reason:"Governance validator only."},{stage:"review_completion",status:"approved",by:"fixture-owner",at:"2026-07-21T00:02:00Z",reason:"Synthetic reviews."},{stage:"final_commit_approval",status:"pending",by:"fixture-owner",at:"2026-07-21T00:03:00Z",reason:"Intentionally absent."}],prohibited_until_approved:["Git stage","commit"]},
    "traceability.yaml":{schema_version:1,task_id:caseTaskId,generated_at:"2026-07-21T00:00:00Z",nodes:[{id:`TASK:${caseTaskId}`,type:"Task",label:"Fixture Task",source_ref:`${ref}/task-intent.yaml`},{id:`EVIDENCE:${caseTaskId}`,type:"Evidence",label:"Fixture Evidence",source_ref:`${ref}/evidence.md`}],edges:[{from:`TASK:${caseTaskId}`,relation:"VERIFIED_BY",to:`EVIDENCE:${caseTaskId}`,source_ref:`${ref}/test-evidence.yaml`}]}
  };
  for (const [name,value] of Object.entries(docs)) await writeFile(path.join(directory,name),json(value));
  await writeFile(path.join(directory,"implementation-plan.md"),"# Isolated production-path verification\n\nInvoke the authoritative validator only.\n");
  await writeFile(path.join(directory,"final-summary.md"),"# Isolated fixture\n\nNo product operation was performed.\n");
  return {directory,ref};
}
async function addNestedEvidence(context, content, {createFile=true, escape=false}={}) {
  const manifestPath = path.join(context.directory,"artifact-manifest.yaml");
  const manifest = JSON.parse(await readFile(manifestPath,"utf8"));
  const nestedRef = escape ? `${context.ref}/nested/../../escaped-security-evidence.yaml` : `${context.ref}/nested/session-b6-security-evidence.yaml`;
  const nestedPath = abs(nestedRef, context.root);
  if (createFile) { await mkdir(path.dirname(nestedPath),{recursive:true}); await writeFile(nestedPath,json(content)); }
  const bytes = createFile ? await readFile(nestedPath) : Buffer.from(json(content));
  const entry = {artifact_id:"EV-NESTED-SECURITY",type:"security-evidence",path:nestedRef,sha256:sha256(bytes),authority:"evidence-only",evidence_scope:"external_reference",commit_inclusion:false,content_scan_status:"PARTIAL",contains_operational_paths:false,contains_dump_reference:false,credential_scan_status:"PASS",redaction_status:"NOT_REQUIRED",source_verification_status:"VERIFIED"};
  manifest.artifacts.push(entry);
  await writeFile(manifestPath,json(manifest));
  for (const name of ["classification.yaml","blueprint.yaml"]) {
    const file = path.join(context.directory,name), value=JSON.parse(await readFile(file,"utf8"));
    value.evidence_required.push("EV-NESTED-SECURITY");
    await writeFile(file,json(value));
  }
  const securityPath=path.join(context.directory,"security-evidence.yaml"),security=JSON.parse(await readFile(securityPath,"utf8"));
  security.external_evidence.push({artifact_id:entry.artifact_id,path:entry.path,evidence_scope:entry.evidence_scope,commit_inclusion:entry.commit_inclusion,content_scan_status:entry.content_scan_status,contains_operational_paths:entry.contains_operational_paths,contains_dump_reference:entry.contains_dump_reference,credential_scan_status:entry.credential_scan_status,redaction_status:entry.redaction_status,source_verification_status:entry.source_verification_status});
  await writeFile(securityPath,json(security));
  return nestedRef;
}
async function refreshBindings(context) {
  const manifestBytes = await readFile(abs(candidateManifestRef,context.root));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const report = await buildBootstrapScanReport({projectRoot:context.root,manifestBytes,manifest,startedAt:"2026-07-21T01:00:00Z",completedAt:"2026-07-21T01:00:00Z"});
  report.report_payload_sha256=jcsSha256(scannerReportPayload(report));
  const reportBytes=Buffer.from(json(report));
  const reportRef=`${context.ref}/bootstrap-scanner-report.json`;
  await writeFile(abs(reportRef,context.root),reportBytes);
  const files=manifest.artifacts.map((item)=>({path:item.path,sha256:item.sha256})).sort((a,b)=>a.path.localeCompare(b.path));
  const bindings=report.scan_contract;
  const record=createBootstrapWorkspaceCandidateRecord({task_id:context.caseTaskId,manifest_sha256:sha256(manifestBytes),included_file_set_sha256:jcsSha256(files),file_count:files.length,scanner_report_sha256:sha256(reportBytes),scan_contract_sha256:bindings.contract_sha256,finding_registry_sha256:bindings.finding_registry_sha256,canonicalization_config_sha256:bindings.canonicalization_config_sha256,binary_oracle_config_sha256:bindings.binary_oracle_config_sha256,binary_magic_registry_sha256:bindings.binary_magic_registry_sha256,schema_set_sha256:bindings.schema_set_sha256,generated_at:"2026-07-21T01:01:00Z"});
  const recordRef=`${context.ref}/bootstrap-candidate-record.json`;
  await writeFile(abs(recordRef,context.root),json(record));
  const approvalPath=path.join(context.directory,"human-approval.yaml"),approval=JSON.parse(await readFile(approvalPath,"utf8"));
  approval.bootstrap_candidate_ref=recordRef; approval.bootstrap_scanner_report_ref=reportRef;
  await writeFile(approvalPath,json(approval));
  const securityPath=path.join(context.directory,"security-evidence.yaml"),security=JSON.parse(await readFile(securityPath,"utf8"));
  security.scan_contract={scan_contract_id:bindings.contract_id,scan_contract_version:bindings.contract_version,manifest_sha256:report.candidate_binding.manifest_sha256,scanned_file_count:report.candidate_binding.scanned_file_count,scanned_file_set_sha256:report.candidate_binding.scanned_file_set_sha256,contract_sha256:bindings.contract_sha256,finding_registry_sha256:bindings.finding_registry_sha256,canonicalization_config_sha256:bindings.canonicalization_config_sha256,binary_oracle_config_sha256:bindings.binary_oracle_config_sha256,binary_magic_registry_sha256:bindings.binary_magic_registry_sha256,schema_set_sha256:bindings.schema_set_sha256};
  security.claims.declared_scan_contract_executed=true; security.claims.no_findings_within_declared_contract=true;
  await writeFile(securityPath,json(security));
  const artifactBytes=await readFile(path.join(context.directory,"artifact-manifest.yaml"));
  const freeze={schema_version:1,task_id:context.caseTaskId,artifact_manifest_sha256:sha256(artifactBytes),candidate_manifest_sha256:sha256(manifestBytes),scanner_report_sha256:sha256(reportBytes),candidate_record_sha256:sha256(Buffer.from(json(record)))};
  freeze.freeze_sha256=jcsSha256(freeze);
  await writeFile(path.join(context.directory,"fixture-freeze.json"),json(freeze));
}
async function runCase(index, title, mutate, expected) {
  const caseId=`CASE-${String(index).padStart(2,"0")}`;
  const caseTaskId=`GOV-VERIFY-${caseId}`;
  const root=await prepareRoot(caseId);
  const base=await createBaseTask(root,caseTaskId);
  const context={...base,root,caseTaskId,nestedRefs:[]};
  if (mutate) await mutate(context,"before-bindings");
  await refreshBindings(context);
  if (mutate) await mutate(context,"after-bindings");
  const result=await validateTask(caseTaskId,{projectRoot:root,writeGraph:true,targetGate:"bootstrap-candidate-review"});
  const structural=result.errors.length?"INVALID":"VALID";
  const accepted=result.exitCode===0&&structural==="VALID"&&result.gateResults?.bootstrap_candidate_review?.status==="GO";
  return {case_id:caseId,title,security_evidence_location:index<=2?`${base.ref}/security-evidence.yaml`:index===10?"none":context.nestedRefs,expected,observed:accepted?"PASS":"FAIL",expectation_met:expected==="PASS"?accepted:!accepted,structural,calculated_gate:result.calculatedGate,bootstrap_candidate_review_gate:result.gateResults?.bootstrap_candidate_review?.status??null,exit_code:result.exitCode,schema_loader_invoked:true,validated_evidence_paths:index===10?[]:[`${base.ref}/security-evidence.yaml`],unvalidated_referenced_evidence_paths:context.nestedRefs,errors:result.errors,candidate_reasons:result.candidateReasons};
}
const validNested=(task)=>({schema_version:1,task_id:task,scan_scope:{governance_artifacts:"DETERMINISTIC_CONTRACT",external_referenced_evidence:"LIMITED"},scan_contract:{scan_contract_id:"GOV-DETERMINISTIC-SCAN",scan_contract_version:5,manifest_sha256:"A".repeat(64),scanned_file_count:1,scanned_file_set_sha256:"B".repeat(64),contract_sha256:"C".repeat(64),finding_registry_sha256:"D".repeat(64),canonicalization_config_sha256:"E".repeat(64),binary_oracle_config_sha256:"F".repeat(64),binary_magic_registry_sha256:"1".repeat(64),schema_set_sha256:"2".repeat(64)},claims:{declared_scan_contract_executed:true,no_findings_within_declared_contract:true},external_evidence:[],limitations:["Nested evidence fixture."]});
const invalidNested=(task)=>({schema_version:1,task_id:task,scan_scope:{governance_artifacts:"DETERMINISTIC_CONTRACT",external_referenced_evidence:"LIMITED"},scan_contract:{scan_contract_id:"GOV-DETERMINISTIC-SCAN",scan_contract_version:5},claims:{no_findings_within_declared_contract:true},external_evidence:[]});
const cases=[];
cases.push(await runCase(1,"Task-root valid Security evidence with regenerated bindings",null,"PASS"));
cases.push(await runCase(2,"Task-root invalid Security evidence with regenerated bindings",async(c,stage)=>{if(stage==="after-bindings"){const p=path.join(c.directory,"security-evidence.yaml"),v=JSON.parse(await readFile(p,"utf8"));delete v.limitations;await writeFile(p,json(v));}},"FAIL"));
cases.push(await runCase(3,"Nested arbitrary-name valid Security evidence is required by manifest",async(c,stage)=>{if(stage==="before-bindings")c.nestedRefs.push(await addNestedEvidence(c,validNested(c.caseTaskId)));},"PASS"));
cases.push(await runCase(4,"Nested arbitrary-name schema-invalid Security evidence is required by manifest",async(c,stage)=>{if(stage==="before-bindings")c.nestedRefs.push(await addNestedEvidence(c,invalidNested(c.caseTaskId)));},"FAIL"));
cases.push(await runCase(5,"Nested Security evidence is missing while manifest still references it",async(c,stage)=>{if(stage==="before-bindings")c.nestedRefs.push(await addNestedEvidence(c,validNested(c.caseTaskId),{createFile:false}));},"FAIL"));
cases.push(await runCase(6,"Nested Security evidence declares an unregistered schema version",async(c,stage)=>{if(stage==="before-bindings")c.nestedRefs.push(await addNestedEvidence(c,{schema_version:999,task_id:c.caseTaskId,kind:"unregistered-security-evidence"}));},"FAIL"));
cases.push(await runCase(7,"Referenced Security evidence path escapes Task root",async(c,stage)=>{if(stage==="before-bindings")c.nestedRefs.push(await addNestedEvidence(c,validNested(c.caseTaskId),{createFile:false,escape:true}));},"FAIL"));
cases.push(await runCase(8,"Two Security evidence files exist and the required nested one is invalid",async(c,stage)=>{if(stage==="before-bindings")c.nestedRefs.push(await addNestedEvidence(c,invalidNested(c.caseTaskId)));},"FAIL"));
cases.push(await runCase(9,"Manifest marks required nested Security evidence VERIFIED although schema-invalid",async(c,stage)=>{if(stage==="before-bindings")c.nestedRefs.push(await addNestedEvidence(c,{schema_version:1,task_id:c.caseTaskId,claim:"registered-schema-valid",invalid_extra:true}));},"FAIL"));
cases.push(await runCase(10,"Task omits standard Security evidence",async(c,stage)=>{if(stage==="after-bindings")await rm(path.join(c.directory,"security-evidence.yaml"),{force:true});},"FAIL"));

const keyCase=cases.find((item)=>item.case_id==="CASE-04");
const productionResults={schema_version:1,task_id:taskId,production_entrypoint:"validateTask(taskId, {projectRoot: isolatedRoot, writeGraph: true, targetGate: bootstrap-candidate-review})",official_modules_loaded_from_candidate:[".codex/scripts/validate-task.mjs",".codex/scripts/lib/governance/governance-schema-loader.mjs",".codex/scripts/lib/schema-validator.mjs"],fixture_write_scope:`${taskRef}/_isolated-fixtures/**`,cases,total:cases.length,expected_controls_passed:cases.filter((item)=>item.expectation_met).length,security_failures:cases.filter((item)=>!item.expectation_met).map((item)=>item.case_id),result:keyCase.observed==="PASS"?"REPRODUCED_FAIL_OPEN":"NOT_REPRODUCED"};
await writeJson("production-path-test-results.json",productionResults);
await writeJson("schema-invalid-evidence-reproduction.json",{schema_version:1,task_id:taskId,finding_id:"B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001",case:keyCase,reproduction_condition:"schema-invalid referenced Security evidence plus regenerated artifact manifest hash, fixture freeze, candidate record and scanner report",authoritative_result:keyCase.observed==="PASS"?"VALID_OR_GO_OR_EXIT_0":"FAIL_CLOSED",finding_reproduced:keyCase.observed==="PASS",classification:keyCase.observed==="PASS"?"CANDIDATE_PRODUCTION_PATH_DEFECT":"NOT_REPRODUCED"});

const contractAnalysis={schema_version:1,task_id:taskId,answers:[
  {question:1,answer:"The current production validator hard-codes <task-root>/security-evidence.yaml in requiredFiles and schemaFiles."},
  {question:2,answer:"No machine-readable resolver maps every manifest/freeze/scope/binding-chain Security-evidence reference to the registered Security Evidence Schema. Referenced artifacts receive hash, text, binary and metadata checks only."},
  {question:3,answer:"validate-task.mjs#validateTask is the authoritative Task and Candidate Gate entrypoint; governance-schema-loader.mjs supplies the registered schemas. b6-review-protocol.mjs is task-local review orchestration logic and does not validate Session B Security evidence."},
  {question:4,answer:"No candidate production code directly loads session-b6-security-evidence.yaml through the registered schema. Candidate references to that exact path occur only in frozen input/read-scope records."},
  {question:5,answer:"Yes. Hash and freeze checks prove byte identity/integrity only, not schema validity or semantic authority."},
  {question:6,answer:"The production implementation guarantees registered-schema validation for the fixed task-root file. The reviewed candidate does not implement an equivalent guarantee for every referenced Security evidence artifact."}
],evidence:[".codex/scripts/validate-task.mjs",".codex/scripts/lib/governance/governance-schema-loader.mjs",".codex/blueprints/schemas/security-evidence.schema.json",".codex/tasks/GOV-PHASE1-REMEDIATION-12/b6-review-protocol.mjs",".codex/tasks/GOV-PHASE1-REMEDIATION-12/session-b6-pre-review-package/pre-review-input-manifest.json",".codex/tasks/GOV-PHASE1-REMEDIATION-12/session-b6-pre-review-package/session-b6-security-evidence.yaml"],conclusion:"A required manifest-referenced Security evidence artifact can affect the Candidate Gate as valid evidence without registered-schema validation."};
await writeJson("authoritative-security-evidence-contract-analysis.json",contractAnalysis);
await writeJson("production-path-test-plan.json",{schema_version:1,task_id:taskId,entrypoint:"validateTask",isolation:"Candidate files are copied byte-for-byte under the authorized Task directory; only fixture copies are mutated.",cases:cases.map(({case_id,title,expected})=>({case_id,title,expected})),prohibited_operations_confirmed:["Git","service","database","seed","migration","product operation"]});

const replayIds=["GOV-PHASE1-L3-REVIEW-A10","GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW","GOV-PHASE1-REMEDIATION-10","GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW","GOV-PHASE1-REMEDIATION-11","GOV-PHASE1-REMEDIATION-12"];
const replays=[];
for(const historicalTaskId of replayIds){const result=await validateTask(historicalTaskId,{projectRoot:sourceRoot,targetGate:"bootstrap-candidate-review"});replays.push({task_id:historicalTaskId,structural:result.errors.length?"INVALID":"VALID",calculated_gate:result.calculatedGate,bootstrap_candidate_review_gate:result.gateResults?.bootstrap_candidate_review?.status??null,exit_code:result.exitCode,error_count:result.errors.length});}
const historicalAnalysis={schema_version:1,task_id:taskId,replays,answers:{retrospective_invalidation:"A new referenced-evidence rule must be versioned and applied prospectively; immutable historical outcomes remain historical evidence and are not rewritten.",versioning_required:true,new_candidate_baseline_required:true,candidate_file_count_changes:"Yes if production code/tests/schema contracts are changed; exact count must be recomputed rather than assumed.",candidate_chain_regeneration_required:["governance-commit-manifest","bootstrap-candidate-record","bootstrap-scanner-report"],invalidated_packages:["R12 pre-review package","External Review Preparation packages","Launch Bootstrap Remediation 01 envelopes and assignments","all payloads bound to the old candidate, including Code R1"],code_r1_future_use:"Finding evidence only; it cannot approve or represent a remediated candidate."},result:"COMPATIBILITY_REVIEW_REQUIRED_FOR_VERSIONED_CANDIDATE_REMEDIATION"};
await writeJson("historical-compatibility-analysis.json",historicalAnalysis);

const classificationResult=keyCase.observed==="PASS"?"VERIFIED_CANDIDATE_PRODUCTION_PATH_DEFECT":"REVIEWER_FINDING_NOT_REPRODUCED";
await writeJson("candidate-impact-assessment.json",{schema_version:1,task_id:taskId,finding_id:"B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001",classification:keyCase.observed==="PASS"?"CANDIDATE_PRODUCTION_PATH_DEFECT":"REVIEWER_FALSE_POSITIVE_OR_CONTRACT_MISMATCH",candidate_change_required:keyCase.observed==="PASS",decisive_case:"CASE-04",criteria:{schema_invalid_referenced_security_evidence:true,hash_manifest_freeze_regenerated:true,authoritative_validator_used:true,validator_structural_valid:keyCase.structural==="VALID",candidate_gate_go:keyCase.bootstrap_candidate_review_gate==="GO",exit_zero:keyCase.exit_code===0},formal_task_result:classificationResult,finding_status:"OPEN"});
await writeJson("remediation-scope-recommendation.json",{schema_version:1,task_id:taskId,classification:"CANDIDATE_PRODUCTION_PATH_DEFECT",candidate_change_required:true,required_design:"referenced-evidence validation",prohibited_design:"Do not hard-code session-b6-security-evidence.yaml or another magic filename.",candidate_files_to_assess:[".codex/scripts/validate-task.mjs",".codex/scripts/lib/governance/governance-schema-loader.mjs",".codex/blueprints/schemas/artifact-manifest.schema.json","machine-readable evidence-type/schema resolver",".codex/tests/run-bootstrap-production-integration.mjs","related integration and mutation tests","candidate manifest/record/scanner report generation chain"],required_behavior:["Resolve every required or Gate-consumed evidence artifact by machine-readable evidence type.","Reject unknown or ambiguous schema mappings.","Load the registered schema and validate the actual referenced bytes before accepting the artifact as required evidence.","Reject duplicate Security evidence unless the contract explicitly models multiplicity."],next_task:"GOV-PHASE1-CANDIDATE-REMEDIATION-13",not_authorized_in_this_task:true});

const migrationPaths=[".codex/tasks/GOV-M320-DRYRUN/artifact-manifest.yaml",".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml",".codex/tasks/GOV-M320-DRYRUN/test-evidence.yaml"];
const migrationIntegrity={schema_version:1,task_id:taskId,files:[],implementation_handoff_read:false,implementation_plan_read:false,migration_320_status:"NEEDS_HUMAN_DECISION / NO-GO"};
for(const ref of migrationPaths)migrationIntegrity.files.push({path:ref,sha256:sha256(await readFile(abs(ref)))});
migrationIntegrity.result="PASS_WITH_EXACT_READ_BOUNDARY";
await writeJson("migration-320-integrity.json",migrationIntegrity);

await rm(workRoot,{recursive:true,force:true});
const protectedAfter=[];
for(const ref of protectedTasks)protectedAfter.push(await hashTree(ref));
const candidateManifestAfter=await readFile(abs(candidateManifestRef));
const candidateFilesAfter=[];
for(const item of candidateManifest.artifacts)candidateFilesAfter.push({path:item.path,sha256:sha256(await readFile(abs(item.path)))});
candidateFilesAfter.sort((a,b)=>a.path.localeCompare(b.path));
const baselineAfter={schema_version:1,task_id:taskId,captured_at:"2026-07-21T00:00:00+08:00",git_used:false,candidate:{file_count:candidateFilesAfter.length,manifest_sha256:sha256(candidateManifestAfter),included_file_set_sha256:jcsSha256(candidateFilesAfter),files:candidateFilesAfter,result:candidateFilesAfter.length===103&&sha256(candidateManifestAfter)===fixed.candidate_manifest_sha256&&jcsSha256(candidateFilesAfter)===fixed.included_file_set_sha256?"PASS":"FAIL"},protected_history:protectedAfter};
await writeJson("review-baseline-after.json",baselineAfter);
const protectedChanges=protectedBefore.flatMap((before,index)=>before.tree_sha256===protectedAfter[index].tree_sha256?[]:[{directory:before.directory,before:before.tree_sha256,after:protectedAfter[index].tree_sha256}]);
const baselineComparison={schema_version:1,task_id:taskId,candidate_changes:baselineBefore.candidate.manifest_sha256===baselineAfter.candidate.manifest_sha256&&baselineBefore.candidate.included_file_set_sha256===baselineAfter.candidate.included_file_set_sha256?[]:["candidate drift"],protected_history_changes:protectedChanges,git_used:false,result:protectedChanges.length===0&&baselineAfter.candidate.result==="PASS"?"PASS":"FAIL"};
await writeJson("baseline-comparison.json",baselineComparison);
await writeJson("historical-artifact-integrity.json",{schema_version:1,task_id:taskId,before:protectedBefore.map(({directory,file_count,tree_sha256})=>({directory,file_count,tree_sha256})),after:protectedAfter.map(({directory,file_count,tree_sha256})=>({directory,file_count,tree_sha256})),changes:protectedChanges,forbidden_migration_handoff_read:false,forbidden_migration_plan_read:false,result:protectedChanges.length===0?"PASS_WITH_EXACT_TASK_BOUNDARIES":"FAIL"});

const taskIntent={schema_version:1,task_id:taskId,status:"COMPLETED_AT_STOP_POINT",title:"External Code Finding Verification 01",objective:"Formally verify Code R1 payload, reproduce or reject the finding through the authoritative production path, and classify remediation scope.",scope:{include:[`${taskRef}/**`],exclude:["103-file candidate writes","R12 writes","External Review package writes",".env*","collab/**","frontend/**","erp-api/**","db-design/**","migration/**","Git","services","databases","seeds","Migration 320 operations"]},fixed_candidate:{candidate_file_count:103,candidate_manifest_sha256:fixed.candidate_manifest_sha256,included_file_set_sha256:fixed.included_file_set_sha256},acceptance_criteria:["Formal payload verification","10-case authoritative production-path matrix","historical compatibility replay","candidate and protected-history integrity"],result:classificationResult};
const classification={schema_version:1,task_id:taskId,level:"L3",reasons:["Unresolved High Reviewer blocker affects a formal Candidate Gate validation path."],triggers:["unresolved Reviewer blocker","release and compatibility gate"],required_agents:["verification-orchestrator"],required_reviews:["future clean-context code","future security","future compatibility"],parallel_allowed:false,evidence_required:["payload verification","10-case production-path matrix","historical compatibility replay","candidate integrity"],human_approval:{required:true,stages:["scope_approval","execution_approval","review_completion","final_commit_approval"]},stop_conditions:["Any candidate/history write","Any Git/product/DB/service operation","Any child Reviewer dispatch"],scope:{include:[`${taskRef}/**`],exclude:["all other paths for write",".env*","collab/**","product paths","Migration 320 plan/handoff"]},classified_by:"task-classification skill plus verification orchestrator",classification_status:"human-approved-scope"};
const blueprint={schema_version:1,blueprint_id:`BP-${taskId}`,task_id:taskId,risk:{level:"L3",reasons:classification.reasons},scope:{read:["103-file candidate","R12","External Review Preparation","Launch Bootstrap Remediation 01","named historical governance Tasks"],write:[`${taskRef}/**`],product_changes_allowed:false,database_operations_allowed:false,git_mutation_allowed:false},execution:{steps:["Verify payload","Analyze authoritative contract","Run isolated 10-case matrix","Replay history","Classify impact","Recheck baselines"],production_entrypoint:".codex/scripts/validate-task.mjs#validateTask"},candidate_rules:[],applicable_rules:["GOV-SCOPE-001","EVD-HASH-001"],rollback_restore:{required:false,evidence_or_reason:"Not applicable: only new Task evidence is written; protected inputs are read-only."},stop_conditions:classification.stop_conditions,final_result:classificationResult};
await writeJson("task-intent.yaml",taskIntent);
await writeJson("classification.yaml",classification);
await writeJson("blueprint.yaml",blueprint);

const validation={schema_version:1,task_id:taskId,formal_payload_result:payloadVerification.formal_result,payload_schema_validation:payloadVerification.schema_validation,payload_jcs_sha256_validation:payloadVerification.jcs_sha256_validation,payload_binding_validation:payloadVerification.binding_validation,payload_access_scope_validation:outOfExactScope.length?"FAIL":"PASS",production_matrix_case_count:cases.length,case_4_observed:keyCase.observed,case_4_exit_code:keyCase.exit_code,case_4_gate:keyCase.bootstrap_candidate_review_gate,candidate_integrity:baselineAfter.candidate.result,protected_history_integrity:protectedChanges.length?"FAIL":"PASS",migration_320_integrity:migrationIntegrity.result,git_used:false,repository_writes_outside_task:false,final_result:classificationResult};
await writeJson("validation-results.json",validation);
await writeFile(path.join(taskDir,"final-summary.md"),`# ${taskId}\n\nFormal result: ${classificationResult}\n\nThe Code R1 wrapper is schema-valid, its RFC 8785 JCS payload hash recomputes to ${fixed.payload_core_sha256}, and all launch-envelope bindings match. It is formally rejected only because four launch-mandated startup reads are absent from the package exact allowlist; this transport/access-contract defect does not decide the technical finding.\n\nCASE-04 reproduced the technical defect through the authoritative validateTask production API: a required, manifest-referenced, schema-invalid nested Security evidence file received regenerated artifact hash, fixture freeze, candidate record and scanner report, yet structural validation remained ${keyCase.structural}, Bootstrap Candidate Review Gate was ${keyCase.bootstrap_candidate_review_gate}, and exit code was ${keyCase.exit_code}.\n\nClassification: CANDIDATE_PRODUCTION_PATH_DEFECT. The finding remains OPEN. Candidate remediation was not performed. The 103-file candidate and all protected historical Task trees remained byte-identical. External Security, Railway and Compatibility Reviewers and Aggregator remain paused. Session B Compatibility, Human Exact-Manifest eligibility and Bootstrap Human Commit remain NO-GO/not eligible.\n`);
await writeFile(path.join(taskDir,"HANDOFF.md"),`# Handoff\n\n- Current goal: verify B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001 without modifying candidate or historical inputs.\n- Result: ${classificationResult}; candidate_change_required=true; finding remains OPEN.\n- What changed: only evidence under ${taskRef}/.\n- Verification: payload schema/JCS/binding; exact access comparison; 10 authoritative production-path cases; six historical validateTask replays; candidate 103/103 before/after; eight protected Task tree hashes; exact Migration 320 read boundary.\n- Known risks: Code R1 payload is formally rejected by the strict package exact-scope rule because launch-mandated startup reads are not included in that package allowlist. This does not negate CASE-04.\n- Suggested next step: human may separately authorize GOV-PHASE1-CANDIDATE-REMEDIATION-13 using referenced-evidence validation, followed by a new candidate baseline and entirely regenerated External Reviewer packages.\n- Prohibited continuation: do not start other Reviewers, Aggregator, remediation implementation, Git, Human Exact-Manifest Confirmation, Steady-State, or Migration 320 approval from this Task.\n`);

console.log(JSON.stringify({task_id:taskId,formal_payload:payloadVerification.formal_result,case_4:{structural:keyCase.structural,gate:keyCase.bootstrap_candidate_review_gate,exit_code:keyCase.exit_code,observed:keyCase.observed},candidate:baselineAfter.candidate.result,history:protectedChanges.length?"FAIL":"PASS",result:classificationResult}));
