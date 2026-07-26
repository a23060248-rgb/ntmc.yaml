import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const tasksRoot = path.dirname(taskRoot);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(taskRoot, relativePath), "utf8"));
}

function sha256File(absolutePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex").toUpperCase();
}

function listFilesRecursive(root) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  }
  visit(root);
  return files;
}

function treeDigest(root) {
  const rows = listFilesRecursive(root)
    .map((absolutePath) => ({
      relative_path: path.relative(root, absolutePath).split(path.sep).join("/"),
      sha256: sha256File(absolutePath),
      bytes: fs.statSync(absolutePath).size,
    }))
    .sort((a, b) => (a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0));
  const canonical = rows.map((row) => `${row.relative_path}|${row.sha256}|${row.bytes}`).join("\n");
  return {
    file_count: rows.length,
    canonical_manifest_sha256: crypto.createHash("sha256").update(canonical, "utf8").digest("hex").toUpperCase(),
  };
}

const intent = readJson("task-intent.yaml");
const classification = readJson("classification.yaml");
const blueprint = readJson("blueprint.yaml");
const capability = readJson("runtime-capability/clean-room-runtime-capability-assessment.json");
const controls = readJson("runtime-capability/unavailable-controls.json");
const launch = readJson("runtime-capability/attempted-launch-disposition.json");
const retryPolicy = readJson("runtime-capability/repeated-retry-prohibition.json");
const baseline = readJson("runtime-capability/immutable-history-baseline.json");
const options = readJson("human-decision/review-path-options.json");
const pendingDecision = readJson("human-decision/decision-required.json");
const decisionSchema = readJson("human-decision/decision-schema.json");
const protocol = readJson("human-adjudicated-review-protocol.json");
const assurance = readJson("assurance-classification.json");
const findingSchema = readJson("finding-adjudication.schema.json");
const aggregator = readJson("aggregator-eligibility-boundary.json");
const architecture = readJson("architecture-reconciliation-boundary.json");

const tests = [];
function check(requirement, condition, details = null) {
  tests.push({ test_id: tests.length + 1, requirement, status: condition ? "PASS" : "FAIL", ...(details ? { details } : {}) });
}

function validateDecision(record) {
  const allowed = new Set([
    "STRICT_CLEAN_ROOM_REVIEW_REMAINS_REQUIRED",
    "APPROVE_HUMAN_ADJUDICATED_COMPATIBILITY_REVIEW_WITH_REDUCED_ASSURANCE",
  ]);
  if (record.decision_status === "PENDING") {
    return record.decision === null && record.decided_by_human === false && record.decision_timestamp === null &&
      record.human_rationale === null && record.next_authorized_action === "WAIT_FOR_HUMAN_DECISION";
  }
  if (record.decision_status !== "RECORDED" || !allowed.has(record.decision) || record.decided_by_human !== true ||
      typeof record.decision_timestamp !== "string" || typeof record.human_rationale !== "string" || record.human_rationale.length === 0) return false;
  const expectedAction = record.decision === "STRICT_CLEAN_ROOM_REVIEW_REMAINS_REQUIRED"
    ? "WAIT_FOR_VERIFIABLE_CLEAN_ROOM_RUNTIME"
    : "PREPARE_HUMAN_ADJUDICATED_COMPATIBILITY_REVIEW_PACKAGE";
  return record.next_authorized_action === expectedAction;
}

