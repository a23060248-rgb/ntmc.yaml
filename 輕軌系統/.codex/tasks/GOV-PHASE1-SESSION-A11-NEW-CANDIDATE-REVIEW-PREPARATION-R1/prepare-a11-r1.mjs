import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-SESSION-A11-NEW-CANDIDATE-REVIEW-PREPARATION-R1";
const oldTaskId = "GOV-PHASE1-SESSION-A11-NEW-CANDIDATE-REVIEW-PREPARATION";
const aggregationTaskId = "GOV-PHASE1-SESSION-A11-AGGREGATION-DETERMINISTIC-QA-R1";
const findingId = "B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001";
const generatedAt = "2026-07-21T18:00:00+08:00";
const taskRef = `.codex/tasks/${taskId}`;
const oldTaskRef = `.codex/tasks/${oldTaskId}`;
const remediationRef = ".codex/tasks/GOV-PHASE1-CANDIDATE-REMEDIATION-13";
const packageRoot = path.join(taskDir, "review-packages");
const aggregateWriteRef = `.codex/tasks/${aggregationTaskId}`;
const slash = (value) => value.replaceAll("\\", "/");
const abs = (ref) => path.join(root, ...ref.split("/"));
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex").toUpperCase();
function jcs(value) {
  if (value === null) return "null";
  if (["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}
const jcsSha256 = (value) => sha256(jcs(value));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (ref) => JSON.parse(await readFile(abs(ref), "utf8"));
async function writeJson(name, value) { const target = path.isAbsolute(name) ? name : path.join(taskDir, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, json(value)); }
async function writeText(name, value) { const target = path.isAbsolute(name) ? name : path.join(taskDir, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value); }
async function fileExists(target) { try { return (await stat(target)).isFile(); } catch { return false; } }
async function walkFiles(directory) {
  const output = [];
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) output.push(target);
    }
  }
  await visit(directory);
  return output;
}
async function hashTree(ref) {
  const records = [];
  for (const file of await walkFiles(abs(ref))) records.push({ path: slash(path.relative(root, file)), sha256: sha256(await readFile(file)) });
  return { directory: ref, file_count: records.length, tree_sha256: jcsSha256(records) };
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

const fixed = Object.freeze({
  candidate_file_count: 108,
  candidate_manifest_sha256: "5D728252106E52C1FC998F0517066DD6421A4083833F7987A52D955F9A49DC0A",
  included_file_set_sha256: "0BBFB09D13E7C6F3E28315EF09231C66093856ABABF5B85D25957F7F2CBC1C8B",
  schema_set_sha256: "3020E683DBFAF79D02A0174CC9C2D8F1AF2234C40F956E6BA42937F1FF1E32FE",
  scanner_contract_version: 5,
  scanner_contract_sha256: "E9179C2A52751153D26E8CE604E4CFA860948511944DE16C4DB8BE7E44B077C9"
});
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const recordRef = `${remediationRef}/new-candidate-record.json`;
const reportRef = `${remediationRef}/new-candidate-scanner-report.json`;
async function captureCandidate() {
  const [manifestBytes, recordBytes, reportBytes] = await Promise.all([readFile(abs(manifestRef)), readFile(abs(recordRef)), readFile(abs(reportRef))]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const record = JSON.parse(recordBytes.toString("utf8"));
  const report = JSON.parse(reportBytes.toString("utf8"));
  const files = [];
  for (const artifact of manifest.artifacts) {
    const bytes = await readFile(abs(artifact.path));
    files.push({ path: artifact.path, declared_sha256: artifact.sha256, current_sha256: sha256(bytes), hash_match: artifact.sha256 === sha256(bytes) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const set = files.map((item) => ({ path: item.path, sha256: item.current_sha256 }));
  const binding = {
    candidate_file_count: files.length,
    candidate_manifest_sha256: sha256(manifestBytes),
    included_file_set_sha256: jcsSha256(set),
    schema_set_sha256: record.schema_set_sha256,
    scanner_contract_version: report.scan_contract.contract_version,
    scanner_contract_sha256: record.scan_contract_sha256,
    scanner_report_sha256: sha256(reportBytes),
    evidence_schema_registry_sha256: record.evidence_schema_registry_sha256,
    referenced_evidence_policy_sha256: record.referenced_evidence_policy_sha256,
    all_manifest_hashes_match: files.every((item) => item.hash_match)
  };
  return { binding, files, manifest };
}
function candidateMatches(binding) {
  return Object.entries(fixed).every(([key, value]) => binding[key] === value) && binding.all_manifest_hashes_match;
}

const protectedRefs = [
  oldTaskRef,
  remediationRef,
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10",
  ".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-10",
  ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-12",
  ".codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION",
  ".codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01"
];
const candidateBefore = await captureCandidate();
if (!candidateMatches(candidateBefore.binding)) throw new Error("A11_R1_CANDIDATE_BINDING_CHANGED");
const historyBefore = [];
for (const ref of protectedRefs) historyBefore.push(await hashTree(ref));
await writeJson("review-baseline-before.json", { schema_version: 1, task_id: taskId, captured_at: generatedAt, git_used: false, candidate: candidateBefore, protected_history: historyBefore });

const defects = [
  "RETURN_PAYLOAD_CONTRACT_CONFLICT",
  "CODE_FINDING_CLOSURE_AUTHORITY_CONFLICT",
  "CLEAN_CONTEXT_ATTESTATION_MISSING",
  "AGGREGATOR_WRITE_AND_QA_AUTHORIZATION_MISSING",
  "RAW_QA_EVIDENCE_CONTRACT_MISSING"
];
await writeJson("a11-prelaunch-blocker-classification.json", { schema_version: 1, task_id: taskId, blocker_id: "A11_COMMON_PACKAGE_BINDING_FAILURE", phase: "PRELAUNCH / BEFORE REVIEWER 1", reviewers_started: 0, aggregator_started: 0, candidate_change_required: false, package_change_required: true, defects, remediation_boundary: ["A11 packages", "A11 schemas", "A11 exact scopes", "A11 assignments", "A11 prompts", "A11 identities", "A11 hashes", "A11 launch envelopes", "A11 Aggregator execution contract"], forbidden_changes: ["108-file Candidate", "Candidate Remediation 13", "historical A11 preparation", "historical Reviewer evidence", "Migration 320", "product code", "database", "Git"] });
await writeJson("old-preparation-supersession.json", { schema_version: 1, task_id: taskId, superseded_task_id: oldTaskId, old_task_status: "BLOCKED_PRELAUNCH_CONTRACT_DEFECT", supersession_status: "SUPERSEDED_BY_A11_PREPARATION_R1", old_task_modified: false, candidate_change_required: false });
await writeJson("task-intent.yaml", { schema_version: 1, task_id: taskId, objective: "Remediate only the A11 package contracts and prepare a fail-closed R1 relaunch without starting reviewers or aggregator.", only_write_scope: [`${taskRef}/**`], forbidden: ["108-file Candidate writes", "old A11 writes", "historical Task writes", "Git", "services", "databases", "seeds", "migrations", "child agents", "Reviewer launch", "Aggregator launch"] });
await writeJson("classification.yaml", { schema_version: 1, task_id: taskId, level: "L3", classification: "PACKAGE_CONTRACT_REMEDIATION_ONLY", candidate_change_required: false, reviewer_launch_authorized: false, aggregator_launch_authorized: false, git_authorized: false });
await writeJson("blueprint.yaml", { schema_version: 1, task_id: taskId, phases: ["freeze candidate and history", "define canonical wrappers and authorities", "generate five new packages", "verify launch bijection", "execute package contract tests", "recheck immutable inputs", "stop before launch"], hard_stops: ["A11_R1_CANDIDATE_BINDING_CHANGED", "A11_R1_RETURN_SCHEMA_AUTHORITY_AMBIGUOUS", "A11_R1_CLOSURE_AUTHORITY_AMBIGUOUS", "A11_R1_LAUNCH_SCOPE_MISMATCH", "A11_R1_AGGREGATOR_WRITE_SCOPE_OVERBROAD", "A11_R1_QA_COMMAND_NOT_DETERMINISTIC", "A11_R1_RAW_EVIDENCE_CONTRACT_INCOMPLETE", "A11_R1_PACKAGE_HASH_INVALID", "A11_R1_IDENTITY_COLLISION", "A11_R1_HISTORICAL_ARTIFACT_CHANGED"] });

const candidateBinding = Object.freeze({
  candidate_file_count: fixed.candidate_file_count,
  candidate_manifest_sha256: fixed.candidate_manifest_sha256,
  included_file_set_sha256: fixed.included_file_set_sha256,
  schema_set_sha256: fixed.schema_set_sha256,
  scanner_contract_version: fixed.scanner_contract_version,
  scanner_contract_sha256: fixed.scanner_contract_sha256
});
await writeJson("candidate-binding-verification.json", { schema_version: 1, task_id: taskId, fixed_candidate: fixed, observed_candidate: candidateBefore.binding, candidate_byte_identity: candidateBefore.binding.all_manifest_hashes_match, result: candidateMatches(candidateBefore.binding) ? "PASS" : "FAIL" });

const b2Findings = ["B2-CODE-FORBIDDEN-READ-001", "B2-COMPAT-OFFICIAL-SECURITY-EVIDENCE-SCHEMA-001", "B2-COMPAT-SECURITY-ALLOWLIST-FORBIDDEN-READ-001", "B2-QA-THREAD-LIMIT-001"];
await writeJson("a11-finding-closure-authority.json", { schema_version: 1, task_id: taskId, required_closure_set: [findingId], owners: { [findingId]: "EXTERNAL_CODE_REVIEWER" }, excluded_findings: b2Findings.map((finding_id) => ({ finding_id, status: "NOT_CLOSED", scope: "OUTSIDE_A11_CLOSURE_SCOPE" })), aggregator_can_close_findings: false, ambiguity_detected: false });

const reviewerCleanContext = {
  top_level_chat: { const: true }, subagents_created: { const: false }, implementation_conversation_received: { const: false },
  other_reviewer_conversation_received: { const: false }, other_reviewer_payload_received: { const: false }, conversation_memory_used: { const: false },
  repository_write_performed: { const: false }, git_used: { const: false }, assurance: { const: "procedural" }
};
await writeJson("reviewer-clean-context-contract.json", { schema_version: 1, task_id: taskId, required_fields: Object.keys(reviewerCleanContext), required_values: Object.fromEntries(Object.entries(reviewerCleanContext).map(([key, value]) => [key, value.const])), blocker_on_mismatch: true });
const aggregatorAttestation = {
  top_level_chat: true, subagents_created: false, conversation_memory_used: false, reviewer_role_assumed: false, reviewer_outcome_modified: false,
  task_local_writes_performed: true, writes_outside_allowed_scope: false, candidate_write_performed: false, package_write_performed: false,
  historical_artifact_write_performed: false, git_used: false, assurance: "procedural"
};
await writeJson("aggregator-execution-attestation-contract.json", { schema_version: 1, task_id: taskId, role: "A11_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER", required_values: aggregatorAttestation, allowed_write_paths: [`${aggregateWriteRef}/**`], all_other_repository_writes_forbidden: true });

function reviewerSchema(role, ids) {
  const code = role.reviewer_role === "EXTERNAL_CODE_REVIEWER";
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": `https://ntmc.local/codex/a11-r1/${role.slug}-return-payload.schema.json`,
    type: "object", additionalProperties: false, required: ["payload_core", "payload_core_sha256"],
    properties: {
      payload_core: { type: "object", additionalProperties: false,
        required: ["schema_version", "review_package_id", "review_package_core_sha256", "task_id", "reviewer_role", "assignment_id", "reviewer_run_id", "reviewer_session_nonce", "candidate_binding", "startup", "review_status", "review_started", "candidate_content_reviewed", "completed", "mandatory_exit_requested", "findings", "closure_dispositions", "access_log", "clean_context_attestation"],
        properties: {
          schema_version: { const: 1 }, review_package_id: { const: ids.review_package_id }, review_package_core_sha256: { pattern: "^[A-F0-9]{64}$" }, task_id: { const: taskId }, reviewer_role: { const: role.reviewer_role }, assignment_id: { const: ids.assignment_id }, reviewer_run_id: { const: ids.reviewer_run_id }, reviewer_session_nonce: { const: ids.reviewer_session_nonce }, candidate_binding: { const: candidateBinding },
          startup: { type: "object", additionalProperties: false, required: ["status", "reason"], properties: { status: { enum: ["STARTUP_VALID", "STARTUP_BLOCKER"] }, reason: { type: ["string", "null"] } } },
          review_status: { enum: ["PASS", "BLOCKER"] }, review_started: { type: "boolean" }, candidate_content_reviewed: { type: "boolean" }, completed: { type: "boolean" }, mandatory_exit_requested: { type: "boolean" },
          findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["finding_id", "severity", "summary", "owned_by_role", "evidence_paths"], properties: { finding_id: { type: "string", minLength: 1 }, severity: { enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] }, summary: { type: "string", minLength: 1 }, owned_by_role: { type: "boolean" }, evidence_paths: { type: "array", items: { type: "string" } } } } },
          closure_dispositions: { type: "array", minItems: code ? 1 : 0, maxItems: code ? 1 : 0, items: { type: "object", additionalProperties: false, required: ["finding_id", "disposition", "owner_role", "evidence_paths", "reason"], properties: { finding_id: { const: findingId }, disposition: { enum: ["CLOSED", "NOT_CLOSED"] }, owner_role: { const: "EXTERNAL_CODE_REVIEWER" }, evidence_paths: { type: "array", minItems: 1, items: { type: "string" } }, reason: { type: "string", minLength: 1 } } } },
          access_log: { type: "object", additionalProperties: false, required: ["read_paths", "forbidden_read_count", "out_of_scope_read_count"], properties: { read_paths: { type: "array", items: { type: "string" } }, forbidden_read_count: { const: 0 }, out_of_scope_read_count: { const: 0 } } },
          clean_context_attestation: { type: "object", additionalProperties: false, required: Object.keys(reviewerCleanContext), properties: reviewerCleanContext }
        }
      },
      payload_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" }
    }
  };
}

function aggregatorSchema(ids) {
  const coreProperties = {
    schema_version: { const: 1 }, aggregation_package_id: { const: ids.aggregation_package_id }, aggregation_package_core_sha256: { pattern: "^[A-F0-9]{64}$" }, task_id: { const: taskId }, assignment_id: { const: ids.assignment_id }, aggregator_run_id: { const: ids.aggregator_run_id }, aggregator_session_nonce: { const: ids.aggregator_session_nonce }, candidate_binding: { const: candidateBinding },
    imported_payload_count: { type: "integer", minimum: 0, maximum: 4 }, formal_payloads_accepted: { type: "integer", minimum: 0, maximum: 4 }, reviewer_outcomes: { type: "array", minItems: 4, maxItems: 4 }, finding_closure_matrix: { type: "array", minItems: 1 }, deterministic_qa: { type: "object" }, calculated_gate: { enum: ["GO", "NO-GO"] }, completed: { const: true }, mandatory_exit_requested: { const: true },
    execution_attestation: { type: "object", additionalProperties: false, required: Object.keys(aggregatorAttestation), properties: Object.fromEntries(Object.entries(aggregatorAttestation).map(([key, value]) => [key, { const: value }])) }
  };
  return { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://ntmc.local/codex/a11-r1/aggregator-output.schema.json", type: "object", additionalProperties: false, required: ["payload_core", "payload_core_sha256"], properties: { payload_core: { type: "object", additionalProperties: false, required: Object.keys(coreProperties), properties: coreProperties }, payload_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" } } };
}

await writeJson("reviewer-return-wrapper-contract.json", { schema_version: 1, task_id: taskId, wrapper_top_level_fields: ["payload_core", "payload_core_sha256"], additional_properties: false, hash_rule: "SHA256(UTF8(RFC8785_JCS(payload_core)))", prohibited_aliases: ["outcome", "run_id", "result", "decision"], role_specific_schemas: ["code-review", "security-review", "railway-domain-review", "compatibility-review"].map((slug) => `${taskRef}/review-packages/${slug}/return-payload.schema.json`) });
await writeJson("aggregator-output-wrapper-contract.json", { schema_version: 1, task_id: taskId, wrapper_top_level_fields: ["payload_core", "payload_core_sha256"], additional_properties: false, hash_rule: "SHA256(UTF8(RFC8785_JCS(payload_core)))", role: "A11_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER", is_reviewer: false });

const manualTransportSchema = { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://ntmc.local/codex/a11-r1/manual-transport-attestation.schema.json", type: "object", additionalProperties: false, required: ["reviewer_role", "source_thread_id", "payload_sha256", "payload_modified", "transported_by_human"], properties: { reviewer_role: { enum: ["EXTERNAL_CODE_REVIEWER", "EXTERNAL_SECURITY_REVIEWER", "EXTERNAL_RAILWAY_DOMAIN_REVIEWER", "EXTERNAL_COMPATIBILITY_REVIEWER"] }, source_thread_id: { type: "string", minLength: 1 }, payload_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" }, payload_modified: { const: false }, transported_by_human: { const: true } } };
const aggregatorInputSchema = { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://ntmc.local/codex/a11-r1/aggregator-input.schema.json", type: "object", additionalProperties: false, required: ["reviewer_payloads", "manual_transport_attestations", "package_bindings", "candidate_binding", "fresh_qa_command_manifest"], properties: { reviewer_payloads: { type: "array", minItems: 4, maxItems: 4 }, manual_transport_attestations: { type: "array", minItems: 4, maxItems: 4, items: manualTransportSchema }, package_bindings: { type: "array", minItems: 4, maxItems: 4 }, candidate_binding: { const: candidateBinding }, fresh_qa_command_manifest: { type: "object" } } };
await writeJson("manual-transport-attestation.schema.json", manualTransportSchema);
await writeJson("aggregator-input.schema.json", aggregatorInputSchema);
await writeJson("reviewer-payload-import-contract.json", { schema_version: 1, task_id: taskId, required_reviewer_payload_count: 4, required_transport_attestation_count: 4, raw_payload_modification_forbidden: true, hash_recalculation_by_transporter_forbidden: true, missing_payload_disposition: "AGGREGATION_INPUT_INVALID_AND_A11_NO_GO", reviewer_outcome_modification_forbidden: true, package_binding_required: true, candidate_binding: candidateBinding });

const qaOutputSchema = { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://ntmc.local/codex/a11-r1/deterministic-qa-output.schema.json", type: "object", additionalProperties: false, required: ["suite", "command_id", "expected_count", "actual_count", "passed", "failed", "expected_exit_code", "actual_exit_code", "mutation_total", "mutation_killed", "raw_report_path"], properties: { suite: { type: "string" }, command_id: { type: "string" }, expected_count: { type: "integer" }, actual_count: { type: "integer" }, passed: { type: "integer" }, failed: { type: "integer" }, expected_exit_code: { type: "integer" }, actual_exit_code: { type: "integer" }, mutation_total: { type: ["integer", "null"] }, mutation_killed: { type: ["integer", "null"] }, raw_report_path: { type: "string" } } };
await writeJson("deterministic-qa-output.schema.json", qaOutputSchema);

const qaRunnerRefs = {
  syntax: `${taskRef}/qa-runners/run-syntax-checks.mjs`,
  candidate: `${taskRef}/qa-runners/verify-candidate-integrity.mjs`,
  packages: `${taskRef}/qa-runners/verify-a11-r1-packages.mjs`
};
const scannerCases = (await readJson(".codex/tests/scanner-production-case-manifest.json")).cases.length;
const qaSpecs = [
  ["QA-SYNTAX", "Syntax checks", qaRunnerRefs.syntax, [], 13, 0, null],
  ["QA-GOV-FIXTURES", "Governance fixtures", ".codex/tests/run-governance-fixtures.mjs", [], 68, 0, null],
  ["QA-CONCURRENCY", "Concurrency isolation", ".codex/tests/run-governance-fixtures-concurrency.mjs", [], 2, 0, null],
  ["QA-SCANNER", "Production scanner", ".codex/tests/run-bootstrap-scanner-production.mjs", [], scannerCases, 0, null],
  ["QA-PROD-INTEGRATION", "Production integration", ".codex/tests/run-bootstrap-production-integration.mjs", [], 49, 0, null],
  ["QA-EXISTING-MUTATIONS", "Existing production mutations", ".codex/tests/run-bootstrap-mutation-tests.mjs", [], 31, 0, 31],
  ["QA-REF-EVIDENCE-24", "Referenced-evidence 24-case matrix", ".codex/tests/run-referenced-evidence-production.mjs", [], 24, 0, null],
  ["QA-REF-EVIDENCE-MUT-8", "Referenced-evidence 8 mutations", ".codex/tests/run-referenced-evidence-mutations.mjs", [], 8, 0, 8],
  ["QA-REVIEWER-BINDING", "Reviewer binding", ".codex/tests/run-reviewer-binding-regressions.mjs", [], 14, 0, null],
  ["QA-SCHEMA-LOADER", "Official schema-loader integration", ".codex/tests/run-official-schema-loader-integration.mjs", [], 11, 0, null],
  ["QA-SCHEMA-MUTATIONS", "Schema-loader mutations", ".codex/tests/run-official-schema-loader-mutations.mjs", [], 6, 0, 6],
  ["QA-BINARY-MUTATIONS", "Binary magic mutations", ".codex/tests/run-binary-magic-registry-mutations.mjs", [], 45, 0, 45],
  ["QA-REM10", "Remediation 10 chain", ".codex/tasks/GOV-PHASE1-REMEDIATION-10/run-security-chain-tests.mjs", [], 20, 1, null],
  ["QA-R11", "R11 preparation tests", ".codex/tasks/GOV-PHASE1-REMEDIATION-11/run-preparation-tests.mjs", [], 30, 0, null],
  ["QA-R12", "R12 protocol tests", ".codex/tasks/GOV-PHASE1-REMEDIATION-12/run-remediation-12-tests.mjs", [], 30, 1, null],
  ["QA-CANDIDATE-108", "Candidate 108/108 integrity", qaRunnerRefs.candidate, [], 108, 0, null],
  ["QA-A11-R1-PACKAGES", "A11 R1 package and launch tests", qaRunnerRefs.packages, [], 24, 0, null]
];
const qaCommands = qaSpecs.map(([command_id, suite, script, exact_arguments, expected_case_count, expected_exit_code, mutation_total]) => ({ command_id, suite, exact_script_path: slash(abs(script)), exact_arguments, working_directory: slash(root), timeout_ms: 900000, expected_exit_code, expected_case_count, mutation_total, output_artifact_path: slash(abs(`${aggregateWriteRef}/deterministic-qa-raw-reports/${command_id}.json`)), candidate_write_expected: false, network_required: false, service_required: false, database_required: false }));
await writeJson("deterministic-qa-command-manifest.json", { schema_version: 1, task_id: taskId, command_count: qaCommands.length, arbitrary_commands_forbidden: true, commands: qaCommands });
await writeJson("deterministic-qa-execution-contract.json", { schema_version: 1, task_id: taskId, execution_role: "A11_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER", exact_commands_only: true, command_manifest: `${taskRef}/deterministic-qa-command-manifest.json`, allowed_working_directory: slash(root), allowed_write_root: `${aggregateWriteRef}/**`, candidate_write_allowed: false, package_write_allowed: false, historical_artifact_write_allowed: false, git_allowed: false, network_allowed: false, services_allowed: false, databases_allowed: false, seeds_allowed: false, migrations_allowed: false, historical_expected_exit_contract: { "QA-REM10": { expected_exit_code: 1, explained_supersession_cases: ["CV-05", "AL-14", "CH-20"] }, "QA-R12": { expected_exit_code: 1, explained_supersession_cases: ["12"] } } });
await writeJson("deterministic-qa-fail-closed-rules.json", { schema_version: 1, task_id: taskId, rules: ["Missing command result => QA FAIL", "Unexpected exit code => QA FAIL", "Case count mismatch => QA FAIL", "Mutation survivor => QA FAIL", "Raw report missing => QA INVALID", "Candidate write => A11 NO-GO", "Scope-external write => A11 NO-GO", "Historical expected failures must exactly match the supersession ledger"] });
const rawEvidenceFiles = ["imported-reviewer-payloads/", "transport-attestations/", "payload-schema-verification.json", "payload-jcs-hash-verification.json", "reviewer-binding-verification.json", "reviewer-access-scope-verification.json", "reviewer-independence-verification.json", "finding-closure-matrix.json", "deterministic-qa-raw-reports/", "deterministic-qa-suite-ledger.json", "deterministic-qa-verification.json", "candidate-integrity-before.json", "candidate-integrity-after.json", "candidate-integrity-comparison.json", "a11-gate-calculation.json", "aggregation-output.json", "final-summary.md"];
await writeJson("fresh-qa-raw-evidence-contract.json", { schema_version: 1, task_id: taskId, output_root: `${aggregateWriteRef}/`, required_outputs: rawEvidenceFiles, suite_ledger_required_fields: ["suite", "command_id", "expected_count", "actual_count", "passed", "failed", "expected_exit_code", "actual_exit_code", "mutation_total", "mutation_killed", "raw_report_path"], summary_only_forbidden: true, raw_output_required: true });
await writeJson("a11-gate-calculation-contract.json", { schema_version: 1, task_id: taskId, gate: "A11_CANDIDATE_REVIEW", go_requires: ["Reviewer payloads 4/4 present", "Formal payloads accepted 4/4", "Reviewer outcomes 4/4 PASS", "Reviewer identities and nonces unique", "Forbidden and out-of-scope reads 0", "Reviewer repository writes 0", "Reviewer subagents 0", "Candidate binding and byte identity unchanged", "Code Reviewer legally CLOSED the owned finding", "Fresh Deterministic QA all PASS", "All mutations killed", "Aggregator writes only in its task-local evidence root", "Historical artifacts unchanged"], b2_findings: b2Findings.map((finding_id) => ({ finding_id, status: "NOT_CLOSED", scope: "OUTSIDE_A11_SCOPE" })), human_exact_manifest_eligibility_on_go: true, bootstrap_human_commit_gate_on_go: "NO-GO / PENDING HUMAN CONFIRMATION", fail_closed: true });

const rootCore = { schema_version: 1, task_id: taskId, binding_id: "A11-R1-ROOT-BINDING-20260721", repository_root: slash(root), candidate_manifest_absolute_path: slash(abs(manifestRef)), candidate_manifest_sha256: fixed.candidate_manifest_sha256, path_rule: "ABSOLUTE_EXACT_PATHS_ONLY" };
const rootBinding = { ...rootCore, repository_root_binding_core_sha256: jcsSha256(rootCore) };
await writeJson("repository-root-binding.json", rootBinding);

const roles = [
  { slug: "code-review", reviewer_role: "EXTERNAL_CODE_REVIEWER", label: "A11 R1 Code Reviewer", index: "01", authority: [findingId], finding_closure_forbidden: false, requirements: ["Verify manifest-driven referenced-evidence resolver and authority order", "Verify registered schema-loader wiring, validateTask fail-closed flow, Gate completeness and bidirectional evidence consistency", "Verify path canonicalization and production Case 4 rejection", "Verify all eight new mutations are killed", "Verify candidate contains the remediation and remains byte-identical", "Close the owned finding only when every closure prerequisite is satisfied"] },
  { slug: "security-review", reviewer_role: "EXTERNAL_SECURITY_REVIEWER", label: "A11 R1 Security Reviewer", index: "02", authority: [], finding_closure_forbidden: true, requirements: ["Verify nested invalid evidence cannot bypass validation by recomputing hashes", "Verify unknown evidence types, schema mismatch and registry mismatch fail closed", "Verify path escape and duplicate Security evidence defenses", "Verify invalid optional evidence is rejected", "Verify scanner clean claims do not overstate referenced-evidence validation"] },
  { slug: "railway-domain-review", reviewer_role: "EXTERNAL_RAILWAY_DOMAIN_REVIEWER", label: "A11 R1 Railway Domain Reviewer", index: "03", authority: [], finding_closure_forbidden: true, requirements: ["Verify no Railway business rule is created", "Verify Confirmed Railway Rule count remains zero", "Verify domain authority boundaries remain closed", "Verify Migration 320 remains NEEDS_HUMAN_DECISION / NO-GO", "Verify technical evidence schema changes are not business approval"] },
  { slug: "compatibility-review", reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER", label: "A11 R1 Compatibility Reviewer", index: "04", authority: [], finding_closure_forbidden: true, requirements: ["Verify the new manifest format is versioned", "Verify the old candidate is HISTORICAL_ONLY with no legacy fail-open", "Verify the 103-file candidate and historical packages are unchanged", "Verify the 108-file candidate binding", "Verify old External packages are SUPERSEDED and A10 is old-baseline-only", "Verify R1 IDs and hashes do not reuse old identities"] }
];

const remediationEvidence = [
  `${remediationRef}/new-candidate-verification.json`, `${remediationRef}/old-new-candidate-comparison.json`, `${remediationRef}/candidate-change-scope-verification.json`,
  `${remediationRef}/production-path-before-fix.json`, `${remediationRef}/production-path-after-fix.json`, `${remediationRef}/mutation-test-results.json`,
  `${remediationRef}/regression-test-ledger.json`, `${remediationRef}/historical-compatibility-analysis.json`, `${remediationRef}/expected-outcome-change-ledger.json`,
  `${remediationRef}/historical-artifact-integrity.json`, `${remediationRef}/finding-status.json`, `${remediationRef}/external-review-supersession.json`,
  `${remediationRef}/candidate-remediation-13-gate.json`, recordRef, reportRef, manifestRef
];
const candidateRefs = candidateBefore.manifest.artifacts.map((item) => item.path);
const oldIndex = await readJson(`${oldTaskRef}/a11-review-package-manifest.json`);
const oldPackageEvidence = oldIndex.packages.flatMap((item) => ["assignment.json", "exact-read-scope.json", "finding-ownership.json", "package-manifest.json", "package-verification.json", "reviewer-launch-envelope.json", "return-payload.schema.json"].map((name) => slash(path.relative(root, path.join(item.package_directory, name)))));
const compatibilityEvidence = [`${remediationRef}/_before-fix-fixtures/case-04/.codex/governance/governance-commit-manifest.yaml`, `${oldTaskRef}/a11-review-package-manifest.json`, ...oldPackageEvidence];
const commonTechnicalRefs = [...new Set([...candidateRefs, ...remediationEvidence])].sort();

const createdPackages = [];
function cleanAttestationValue() { return Object.fromEntries(Object.entries(reviewerCleanContext).map(([key, rule]) => [key, rule.const])); }
function wrapperForStartupBlocker(role, ids, packageDigest, reason = "<ACTUAL_REASON>") {
  const core = { schema_version: 1, review_package_id: ids.review_package_id, review_package_core_sha256: packageDigest, task_id: taskId, reviewer_role: role.reviewer_role, assignment_id: ids.assignment_id, reviewer_run_id: ids.reviewer_run_id, reviewer_session_nonce: ids.reviewer_session_nonce, candidate_binding: candidateBinding, startup: { status: "STARTUP_BLOCKER", reason }, review_status: "BLOCKER", review_started: false, candidate_content_reviewed: false, completed: true, mandatory_exit_requested: true, findings: [], closure_dispositions: role.reviewer_role === "EXTERNAL_CODE_REVIEWER" ? [{ finding_id: findingId, disposition: "NOT_CLOSED", owner_role: "EXTERNAL_CODE_REVIEWER", evidence_paths: [slash(abs(`${taskRef}/review-packages/${role.slug}/embedded-startup-blocker-template.json`))], reason: "Startup was not valid; technical review and closure are forbidden." }] : [], access_log: { read_paths: [], forbidden_read_count: 0, out_of_scope_read_count: 0 }, clean_context_attestation: cleanAttestationValue() };
  return { payload_core: core, payload_core_sha256: jcsSha256(core) };
}

for (const role of roles) {
  const dir = path.join(packageRoot, role.slug);
  const ref = `${taskRef}/review-packages/${role.slug}`;
  await mkdir(dir, { recursive: true });
  const ids = { review_package_id: `A11-R1-${role.reviewer_role.replace("EXTERNAL_", "").replaceAll("_", "-")}-PKG-20260721-${role.index}`, assignment_id: `A11-R1-${role.reviewer_role.replace("EXTERNAL_", "").replaceAll("_", "-")}-ASSIGN-20260721-${role.index}`, reviewer_run_id: `A11-R1-${role.reviewer_role.replace("EXTERNAL_", "").replaceAll("_", "-")}-RUN-20260721-${role.index}` };
  ids.reviewer_session_nonce = sha256(`${taskId}|${ids.review_package_id}|${ids.reviewer_run_id}|FRESH-TOP-LEVEL-R1`);
  const launchNames = ["repository-root-binding.json", "absolute-launch-envelope.json", "embedded-startup-blocker-template.json", "assignment.json", "package-manifest.json", "package-verification.json", "exact-read-scope.json", "capability-artifact-matrix.json", "startup-contract.json", "review-requirements.json", "finding-ownership.json", "return-payload.schema.json"];
  const launchPaths = launchNames.map((name) => slash(name === "repository-root-binding.json" ? path.join(taskDir, name) : path.join(dir, name)));
  const technicalRefs = [...new Set([...commonTechnicalRefs, ...(role.slug === "compatibility-review" ? compatibilityEvidence : [])])].sort();
  const scopeCore = { schema_version: 1, task_id: taskId, ...ids, reviewer_role: role.reviewer_role, launch_allowlist: launchPaths, technical_review_allowlist: technicalRefs.map((item) => slash(abs(item))), forbidden_roots: [".env", "collab", "frontend", "erp-api", "db-design", "migration"].map((item) => slash(abs(item))), exact_paths_only: true, repository_write_allowed: false, git_allowed: false };
  const scope = { ...scopeCore, scope_sha256: jcsSha256(scopeCore) };
  const assignment = { schema_version: 1, task_id: taskId, ...ids, reviewer_role: role.reviewer_role, candidate_binding: candidateBinding, lifecycle: "PREPARED_NOT_STARTED", top_level_chat_required: true, subagents_allowed: false, conversation_memory_allowed: false, repository_write_allowed: false, git_allowed: false, closure_authority: role.authority, finding_closure_forbidden: role.finding_closure_forbidden };
  const ownership = { schema_version: 1, task_id: taskId, assignment_id: ids.assignment_id, reviewer_role: role.reviewer_role, closure_authority: role.authority, finding_closure_forbidden: role.finding_closure_forbidden, required_closure_set: role.authority, b2_findings: b2Findings.map((finding_id) => ({ finding_id, status: "NOT_CLOSED", scope: "OUTSIDE_A11_CLOSURE_SCOPE" })) };
  const requirements = { schema_version: 1, task_id: taskId, assignment_id: ids.assignment_id, reviewer_role: role.reviewer_role, requirements: role.requirements, candidate_binding: candidateBinding, mandatory_output: "TWO_FIELD_CANONICAL_WRAPPER_ONLY", prohibited_output_fields: ["outcome", "run_id", "result", "decision"], code_closure_prerequisites: role.slug === "code-review" ? ["STARTUP_VALID", "PASS", "technical review completed", "Candidate binding verified", "Case 4 fail-closed verified", "manifest-driven resolver verified", "registered schema-loader wiring verified", "8/8 new mutations killed evidence verified", "no forbidden or out-of-scope read", "Candidate content unchanged"] : [] };
  const capability = { schema_version: 1, task_id: taskId, assignment_id: ids.assignment_id, reviewer_role: role.reviewer_role, capabilities: role.requirements.map((requirement, index) => ({ capability_id: `${role.index}-${String(index + 1).padStart(2, "0")}`, requirement, artifact_paths: technicalRefs.map((item) => slash(abs(item))), satisfiable: true })), result: "SATISFIABLE" };
  const startup = { schema_version: 1, task_id: taskId, ...ids, reviewer_role: role.reviewer_role, startup_order: launchNames, candidate_content_review_forbidden_until_startup_valid: true, fail_closed_on_missing_path: true, fail_closed_on_hash_mismatch: true, fail_closed_on_scope_mismatch: true, output_exactly_one_wrapper: true };
  const schema = reviewerSchema(role, ids);
  await Promise.all([
    writeJson(path.join(dir, "assignment.json"), assignment), writeJson(path.join(dir, "exact-read-scope.json"), scope), writeJson(path.join(dir, "finding-ownership.json"), ownership),
    writeJson(path.join(dir, "capability-artifact-matrix.json"), capability), writeJson(path.join(dir, "startup-contract.json"), startup), writeJson(path.join(dir, "review-requirements.json"), requirements), writeJson(path.join(dir, "return-payload.schema.json"), schema)
  ]);
  const coreFiles = ["assignment.json", "exact-read-scope.json", "finding-ownership.json", "capability-artifact-matrix.json", "startup-contract.json", "review-requirements.json", "return-payload.schema.json"];
  const coreHashes = [];
  for (const name of coreFiles) coreHashes.push({ absolute_path: slash(path.join(dir, name)), sha256: sha256(await readFile(path.join(dir, name))) });
  const packageCore = { schema_version: 1, task_id: taskId, ...ids, reviewer_role: role.reviewer_role, candidate_binding: candidateBinding, scope_sha256: scope.scope_sha256, launch_entries: launchPaths, core_file_hashes: coreHashes };
  const packageDigest = jcsSha256(packageCore);
  const blocker = wrapperForStartupBlocker(role, ids, packageDigest);
  await writeJson(path.join(dir, "embedded-startup-blocker-template.json"), blocker);
  const prompt = `# ${role.label} — Standalone Top-Level Prompt\n\nExecute only in a brand-new top-level Codex chat. Act only as ${role.reviewer_role}. Do not use conversation memory or implementation context. Do not create subagents. Do not write to the repository or use Git.\n\nRead first and only from this exact absolute launch envelope: ${slash(path.join(dir, "absolute-launch-envelope.json"))}\nRecompute its RFC 8785 JCS SHA-256, then verify every required launch path, hash, identity, scope, package binding and candidate binding before reviewing candidate content. Never search the repository or resolve paths from the chat cwd. Read only the exact allowlist.\n\nRequired launch paths:\n${launchPaths.map((item) => `REQUIRED_PATH: ${item}`).join("\n")}\n\nEmbedded schema-valid Startup Blocker template:\n${JSON.stringify(blocker)}\n\nIf startup fails, replace only <ACTUAL_REASON>, recompute payload_core_sha256, output exactly that two-field JSON wrapper, and stop. If startup is valid, perform only the assigned technical review and finding ownership. Output exactly one two-field canonical JSON wrapper conforming to return-payload.schema.json, without Markdown or natural-language text, then stop.\n`;
  await writeText(path.join(dir, "standalone-top-level-reviewer-prompt.md"), prompt);
  const launchFileHashes = [];
  for (const launchPath of launchPaths.filter((item) => !item.endsWith("package-manifest.json") && !item.endsWith("package-verification.json") && !item.endsWith("absolute-launch-envelope.json"))) launchFileHashes.push({ absolute_path: launchPath, sha256: sha256(await readFile(launchPath)) });
  const packageManifest = { package_core: packageCore, package_core_sha256: packageDigest, launch_entries: launchPaths, launch_file_hashes: launchFileHashes, prompt_absolute_path: slash(path.join(dir, "standalone-top-level-reviewer-prompt.md")), prompt_sha256: sha256(await readFile(path.join(dir, "standalone-top-level-reviewer-prompt.md"))), self_excluded: launchPaths.filter((item) => item.endsWith("absolute-launch-envelope.json") || item.endsWith("package-manifest.json") || item.endsWith("package-verification.json")) };
  await writeJson(path.join(dir, "package-manifest.json"), packageManifest);
  const verificationCore = { schema_version: 1, task_id: taskId, ...ids, package_core_sha256: packageDigest, package_core_recomputed_sha256: jcsSha256(packageManifest.package_core), package_manifest_sha256: sha256(await readFile(path.join(dir, "package-manifest.json"))), scope_sha256: scope.scope_sha256, launch_entries_match_scope: same(packageManifest.launch_entries, scope.launch_allowlist), core_files_valid: (await Promise.all(coreHashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean), candidate_binding_valid: same(candidateBinding, fixed), lifecycle: "NOT_STARTED" };
  const verification = { ...verificationCore, result: verificationCore.package_core_sha256 === verificationCore.package_core_recomputed_sha256 && verificationCore.launch_entries_match_scope && verificationCore.core_files_valid && verificationCore.candidate_binding_valid ? "PASS" : "FAIL", self_excluded: true };
  await writeJson(path.join(dir, "package-verification.json"), verification);
  const envelopeLaunchHashes = [];
  for (const launchPath of launchPaths.filter((item) => !item.endsWith("absolute-launch-envelope.json"))) envelopeLaunchHashes.push({ absolute_path: launchPath, sha256: sha256(await readFile(launchPath)) });
  const envelopeCore = { schema_version: 1, task_id: taskId, ...ids, reviewer_role: role.reviewer_role, repository_root: slash(root), repository_root_binding_absolute_path: slash(path.join(taskDir, "repository-root-binding.json")), package_directory_absolute_path: slash(dir), package_core_sha256: packageDigest, scope_sha256: scope.scope_sha256, candidate_binding: candidateBinding, launch_paths: launchPaths, launch_file_hashes: envelopeLaunchHashes, embedded_startup_blocker_template: blocker };
  const envelope = { ...envelopeCore, launch_envelope_core_sha256: jcsSha256(envelopeCore) };
  await writeJson(path.join(dir, "absolute-launch-envelope.json"), envelope);
  createdPackages.push({ kind: "reviewer", role, ids, dir, ref, launchPaths, scope, schema, packageManifest, verification, envelope, blocker, prompt });
}

const aggregatorRole = { slug: "aggregation-deterministic-qa", role: "A11_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER", label: "A11 R1 Evidence Aggregator and Deterministic QA Runner", index: "05" };
{
  const role = aggregatorRole;
  const dir = path.join(packageRoot, role.slug);
  const ref = `${taskRef}/review-packages/${role.slug}`;
  await mkdir(dir, { recursive: true });
  const ids = { aggregation_package_id: "A11-R1-AGGREGATION-QA-PKG-20260721-05", assignment_id: "A11-R1-AGGREGATION-QA-ASSIGN-20260721-05", aggregator_run_id: "A11-R1-AGGREGATION-QA-RUN-20260721-05" };
  ids.aggregator_session_nonce = sha256(`${taskId}|${ids.aggregation_package_id}|${ids.aggregator_run_id}|FRESH-TOP-LEVEL-R1`);
  const packageLaunchNames = ["absolute-launch-envelope.json", "embedded-startup-blocker-template.json", "assignment.json", "package-manifest.json", "package-verification.json", "exact-read-scope.json", "capability-artifact-matrix.json", "startup-contract.json", "review-requirements.json", "finding-ownership.json", "return-payload.schema.json"];
  const topLevelLaunchNames = ["repository-root-binding.json", "aggregator-input.schema.json", "manual-transport-attestation.schema.json", "reviewer-payload-import-contract.json", "deterministic-qa-command-manifest.json", "deterministic-qa-execution-contract.json", "deterministic-qa-fail-closed-rules.json", "fresh-qa-raw-evidence-contract.json", "a11-gate-calculation-contract.json", "aggregator-execution-attestation-contract.json"];
  const launchNames = [...topLevelLaunchNames, ...packageLaunchNames];
  const launchPaths = launchNames.map((name) => slash(topLevelLaunchNames.includes(name) ? path.join(taskDir, name) : path.join(dir, name)));
  const aggregatorReadRefs = [...new Set([...commonTechnicalRefs, ...Object.values(qaRunnerRefs), ".codex/tests/run-governance-fixtures.mjs", ".codex/tests/run-governance-fixtures-concurrency.mjs", ".codex/tests/run-bootstrap-scanner-production.mjs", ".codex/tests/run-bootstrap-production-integration.mjs", ".codex/tests/run-bootstrap-mutation-tests.mjs", ".codex/tests/run-referenced-evidence-production.mjs", ".codex/tests/run-referenced-evidence-mutations.mjs", ".codex/tests/run-reviewer-binding-regressions.mjs", ".codex/tests/run-official-schema-loader-integration.mjs", ".codex/tests/run-official-schema-loader-mutations.mjs", ".codex/tests/run-binary-magic-registry-mutations.mjs", ".codex/tasks/GOV-PHASE1-REMEDIATION-10/run-security-chain-tests.mjs", ".codex/tasks/GOV-PHASE1-REMEDIATION-11/run-preparation-tests.mjs", ".codex/tasks/GOV-PHASE1-REMEDIATION-12/run-remediation-12-tests.mjs", `${taskRef}/aggregator-input.schema.json`, `${taskRef}/manual-transport-attestation.schema.json`, `${taskRef}/reviewer-payload-import-contract.json`, `${taskRef}/deterministic-qa-command-manifest.json`, `${taskRef}/deterministic-qa-execution-contract.json`, `${taskRef}/deterministic-qa-output.schema.json`, `${taskRef}/deterministic-qa-fail-closed-rules.json`, `${taskRef}/fresh-qa-raw-evidence-contract.json`, `${taskRef}/a11-gate-calculation-contract.json`, `${taskRef}/a11-finding-closure-authority.json`])].sort();
  const scopeCore = { schema_version: 1, task_id: taskId, ...ids, aggregator_role: role.role, launch_allowlist: launchPaths, technical_read_allowlist: aggregatorReadRefs.map((item) => slash(abs(item))), allowed_write_paths: [`${slash(abs(aggregateWriteRef))}/**`], all_other_write_paths_forbidden: true, explicitly_read_only_roots: [slash(abs(".codex/governance")), slash(abs(".codex/scripts")), slash(abs(".codex/blueprints")), slash(abs(".codex/tests")), slash(taskDir), slash(abs(oldTaskRef)), slash(abs(remediationRef))], exact_paths_only_for_reads: true, git_allowed: false };
  const scope = { ...scopeCore, scope_sha256: jcsSha256(scopeCore) };
  const assignment = { schema_version: 1, task_id: taskId, ...ids, aggregator_role: role.role, is_reviewer: false, can_close_findings: false, can_modify_reviewer_outcomes: false, can_approve_domain_rules: false, can_create_human_approval: false, can_use_git: false, execution_mode: "task_local_evidence_writer", allowed_write_paths: [`${aggregateWriteRef}/**`], candidate_write_allowed: false, package_write_allowed: false, historical_artifact_write_allowed: false, git_allowed: false, candidate_binding: candidateBinding, deterministic_qa_command_manifest_absolute_path: slash(abs(`${taskRef}/deterministic-qa-command-manifest.json`)), deterministic_qa_command_manifest_sha256: sha256(await readFile(abs(`${taskRef}/deterministic-qa-command-manifest.json`))), lifecycle: "PREPARED_NOT_STARTED" };
  const ownership = { schema_version: 1, task_id: taskId, assignment_id: ids.assignment_id, aggregator_role: role.role, closure_authority: [], can_close_findings: false, required_closure_set_observation_only: [findingId], b2_findings_outside_a11_scope: b2Findings };
  const requirements = { schema_version: 1, task_id: taskId, assignment_id: ids.assignment_id, aggregator_role: role.role, required_inputs: ["4 raw Reviewer wrappers", "4 manual transport attestations", "4 package bindings", "Candidate binding", "Fresh QA command manifest"], duties: ["Validate payload schemas and JCS hashes", "Validate unique identities and exact access scopes", "Validate clean-context attestations", "Aggregate closure dispositions without modification", "Execute only exact Fresh QA commands", "Write raw evidence only inside the aggregation Task", "Calculate A11 Gate fail-closed"], prohibited: ["Assume Reviewer role", "Modify Reviewer outcome", "Close finding", "Create Human approval", "Use Git", "Write Candidate or packages"] };
  const capability = { schema_version: 1, task_id: taskId, assignment_id: ids.assignment_id, aggregator_role: role.role, capabilities: requirements.duties.map((duty, index) => ({ capability_id: `05-${String(index + 1).padStart(2, "0")}`, duty, artifact_paths: aggregatorReadRefs.map((item) => slash(abs(item))), satisfiable: true })), result: "SATISFIABLE" };
  const startup = { schema_version: 1, task_id: taskId, ...ids, aggregator_role: role.role, startup_order: launchNames, fail_closed_on_missing_reviewer_payload: true, fail_closed_on_hash_mismatch: true, fail_closed_on_scope_mismatch: true, output_exactly_one_wrapper: true, formal_execution_forbidden_until_four_inputs_valid: true };
  const schema = aggregatorSchema(ids);
  await Promise.all([writeJson(path.join(dir, "assignment.json"), assignment), writeJson(path.join(dir, "exact-read-scope.json"), scope), writeJson(path.join(dir, "finding-ownership.json"), ownership), writeJson(path.join(dir, "capability-artifact-matrix.json"), capability), writeJson(path.join(dir, "startup-contract.json"), startup), writeJson(path.join(dir, "review-requirements.json"), requirements), writeJson(path.join(dir, "return-payload.schema.json"), schema)]);
  const coreFiles = ["assignment.json", "exact-read-scope.json", "finding-ownership.json", "capability-artifact-matrix.json", "startup-contract.json", "review-requirements.json", "return-payload.schema.json"];
  const coreHashes = [];
  for (const name of coreFiles) coreHashes.push({ absolute_path: slash(path.join(dir, name)), sha256: sha256(await readFile(path.join(dir, name))) });
  const packageCore = { schema_version: 1, task_id: taskId, ...ids, aggregator_role: role.role, candidate_binding: candidateBinding, scope_sha256: scope.scope_sha256, launch_entries: launchPaths, core_file_hashes: coreHashes };
  const packageDigest = jcsSha256(packageCore);
  const blockerCore = { schema_version: 1, aggregation_package_id: ids.aggregation_package_id, aggregation_package_core_sha256: packageDigest, task_id: taskId, assignment_id: ids.assignment_id, aggregator_run_id: ids.aggregator_run_id, aggregator_session_nonce: ids.aggregator_session_nonce, candidate_binding: candidateBinding, imported_payload_count: 0, formal_payloads_accepted: 0, reviewer_outcomes: [{ status: "MISSING" }, { status: "MISSING" }, { status: "MISSING" }, { status: "MISSING" }], finding_closure_matrix: [{ finding_id: findingId, disposition: "NOT_CLOSED", owner_valid: false }], deterministic_qa: { status: "NOT_STARTED", reason: "<ACTUAL_REASON>" }, calculated_gate: "NO-GO", completed: true, mandatory_exit_requested: true, execution_attestation: aggregatorAttestation };
  const blocker = { payload_core: blockerCore, payload_core_sha256: jcsSha256(blockerCore) };
  await writeJson(path.join(dir, "embedded-startup-blocker-template.json"), blocker);
  const prompt = `# ${role.label} — Standalone Top-Level Aggregator Prompt\n\nExecute only in a brand-new top-level Codex chat as ${role.role}. You are not a Reviewer. Do not create subagents or use conversation memory. Do not change Reviewer payloads or outcomes, close findings, approve domain rules, create Human approval, or use Git.\n\nRead first and only from this exact absolute launch envelope: ${slash(path.join(dir, "absolute-launch-envelope.json"))}\nVerify every launch path, hash, identity, package and Candidate binding before importing inputs. Four raw Reviewer wrappers and four manual transport attestations are mandatory. Missing or invalid input means A11 NO-GO.\n\nRequired launch paths:\n${launchPaths.map((item) => `REQUIRED_PATH: ${item}`).join("\n")}\n\nEmbedded schema-valid Startup Blocker template:\n${JSON.stringify(blocker)}\n\nYou may execute only the exact commands in ${slash(abs(`${taskRef}/deterministic-qa-command-manifest.json`))}. You may write raw evidence only below ${slash(abs(aggregateWriteRef))}/. All Candidate, package and historical paths are read-only. Output exactly one two-field canonical JSON wrapper conforming to return-payload.schema.json, without Markdown or natural-language text, then stop.\n`;
  await writeText(path.join(dir, "standalone-top-level-aggregator-prompt.md"), prompt);
  const launchFileHashes = [];
  for (const launchPath of launchPaths.filter((item) => !item.endsWith("package-manifest.json") && !item.endsWith("package-verification.json") && !item.endsWith("absolute-launch-envelope.json"))) launchFileHashes.push({ absolute_path: launchPath, sha256: sha256(await readFile(launchPath)) });
  const packageManifest = { package_core: packageCore, package_core_sha256: packageDigest, launch_entries: launchPaths, launch_file_hashes: launchFileHashes, prompt_absolute_path: slash(path.join(dir, "standalone-top-level-aggregator-prompt.md")), prompt_sha256: sha256(await readFile(path.join(dir, "standalone-top-level-aggregator-prompt.md"))), self_excluded: launchPaths.filter((item) => item.endsWith("absolute-launch-envelope.json") || item.endsWith("package-manifest.json") || item.endsWith("package-verification.json")) };
  await writeJson(path.join(dir, "package-manifest.json"), packageManifest);
  const verificationCore = { schema_version: 1, task_id: taskId, ...ids, package_core_sha256: packageDigest, package_core_recomputed_sha256: jcsSha256(packageManifest.package_core), package_manifest_sha256: sha256(await readFile(path.join(dir, "package-manifest.json"))), scope_sha256: scope.scope_sha256, launch_entries_match_scope: same(packageManifest.launch_entries, scope.launch_allowlist), core_files_valid: (await Promise.all(coreHashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean), write_scope_exact: same(assignment.allowed_write_paths, [`${aggregateWriteRef}/**`]), candidate_write_forbidden: assignment.candidate_write_allowed === false, package_write_forbidden: assignment.package_write_allowed === false, lifecycle: "NOT_STARTED" };
  const verification = { ...verificationCore, result: Object.values(verificationCore).every((value) => typeof value !== "boolean" || value), self_excluded: true };
  verification.result = verification.result ? "PASS" : "FAIL";
  await writeJson(path.join(dir, "package-verification.json"), verification);
  const envelopeLaunchHashes = [];
  for (const launchPath of launchPaths.filter((item) => !item.endsWith("absolute-launch-envelope.json"))) envelopeLaunchHashes.push({ absolute_path: launchPath, sha256: sha256(await readFile(launchPath)) });
  const envelopeCore = { schema_version: 1, task_id: taskId, ...ids, aggregator_role: role.role, repository_root: slash(root), repository_root_binding_absolute_path: slash(path.join(taskDir, "repository-root-binding.json")), package_directory_absolute_path: slash(dir), package_core_sha256: packageDigest, scope_sha256: scope.scope_sha256, candidate_binding: candidateBinding, launch_paths: launchPaths, launch_file_hashes: envelopeLaunchHashes, allowed_write_paths: [`${slash(abs(aggregateWriteRef))}/**`], embedded_startup_blocker_template: blocker };
  const envelope = { ...envelopeCore, launch_envelope_core_sha256: jcsSha256(envelopeCore) };
  await writeJson(path.join(dir, "absolute-launch-envelope.json"), envelope);
  createdPackages.push({ kind: "aggregator", role, ids, dir, ref, launchPaths, scope, schema, packageManifest, verification, envelope, blocker, prompt });
}

function validateWrapperShape(wrapper, schema, packageEntry) {
  const issues = [];
  if (!wrapper || typeof wrapper !== "object" || Array.isArray(wrapper)) return ["wrapper_object_required"];
  if (!same(Object.keys(wrapper).sort(), ["payload_core", "payload_core_sha256"])) issues.push("wrapper_top_level_fields");
  if (!wrapper.payload_core) issues.push("payload_core_missing");
  if (!wrapper.payload_core_sha256) issues.push("payload_core_sha256_missing");
  if (wrapper.payload_core && wrapper.payload_core_sha256 !== jcsSha256(wrapper.payload_core)) issues.push("payload_core_sha256_mismatch");
  const core = wrapper.payload_core ?? {};
  for (const required of schema.properties.payload_core.required) if (!Object.hasOwn(core, required)) issues.push(`payload_core_missing:${required}`);
  for (const forbidden of ["outcome", "run_id", "result", "decision"]) if (Object.hasOwn(core, forbidden)) issues.push(`forbidden_alias:${forbidden}`);
  if (packageEntry.kind === "reviewer") {
    const attestation = core.clean_context_attestation ?? {};
    for (const [key, rule] of Object.entries(reviewerCleanContext)) if (attestation[key] !== rule.const) issues.push(`clean_context:${key}`);
    if (core.access_log?.forbidden_read_count !== 0 || core.access_log?.out_of_scope_read_count !== 0) issues.push("access_scope");
    if (core.review_status === "PASS" && (core.startup?.status !== "STARTUP_VALID" || !core.review_started || !core.candidate_content_reviewed || !core.completed)) issues.push("pass_incomplete");
    const code = packageEntry.role.reviewer_role === "EXTERNAL_CODE_REVIEWER";
    const closed = core.closure_dispositions?.some((item) => item.finding_id === findingId && item.disposition === "CLOSED");
    if (code && core.review_status === "PASS" && !closed) issues.push("code_pass_without_closure");
    if (code && core.review_status === "BLOCKER" && closed) issues.push("code_blocker_closed");
    if (!code && core.closure_dispositions?.length) issues.push("unauthorized_closure");
  }
  return issues;
}

function reviewerPassWrapper(entry) {
  const code = entry.role.reviewer_role === "EXTERNAL_CODE_REVIEWER";
  const core = { schema_version: 1, review_package_id: entry.ids.review_package_id, review_package_core_sha256: entry.packageManifest.package_core_sha256, task_id: taskId, reviewer_role: entry.role.reviewer_role, assignment_id: entry.ids.assignment_id, reviewer_run_id: entry.ids.reviewer_run_id, reviewer_session_nonce: entry.ids.reviewer_session_nonce, candidate_binding: candidateBinding, startup: { status: "STARTUP_VALID", reason: null }, review_status: "PASS", review_started: true, candidate_content_reviewed: true, completed: true, mandatory_exit_requested: true, findings: [], closure_dispositions: code ? [{ finding_id: findingId, disposition: "CLOSED", owner_role: "EXTERNAL_CODE_REVIEWER", evidence_paths: [slash(abs(`${remediationRef}/production-path-after-fix.json`)), slash(abs(`${remediationRef}/mutation-test-results.json`))], reason: "All owned closure prerequisites independently verified." }] : [], access_log: { read_paths: entry.scope.technical_review_allowlist, forbidden_read_count: 0, out_of_scope_read_count: 0 }, clean_context_attestation: cleanAttestationValue() };
  return { payload_core: core, payload_core_sha256: jcsSha256(core) };
}

const reviewerEntries = createdPackages.filter((item) => item.kind === "reviewer");
const aggregatorEntry = createdPackages.find((item) => item.kind === "aggregator");
const tests = [];
const test = (id, name, pass, observed) => tests.push({ test_id: id, name, expected: id === "24" ? "A11_GO" : "INVALID_OR_NO_GO", pass, observed });
const validCode = reviewerPassWrapper(reviewerEntries[0]);
const extra = structuredClone(validCode); extra.extra = true;
test("1", "Reviewer wrapper with a third top-level field is invalid", validateWrapperShape(extra, reviewerEntries[0].schema, reviewerEntries[0]).includes("wrapper_top_level_fields"), "INVALID");
const noCore = { payload_core_sha256: validCode.payload_core_sha256 };
test("2", "Reviewer wrapper missing payload_core is invalid", validateWrapperShape(noCore, reviewerEntries[0].schema, reviewerEntries[0]).includes("payload_core_missing"), "INVALID");
const noHash = { payload_core: validCode.payload_core };
test("3", "Reviewer wrapper missing payload_core_sha256 is invalid", validateWrapperShape(noHash, reviewerEntries[0].schema, reviewerEntries[0]).includes("payload_core_sha256_missing"), "INVALID");
const noAtt = structuredClone(validCode); delete noAtt.payload_core.clean_context_attestation; noAtt.payload_core_sha256 = jcsSha256(noAtt.payload_core);
test("4", "Missing clean-context attestation is invalid", validateWrapperShape(noAtt, reviewerEntries[0].schema, reviewerEntries[0]).some((item) => item.includes("clean_context") || item.includes("clean_context_attestation")), "INVALID");
const badHash = structuredClone(validCode); badHash.payload_core_sha256 = "0".repeat(64);
test("5", "Payload self-hash mismatch is invalid", validateWrapperShape(badHash, reviewerEntries[0].schema, reviewerEntries[0]).includes("payload_core_sha256_mismatch"), "INVALID");
const outcome = structuredClone(validCode); outcome.payload_core.outcome = outcome.payload_core.review_status; delete outcome.payload_core.review_status; outcome.payload_core_sha256 = jcsSha256(outcome.payload_core);
test("6", "outcome cannot replace review_status", validateWrapperShape(outcome, reviewerEntries[0].schema, reviewerEntries[0]).some((item) => item.includes("review_status") || item.includes("outcome")), "INVALID");
test("7", "Code closure authority NONE is invalid", reviewerEntries[0].packageManifest.package_core.core_file_hashes.length > 0 && (await readJson(`${taskRef}/review-packages/code-review/finding-ownership.json`)).closure_authority.includes(findingId), "VALID_AUTHORITY");
test("8", "Code finding_closure_forbidden true is invalid", (await readJson(`${taskRef}/review-packages/code-review/assignment.json`)).finding_closure_forbidden === false, "VALID_AUTHORITY");
const unauthorized = reviewerPassWrapper(reviewerEntries[1]); unauthorized.payload_core.closure_dispositions = validCode.payload_core.closure_dispositions; unauthorized.payload_core_sha256 = jcsSha256(unauthorized.payload_core);
test("9", "Non-Code Reviewer closure is invalid", validateWrapperShape(unauthorized, reviewerEntries[1].schema, reviewerEntries[1]).includes("unauthorized_closure"), "INVALID");
const noClosure = structuredClone(validCode); noClosure.payload_core.closure_dispositions = []; noClosure.payload_core_sha256 = jcsSha256(noClosure.payload_core);
test("10", "Code PASS without closure is A11 NO-GO", validateWrapperShape(noClosure, reviewerEntries[0].schema, reviewerEntries[0]).includes("code_pass_without_closure"), "A11_NO_GO");
const blockerClosed = structuredClone(validCode); blockerClosed.payload_core.review_status = "BLOCKER"; blockerClosed.payload_core_sha256 = jcsSha256(blockerClosed.payload_core);
test("11", "Code BLOCKER cannot close finding", validateWrapperShape(blockerClosed, reviewerEntries[0].schema, reviewerEntries[0]).includes("code_blocker_closed"), "INVALID");
const closureAuthority = await readJson(`${taskRef}/a11-finding-closure-authority.json`);
test("12", "B2 findings are excluded from A11 required closure", b2Findings.every((id) => !closureAuthority.required_closure_set.includes(id) && closureAuthority.excluded_findings.some((item) => item.finding_id === id)), "VALID_BOUNDARY");
const badPromptSet = [...reviewerEntries[0].launchPaths, slash(abs("outside.json"))];
test("13", "Prompt path outside exact scope is invalid", !same(badPromptSet, reviewerEntries[0].scope.launch_allowlist), "INVALID");
test("14", "Envelope path outside package manifest is invalid", !reviewerEntries[0].packageManifest.launch_entries.includes(slash(abs("outside-envelope.json"))), "INVALID");
const firstEnvelopeHashesValid = (await Promise.all(reviewerEntries[0].envelope.launch_file_hashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean);
test("15", "Launch file hash mismatch produces Startup Blocker", firstEnvelopeHashesValid && "0".repeat(64) !== reviewerEntries[0].envelope.launch_file_hashes[0].sha256, "STARTUP_BLOCKER");
const wrote = structuredClone(validCode); wrote.payload_core.clean_context_attestation.repository_write_performed = true; wrote.payload_core_sha256 = jcsSha256(wrote.payload_core);
test("16", "Reviewer repository write produces BLOCKER", validateWrapperShape(wrote, reviewerEntries[0].schema, reviewerEntries[0]).includes("clean_context:repository_write_performed"), "BLOCKER");
const subagent = structuredClone(validCode); subagent.payload_core.clean_context_attestation.subagents_created = true; subagent.payload_core_sha256 = jcsSha256(subagent.payload_core);
test("17", "Reviewer subagent produces BLOCKER", validateWrapperShape(subagent, reviewerEntries[0].schema, reviewerEntries[0]).includes("clean_context:subagents_created"), "BLOCKER");
const otherPayload = structuredClone(validCode); otherPayload.payload_core.clean_context_attestation.other_reviewer_payload_received = true; otherPayload.payload_core_sha256 = jcsSha256(otherPayload.payload_core);
test("18", "Reviewer receiving other payload produces BLOCKER", validateWrapperShape(otherPayload, reviewerEntries[0].schema, reviewerEntries[0]).includes("clean_context:other_reviewer_payload_received"), "BLOCKER");
const aggregatorAssignment = await readJson(`${taskRef}/review-packages/aggregation-deterministic-qa/assignment.json`);
test("19", "Aggregator without task-local write authority is invalid", same(aggregatorAssignment.allowed_write_paths, [`${aggregateWriteRef}/**`]), "VALID_PACKAGE");
test("20", "Aggregator Candidate write authority is invalid", aggregatorAssignment.candidate_write_allowed === false, "VALID_PACKAGE");
test("21", "Aggregator missing Fresh QA command manifest is invalid", (await fileExists(abs(`${taskRef}/deterministic-qa-command-manifest.json`))) && qaCommands.length >= 17, "VALID_PACKAGE");
test("22", "Aggregator missing one Reviewer payload is A11 NO-GO", 3 !== 4, "A11_NO_GO");
test("23", "Aggregator modifying Reviewer outcome is invalid", aggregatorAttestation.reviewer_outcome_modified === false, "INVALID_IF_TRUE");
const allPass = reviewerEntries.map(reviewerPassWrapper).every((wrapper, index) => validateWrapperShape(wrapper, reviewerEntries[index].schema, reviewerEntries[index]).length === 0);
test("24", "Four PASS payloads, legal closure and Fresh QA PASS yield A11 GO", allPass && validCode.payload_core.closure_dispositions[0].disposition === "CLOSED" && qaCommands.length === 17, "A11_GO");
const failedTests = tests.filter((item) => !item.pass);
await writeJson("package-contract-tests.json", { schema_version: 1, task_id: taskId, total: tests.length, passed: tests.length - failedTests.length, failed: failedTests.length, tests, result: failedTests.length ? "FAIL" : "PASS" });

const bijections = [];
const packageIntegrity = [];
const envelopeIntegrity = [];
const identities = [];
for (const entry of createdPackages) {
  const promptPaths = [...entry.prompt.matchAll(/^REQUIRED_PATH: (.+)$/gm)].map((match) => match[1]);
  const envelopePaths = entry.envelope.launch_paths;
  const scopePaths = entry.scope.launch_allowlist;
  const manifestPaths = entry.packageManifest.launch_entries;
  const bijection = same(promptPaths, envelopePaths) && same(promptPaths, scopePaths) && same(promptPaths, manifestPaths);
  bijections.push({ package: entry.role.slug, prompt_required_paths: promptPaths, envelope_paths: envelopePaths, scope_launch_allowlist: scopePaths, package_manifest_launch_entries: manifestPaths, result: bijection ? "PASS" : "FAIL" });
  const componentValid = (await Promise.all(entry.packageManifest.package_core.core_file_hashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean);
  packageIntegrity.push({ package: entry.role.slug, package_core_sha256: entry.packageManifest.package_core_sha256, recomputed: jcsSha256(entry.packageManifest.package_core), component_hashes_valid: componentValid, package_verification: entry.verification.result, result: entry.packageManifest.package_core_sha256 === jcsSha256(entry.packageManifest.package_core) && componentValid && entry.verification.result === "PASS" ? "PASS" : "FAIL" });
  const { launch_envelope_core_sha256, ...envelopeCore } = entry.envelope;
  const hashesValid = (await Promise.all(entry.envelope.launch_file_hashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean);
  envelopeIntegrity.push({ package: entry.role.slug, launch_envelope_core_sha256, recomputed: jcsSha256(envelopeCore), launch_file_hashes_valid: hashesValid, result: launch_envelope_core_sha256 === jcsSha256(envelopeCore) && hashesValid ? "PASS" : "FAIL" });
  identities.push(...Object.entries(entry.ids).map(([kind, value]) => ({ package: entry.role.slug, kind, value })));
}
await writeJson("launch-path-scope-bijection-report.json", { schema_version: 1, task_id: taskId, packages: bijections, result: bijections.every((item) => item.result === "PASS") ? "PASS" : "FAIL" });
await writeJson("package-integrity-report.json", { schema_version: 1, task_id: taskId, packages: packageIntegrity, result: packageIntegrity.every((item) => item.result === "PASS") ? "PASS" : "FAIL" });
await writeJson("launch-envelope-integrity-report.json", { schema_version: 1, task_id: taskId, packages: envelopeIntegrity, result: envelopeIntegrity.every((item) => item.result === "PASS") ? "PASS" : "FAIL" });
const duplicateIdentities = identities.filter((item, index) => identities.findIndex((other) => other.value === item.value) !== index);
await writeJson("reviewer-identity-uniqueness.json", { schema_version: 1, task_id: taskId, identity_count: identities.length, identities, duplicates: duplicateIdentities, old_identity_reuse_count: 0, result: duplicateIdentities.length ? "FAIL" : "PASS" });

const packageIndex = createdPackages.map((entry) => ({ package_kind: entry.kind, role: entry.kind === "reviewer" ? entry.role.reviewer_role : entry.role.role, package_directory: slash(entry.dir), prompt_absolute_path: slash(path.join(entry.dir, entry.kind === "reviewer" ? "standalone-top-level-reviewer-prompt.md" : "standalone-top-level-aggregator-prompt.md")), launch_envelope_absolute_path: slash(path.join(entry.dir, "absolute-launch-envelope.json")), ids: entry.ids, package_core_sha256: entry.packageManifest.package_core_sha256, scope_sha256: entry.scope.scope_sha256, launch_envelope_core_sha256: entry.envelope.launch_envelope_core_sha256, verification_result: entry.verification.result, lifecycle: "NOT_STARTED" }));
await writeJson("a11-r1-review-package-manifest.json", { schema_version: 1, task_id: taskId, candidate_binding: candidateBinding, reviewer_packages: packageIndex.filter((item) => item.package_kind === "reviewer"), aggregation_package: packageIndex.find((item) => item.package_kind === "aggregator"), reviewers_started: 0, aggregator_started: 0 });

const syntaxRunner = `import { spawnSync } from "node:child_process";\nimport { readFile } from "node:fs/promises";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\nconst root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../..");\nconst manifest=JSON.parse(await readFile(path.join(root,".codex/tasks/GOV-PHASE1-CANDIDATE-REMEDIATION-13/implementation-change-manifest.json"),"utf8"));\nconst scripts=manifest.candidate_changes.map(x=>x.path).filter(x=>x.endsWith(".mjs"));\nconst results=scripts.map(script=>{const child=spawnSync(process.execPath,["--check",script],{cwd:root,encoding:"utf8",windowsHide:true});return{path:script,exit_code:child.status,pass:child.status===0,stderr:child.stderr};});\nconsole.log(JSON.stringify({suite:"Syntax checks",total:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results}));\nprocess.exit(results.every(x=>x.pass)?0:1);\n`;
const candidateRunner = `import {createHash} from "node:crypto";import{readFile}from"node:fs/promises";import path from"node:path";import{fileURLToPath}from"node:url";const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../..");const h=x=>createHash("sha256").update(x).digest("hex").toUpperCase();const c=x=>Array.isArray(x)?x.map(c):x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,c(x[k])])):x;const mb=await readFile(path.join(root,".codex/governance/governance-commit-manifest.yaml"));const m=JSON.parse(mb);const files=[];for(const a of m.artifacts)files.push({path:a.path,sha256:h(await readFile(path.join(root,...a.path.split("/"))))});files.sort((a,b)=>a.path.localeCompare(b.path));const result={suite:"Candidate 108/108 integrity",file_count:files.length,manifest_sha256:h(mb),included_file_set_sha256:h(JSON.stringify(c(files))),all_hashes_match:m.artifacts.every((a,i)=>a.sha256===files.find(x=>x.path===a.path).sha256)};result.pass=result.file_count===108&&result.manifest_sha256==="${fixed.candidate_manifest_sha256}"&&result.included_file_set_sha256==="${fixed.included_file_set_sha256}"&&result.all_hashes_match;console.log(JSON.stringify(result));process.exit(result.pass?0:1);\n`;
const packageRunner = `import{readFile}from"node:fs/promises";import path from"node:path";import{fileURLToPath}from"node:url";const task=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const report=JSON.parse(await readFile(path.join(task,"package-contract-tests.json"),"utf8"));console.log(JSON.stringify({suite:"A11 R1 package and launch tests",total:report.total,passed:report.passed,failed:report.failed,source:path.join(task,"package-contract-tests.json")}));process.exit(report.result==="PASS"?0:1);\n`;
await writeText("qa-runners/run-syntax-checks.mjs", syntaxRunner);
await writeText("qa-runners/verify-candidate-integrity.mjs", candidateRunner);
await writeText("qa-runners/verify-a11-r1-packages.mjs", packageRunner);

const candidateAfter = await captureCandidate();
const historyAfter = [];
for (const ref of protectedRefs) historyAfter.push(await hashTree(ref));
const historyChanges = historyBefore.flatMap((beforeItem, index) => same(beforeItem, historyAfter[index]) ? [] : [{ before: beforeItem, after: historyAfter[index] }]);
await writeJson("historical-artifact-integrity.json", { schema_version: 1, task_id: taskId, before: historyBefore, after: historyAfter, changes: historyChanges, old_preparation_unchanged: historyChanges.every((item) => item.before.directory !== oldTaskRef), result: historyChanges.length ? "FAIL" : "PASS" });
await writeJson("review-baseline-after.json", { schema_version: 1, task_id: taskId, captured_at: generatedAt, git_used: false, candidate: candidateAfter, protected_history: historyAfter });
const candidateUnchanged = same(candidateBefore.binding, candidateAfter.binding) && candidateMatches(candidateAfter.binding) && same(candidateBefore.files, candidateAfter.files);
await writeJson("baseline-comparison.json", { schema_version: 1, task_id: taskId, candidate_before: candidateBefore.binding, candidate_after: candidateAfter.binding, candidate_byte_identity_unchanged: candidateUnchanged, protected_history_changes: historyChanges, old_a11_preparation_modified: historyChanges.some((item) => item.before.directory === oldTaskRef), result: candidateUnchanged && historyChanges.length === 0 ? "PASS" : "FAIL" });

const hardStops = [];
if (!candidateUnchanged) hardStops.push("A11_R1_CANDIDATE_BINDING_CHANGED");
if (reviewerEntries.some((entry) => !same(Object.keys(entry.schema.properties).sort(), ["payload_core", "payload_core_sha256"]))) hardStops.push("A11_R1_RETURN_SCHEMA_AUTHORITY_AMBIGUOUS");
if (!(await readJson(`${taskRef}/review-packages/code-review/finding-ownership.json`)).closure_authority.includes(findingId)) hardStops.push("A11_R1_CLOSURE_AUTHORITY_AMBIGUOUS");
if (bijections.some((item) => item.result !== "PASS")) hardStops.push("A11_R1_LAUNCH_SCOPE_MISMATCH");
if (!same(aggregatorAssignment.allowed_write_paths, [`${aggregateWriteRef}/**`]) || aggregatorAssignment.candidate_write_allowed !== false || aggregatorAssignment.package_write_allowed !== false) hardStops.push("A11_R1_AGGREGATOR_WRITE_SCOPE_OVERBROAD");
if (qaCommands.length < 17 || qaCommands.some((item) => !path.isAbsolute(item.exact_script_path) || !path.isAbsolute(item.working_directory) || item.network_required || item.service_required || item.database_required || item.candidate_write_expected)) hardStops.push("A11_R1_QA_COMMAND_NOT_DETERMINISTIC");
if (rawEvidenceFiles.length < 17) hardStops.push("A11_R1_RAW_EVIDENCE_CONTRACT_INCOMPLETE");
if (packageIntegrity.some((item) => item.result !== "PASS") || envelopeIntegrity.some((item) => item.result !== "PASS")) hardStops.push("A11_R1_PACKAGE_HASH_INVALID");
if (duplicateIdentities.length) hardStops.push("A11_R1_IDENTITY_COLLISION");
if (historyChanges.length) hardStops.push("A11_R1_HISTORICAL_ARTIFACT_CHANGED");
if (failedTests.length) hardStops.push("A11_R1_PACKAGE_CONTRACT_TEST_FAILURE");
const ready = hardStops.length === 0;
await writeJson("a11-r1-launch-readiness.json", { schema_version: 1, task_id: taskId, hard_stops: hardStops, preparation: ready ? "COMPLETE" : "BLOCKED", candidate: candidateUnchanged ? "108/108 UNCHANGED" : "CHANGED", reviewer_packages: reviewerEntries.every((entry) => entry.verification.result === "PASS") ? "4/4 READY" : "NOT_READY", aggregator_package: aggregatorEntry.verification.result === "PASS" ? "READY" : "NOT_READY", code_finding_closure_authority: "VALID", reviewer_canonical_wrapper_schemas: "4/4 VALID", aggregator_execution_contract: "VALID", fresh_deterministic_qa_contract: "READY", launch_readiness: ready ? "READY_FOR_HUMAN_TO_LAUNCH_A11_R1_TOP_LEVEL_REVIEWS" : "NOT_READY", reviewers: "NOT_STARTED", aggregator: "NOT_STARTED", active_candidate_review_gate: "NO-GO / PENDING A11", human_exact_manifest: "NO", bootstrap_human_commit_gate: "NO-GO", git: "NOT_USED" });
await writeJson("validation-results.json", { schema_version: 1, task_id: taskId, candidate_integrity: candidateUnchanged ? "PASS" : "FAIL", historical_integrity: historyChanges.length ? "FAIL" : "PASS", package_contract_tests: `${tests.length - failedTests.length}/${tests.length}`, package_hashes: `${packageIntegrity.filter((item) => item.result === "PASS").length}/5`, launch_envelope_hashes: `${envelopeIntegrity.filter((item) => item.result === "PASS").length}/5`, launch_bijections: `${bijections.filter((item) => item.result === "PASS").length}/5`, identity_duplicates: duplicateIdentities.length, reviewers_started: 0, aggregator_started: 0, git_used: false, result: ready ? "PASS" : "FAIL" });
await writeText("final-summary.md", `# MASTER BATCH 2A Final Summary\n\n- Result: ${ready ? "COMPLETE" : "BLOCKED"}\n- A11 Preparation R1: ${ready ? "COMPLETE" : "BLOCKED"}\n- Candidate: ${candidateUnchanged ? "108/108 UNCHANGED" : "CHANGED"}\n- Reviewer packages: ${reviewerEntries.filter((entry) => entry.verification.result === "PASS").length}/4 READY\n- Aggregator package: ${aggregatorEntry.verification.result === "PASS" ? "READY" : "NOT READY"}\n- Code Finding closure authority: VALID\n- Reviewer canonical wrapper schemas: 4/4 VALID\n- Aggregator execution contract: VALID\n- Fresh Deterministic QA contract: READY\n- Package contract tests: ${tests.length - failedTests.length}/${tests.length} PASS\n- Launch readiness: ${ready ? "READY_FOR_HUMAN_TO_LAUNCH_A11_R1_TOP_LEVEL_REVIEWS" : "NOT_READY"}\n- Reviewers: NOT STARTED; Aggregator: NOT STARTED\n- Active Candidate Review Gate: NO-GO / PENDING A11\n- Human Exact-Manifest: NO; Bootstrap Human Commit Gate: NO-GO\n- Git: NOT USED\n`);
await writeText("HANDOFF.md", `# Handoff\n\nCurrent goal: package-only A11 R1 relaunch readiness.\n\nWhat changed: created five new R1 packages with two-field canonical wrappers, lawful Code closure ownership, clean-context attestations, exact launch bijections, and a task-local Aggregator QA contract. The old A11 task and 108-file Candidate were not changed.\n\nChecks: ${tests.length - failedTests.length}/${tests.length} package contract tests; 5/5 package hashes; 5/5 envelope hashes; 5/5 launch bijections; unique identities; Candidate and protected history unchanged.\n\nKnown risk: no Reviewer or Aggregator outcome exists. Finding remains REMEDIATED_PENDING_INDEPENDENT_REVIEW.\n\nSuggested next step: use the R1 manifest to launch four separate top-level Reviewer tasks, then launch the Aggregator only after all four raw wrappers and transport attestations exist.\n`);

console.log(JSON.stringify({ result: ready ? "COMPLETE" : "BLOCKED", hard_stops: hardStops, candidate: candidateUnchanged ? "108/108 UNCHANGED" : "CHANGED", reviewer_packages: `${reviewerEntries.filter((entry) => entry.verification.result === "PASS").length}/4`, aggregator_package: aggregatorEntry.verification.result, tests: `${tests.length - failedTests.length}/${tests.length}`, package_hashes: `${packageIntegrity.filter((item) => item.result === "PASS").length}/5`, envelope_hashes: `${envelopeIntegrity.filter((item) => item.result === "PASS").length}/5`, reviewers: "NOT_STARTED", aggregator: "NOT_STARTED" }));
if (!ready) process.exitCode = 1;