function validateAdjudication(record) {
  const required = [
    "finding_id", "technical_assessment", "exact_evidence_paths", "deterministic_validation_result",
    "human_decision", "human_rationale", "assurance_limitation_acknowledged", "decision_timestamp", "adopted_review_model",
  ];
  if (!required.every((key) => Object.hasOwn(record, key))) return false;
  if (!["COMPAT-R1-001", "COMPAT-R1-002"].includes(record.finding_id)) return false;
  if (record.technical_assessment?.assessor_role !== "NON_INDEPENDENT_TECHNICAL_ASSESSOR") return false;
  if (!["CLOSE", "DO_NOT_CLOSE"].includes(record.technical_assessment?.recommendation)) return false;
  if (typeof record.technical_assessment?.rationale !== "string" || record.technical_assessment.rationale.length === 0) return false;
  if (!Array.isArray(record.exact_evidence_paths) || record.exact_evidence_paths.length === 0 ||
      !record.exact_evidence_paths.every((value) => /^[A-Za-z]:\//.test(value))) return false;
  const result = record.deterministic_validation_result;
  if (result?.validator_role !== "EVIDENCE_AND_BINDING_VALIDATOR" || !["PASS", "FAIL"].includes(result?.status) ||
      !/^[A-Za-z]:\//.test(result?.report_absolute_path ?? "") || !/^[A-F0-9]{64}$/.test(result?.report_sha256 ?? "")) return false;
  if (!["HUMAN_CLOSED", "HUMAN_NOT_CLOSED"].includes(record.human_decision)) return false;
  if (typeof record.human_rationale !== "string" || record.human_rationale.length === 0) return false;
  if (record.assurance_limitation_acknowledged !== true) return false;
  if (typeof record.decision_timestamp !== "string" || Number.isNaN(Date.parse(record.decision_timestamp))) return false;
  return record.adopted_review_model === "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT";
}

check("Task ID and only allowed write scope are exact", intent.task_id === path.basename(taskRoot) && intent.allowed_write_paths.length === 1 && intent.allowed_write_paths[0] === `.codex/tasks/${path.basename(taskRoot)}/**`);
check("Task is classified L3", classification.level === "L3");
check("L3 scope is Human-authorized", classification.classification_status === "HUMAN_SCOPE_APPROVED" && classification.human_approval.scope_approval === "APPROVED_IN_CURRENT_HUMAN_INSTRUCTION");
check("No review assignment or launch exists in blueprint", blueprint.review_assignments.length === 0 && blueprint.reviewer_launch_status === "NOT_AUTHORIZED_BY_THIS_TASK");
check("No subagent execution is configured", blueprint.execution_mode === "ROOT_ORCHESTRATOR_SEQUENTIAL_NO_SUBAGENTS");
check("Runtime assessment is fail-closed", capability.assessment_status === "CLEAN_ROOM_RUNTIME_NOT_AVAILABLE" && capability.disposition === "HARD_STOP_BEFORE_REVIEWER_TASK_CREATION");
check("Runtime blocker is not classified as a Reviewer outcome", capability.reviewer_outcome === "NOT_APPLICABLE_REVIEWER_NOT_STARTED" && launch.failure_classification === "RUNTIME_CAPABILITY_BLOCKER_NOT_REVIEWER_FINDING");
check("All unavailable launch controls are blocking", controls.required_controls.length === 5 && controls.required_controls.every((control) => control.launch_blocking === true));
check("Memory control is unavailable or unverifiable", capability.assessment_basis.memory_disable_control_exposed === false);
check("Automatic Git control is unavailable or unverifiable", capability.assessment_basis.git_automatic_check_disable_control_exposed === false);
check("Automatic Repository read control is unavailable or unverifiable", capability.assessment_basis.automatic_repository_read_disable_control_exposed === false);
check("AGENTS and HANDOFF preload control is unavailable or unverifiable", capability.assessment_basis.agents_handoff_preload_disable_control_exposed === false);
check("Reviewer first message was not sent", launch.reviewer_first_message_sent === false);
check("Retry Reviewer Task was not created", launch.retry_reviewer_task_created === false);
check("Attempted launch used neither Git nor repository writes", launch.git_used_during_launch_attempt === false && launch.repository_write_count_during_launch_attempt === 0);
check("Retry 01 is ready but not launchable", capability.compatibility_r2_retry_01 === "READY_BUT_NOT_LAUNCHABLE" && launch.retry_package_disposition === "PRESERVED_READY_BUT_NOT_LAUNCHABLE");
check("Repeated retry prohibition is active", retryPolicy.status === "ACTIVE" && retryPolicy.prohibition === "PROHIBITED_UNTIL_RUNTIME_CAPABILITY_CHANGES");
check("Repeated retry requires verifiable capability change and Human reauthorization", retryPolicy.release_condition.required === "VERIFIABLE_RUNTIME_CAPABILITY_CHANGE" && retryPolicy.release_condition.human_reauthorization_required === true && retryPolicy.automatic_release === false);
check("Human decision is pending", pendingDecision.decision_status === "PENDING" && pendingDecision.decision === null && pendingDecision.decided_by_human === false);
check("Pending decision next action is wait", pendingDecision.next_authorized_action === "WAIT_FOR_HUMAN_DECISION");
check("Exactly two Human decision options exist", options.allowed_options.length === 2 && new Set(options.allowed_options.map((option) => option.decision)).size === 2);
check("No default Human path is selected", options.default_option === null && options.codex_may_select === false);
check("Strict path preserves pause and NO-GO", options.allowed_options[0].decision === "STRICT_CLEAN_ROOM_REVIEW_REMAINS_REQUIRED" && options.allowed_options[0].compatibility_review_status === "PAUSED_RUNTIME_UNAVAILABLE" && options.allowed_options[0].source_scope_review_gate === "NO-GO");
check("Reduced-assurance path uses exact formal model", options.allowed_options[1].decision === "APPROVE_HUMAN_ADJUDICATED_COMPATIBILITY_REVIEW_WITH_REDUCED_ASSURANCE" && options.allowed_options[1].review_model === "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT");
check("Pending decision validates", validateDecision(pendingDecision));
check("Decision schema contains only the two allowed non-null decisions", JSON.stringify(decisionSchema.properties.decision.enum) === JSON.stringify([null, "STRICT_CLEAN_ROOM_REVIEW_REMAINS_REQUIRED", "APPROVE_HUMAN_ADJUDICATED_COMPATIBILITY_REVIEW_WITH_REDUCED_ASSURANCE"]));
check("Human-adjudicated protocol is prepared but inactive", protocol.protocol_status === "PREPARED_NOT_ACTIVATED" && protocol.current_human_decision === "PENDING");
check("No Human-adjudicated package exists before decision", !fs.existsSync(path.join(taskRoot, "human-adjudicated-review-package")));
check("Protocol formal name is exact", protocol.formal_name === "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT");
check("Protocol roles are separated", JSON.stringify(protocol.roles.map((role) => role.formal_role)) === JSON.stringify(["NON_INDEPENDENT_TECHNICAL_ASSESSOR", "EVIDENCE_AND_BINDING_VALIDATOR", "FINAL_FINDING_ADJUDICATOR"]));
check("Codex may recommend but may not close Findings", protocol.technical_recommendation_values.includes("CLOSE") && protocol.technical_assessor_prohibited_actions.includes("close_finding"));
check("Only COMPAT-R1-001 and COMPAT-R1-002 are in adjudication scope", JSON.stringify(protocol.finding_scope) === JSON.stringify(["COMPAT-R1-001", "COMPAT-R1-002"]));
check("Finding adjudication schema requires all Human decision fields", protocol.human_decision_required_fields.every((field) => findingSchema.required.includes(field)));
check("Finding adjudication schema requires Human assurance acknowledgement", findingSchema.properties.assurance_limitation_acknowledged.const === true);
check("Current assurance states no completed review", assurance.current_assurance.classification === "NO_COMPATIBILITY_REVIEW_COMPLETED" && assurance.current_assurance.clean_room_review_completed === false && assurance.current_assurance.human_adjudicated_review_completed === false);
check("Reduced assurance cannot claim independence or clean room", assurance.human_adjudicated_path.independent === false && assurance.human_adjudicated_path.clean_room === false && assurance.human_adjudicated_path.l3_independent_review_equivalent === false);
check("Maximum reduced-assurance gate label is exact", assurance.human_adjudicated_path.maximum_gate_label_after_valid_human_closure_of_both_findings === "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE");
check("Aggregator remains unauthorized", aggregator.current_aggregator_status === "NOT_AUTHORIZED" && aggregator.authorization_from_this_task === false && aggregator.launch_from_this_task === false);
check("Existing Aggregator cannot silently accept Human-adjudicated evidence", aggregator.both_findings_human_closure_automatically_authorizes_existing_aggregator_retry_01 === false && aggregator.minimum_future_prerequisites_for_any_human_adjudicated_aggregator_path.includes("aggregator_input_contract_is_explicitly_remediated_for_human_adjudicated_evidence"));
check("Architecture Reconciliation remains unauthorized", architecture.current_status === "NOT_AUTHORIZED" && architecture.human_closure_of_both_findings_authorizes === false);
check("Source Authority remains proposed and unused downstream", architecture.source_authority === "PROPOSED_NOT_ADOPTED" && architecture.downstream_policy_use === false);
check("Both Compatibility Findings remain pending R2", intent.fixed_state.compat_r1_001 === "REMEDIATED_PENDING_COMPATIBILITY_R2" && intent.fixed_state.compat_r1_002 === "REMEDIATED_PENDING_COMPATIBILITY_R2");
check("Review Gate remains NO-GO", intent.fixed_state.source_scope_review_gate === "NO-GO" && pendingDecision.source_scope_review_gate === "NO-GO");

const validDecisionFixture = {
  decision_status: "RECORDED",
  decision: "STRICT_CLEAN_ROOM_REVIEW_REMAINS_REQUIRED",
  decided_by_human: true,
  decision_timestamp: "2026-07-22T20:00:00+08:00",
  human_rationale: "Synthetic positive contract fixture only.",
  next_authorized_action: "WAIT_FOR_VERIFIABLE_CLEAN_ROOM_RUNTIME",
};
check("Synthetic positive strict-path decision fixture is accepted", validateDecision(validDecisionFixture));
check("Negative unknown decision is rejected", !validateDecision({ ...validDecisionFixture, decision: "RETRY_ANYWAY" }));
check("Negative pending decision with a selection is rejected", !validateDecision({ ...pendingDecision, decision: "STRICT_CLEAN_ROOM_REVIEW_REMAINS_REQUIRED" }));
check("Negative recorded decision without Human attribution is rejected", !validateDecision({ ...validDecisionFixture, decided_by_human: false }));
check("Negative recorded decision without rationale is rejected", !validateDecision({ ...validDecisionFixture, human_rationale: "" }));

const validAdjudicationFixture = {
  finding_id: "COMPAT-R1-001",
  technical_assessment: {
    assessor_role: "NON_INDEPENDENT_TECHNICAL_ASSESSOR",
    recommendation: "CLOSE",
    rationale: "Synthetic positive schema fixture only; not a Finding decision.",
  },
  exact_evidence_paths: ["C:/synthetic/evidence.json"],
  deterministic_validation_result: {
    validator_role: "EVIDENCE_AND_BINDING_VALIDATOR",
    status: "PASS",
    report_absolute_path: "C:/synthetic/validation.json",
    report_sha256: "A".repeat(64),
  },
  human_decision: "HUMAN_CLOSED",
  human_rationale: "Synthetic positive schema fixture only; not adopted.",
  assurance_limitation_acknowledged: true,
  decision_timestamp: "2026-07-22T20:00:00+08:00",
  adopted_review_model: "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT",
};
check("Synthetic positive finding adjudication fixture is accepted", validateAdjudication(validAdjudicationFixture));
check("Negative invalid Finding ID is rejected", !validateAdjudication({ ...validAdjudicationFixture, finding_id: "COMPAT-R1-003" }));
check("Negative missing Human rationale is rejected", !validateAdjudication({ ...validAdjudicationFixture, human_rationale: "" }));
check("Negative unacknowledged reduced assurance is rejected", !validateAdjudication({ ...validAdjudicationFixture, assurance_limitation_acknowledged: false }));
check("Negative non-absolute evidence path is rejected", !validateAdjudication({ ...validAdjudicationFixture, exact_evidence_paths: ["relative/evidence.json"] }));
check("Negative independent assessor role is rejected", !validateAdjudication({ ...validAdjudicationFixture, technical_assessment: { ...validAdjudicationFixture.technical_assessment, assessor_role: "INDEPENDENT_REVIEWER" } }));

const protectedResults = baseline.protected_trees.map((entry) => {
  const actual = treeDigest(entry.absolute_root);
  return {
    artifact_id: entry.artifact_id,
    expected_file_count: entry.file_count,
    actual_file_count: actual.file_count,
    expected_manifest_sha256: entry.canonical_manifest_sha256,
    actual_manifest_sha256: actual.canonical_manifest_sha256,
    match: entry.file_count === actual.file_count && entry.canonical_manifest_sha256 === actual.canonical_manifest_sha256,
  };
});
check("All protected Retry and history trees remain byte-identical", protectedResults.every((result) => result.match), protectedResults);
const rawPath = baseline.attempt_1_raw_wrapper.absolute_path;
check("Attempt 1 raw wrapper remains byte-identical", sha256File(rawPath) === baseline.attempt_1_raw_wrapper.sha256 && fs.statSync(rawPath).size === baseline.attempt_1_raw_wrapper.bytes);
const governanceResults = baseline.governance_baseline.map((entry) => {
  const absolutePath = path.join(productRoot, ...entry.relative_path.split("/"));
  return {
    relative_path: entry.relative_path,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});
check("Product governance baseline remains unchanged", governanceResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), governanceResults);
check("No Git-dependent evidence is claimed", baseline.git_used === false && launch.git_used_during_launch_attempt === false);
check("Reviewer, Aggregator, and Architecture Reconciliation remain unlaunched", launch.reviewer_started === false && launch.aggregator_launched === false && launch.architecture_reconciliation_started === false);

const passCount = tests.filter((test) => test.status === "PASS").length;
const failCount = tests.length - passCount;
const output = {
  schema_version: 1,
  task_id: path.basename(taskRoot),
  validator: "TASK_LOCAL_DETERMINISTIC_PROTOCOL_VALIDATOR",
  validator_scope: "STRUCTURAL_CONTRACT_POSITIVE_NEGATIVE_AND_EXACT_PROTECTED_HASH_VALIDATION",
  test_count: tests.length,
  pass_count: passCount,
  fail_count: failCount,
  overall_status: failCount === 0 ? `PASS_${passCount}_OF_${tests.length}` : "FAIL",
  tests,
  protected_artifact_results: protectedResults,
  governance_baseline_results: governanceResults,
  git_used: false,
  reviewer_launched: false,
  aggregator_launched: false,
  architecture_reconciliation_started: false,
};

console.log(JSON.stringify(output, null, 2));
if (failCount > 0) process.exitCode = 1;
