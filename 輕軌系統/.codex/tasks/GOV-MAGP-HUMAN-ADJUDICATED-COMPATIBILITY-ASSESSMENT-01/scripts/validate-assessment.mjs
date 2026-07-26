import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const tasksRoot = path.dirname(taskRoot);

const taskIds = {
  base: "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01",
  prep: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
  remediation: "GOV-MAGP-SOURCE-SCOPE-REVIEW-INTAKE-AND-COMPATIBILITY-REMEDIATION-02",
  attempt: "GOV-MAGP-COMPATIBILITY-R2-STARTUP-BLOCKER-INTAKE-AND-RETRY-PREPARATION-01",
  schema: "GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01",
  runtime: "GOV-MAGP-COMPATIBILITY-R2-RUNTIME-CAPABILITY-AND-HUMAN-ADJUDICATION-PREPARATION-01",
};

const roots = Object.fromEntries(Object.entries(taskIds).map(([key, id]) => [key, path.join(tasksRoot, id)]));

function readJson(absoluteOrRelativePath, base = taskRoot) {
  const absolutePath = path.isAbsolute(absoluteOrRelativePath) ? absoluteOrRelativePath : path.join(base, absoluteOrRelativePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
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
const pathDecision = readJson("human-decision/review-path-decision.json");
const assuranceAck = readJson("human-decision/assurance-acknowledgement.json");
const authorityBoundary = readJson("human-decision/decision-authority-boundary.json");
const assurance = readJson("assurance/assurance-classification.json");
const independenceGap = readJson("assurance/independence-gap.json");
const disclosure = readJson("assurance/downstream-disclosure-requirements.json");
const baseIntegrity = readJson("integrity-validation/base-target-integrity.json");
const sourceIntegrity = readJson("integrity-validation/source-root-integrity.json");
const authorityIntegrity = readJson("integrity-validation/authority-policy-integrity.json");
const contaminationIntegrity = readJson("integrity-validation/contamination-policy-integrity.json");
const overlayIntegrity = readJson("integrity-validation/corrective-overlay-integrity.json");
const historyIntegrity = readJson("integrity-validation/historical-artifact-integrity.json");
const governanceIntegrity = readJson("integrity-validation/product-governance-integrity.json");
const effectiveState = readJson("deterministic-validation/effective-state-validation.json");
const downstreamValidation = readJson("deterministic-validation/downstream-authority-validation.json");
const architectureValidation = readJson("deterministic-validation/architecture-authorization-validation.json");
const finding001Validation = readJson("deterministic-validation/finding-001-validation.json");
const finding002Validation = readJson("deterministic-validation/finding-002-validation.json");
const validationSummary = readJson("deterministic-validation/validation-summary.json");
const assessment001 = readJson("technical-assessment/compat-r1-001-assessment.json");
const assessment002 = readJson("technical-assessment/compat-r1-002-assessment.json");
const recommendationSummary = readJson("recommendation-summary.json");
const findingStatus = readJson("finding-current-status.json");
const aggregatorBoundary = readJson("aggregator-eligibility-boundary.json");
const architectureBoundary = readJson("architecture-reconciliation-boundary.json");
const decisionInput001 = readJson("human-adjudication-package/finding-001-decision-input.json");
const decisionInput002 = readJson("human-adjudication-package/finding-002-decision-input.json");
const decisionForm = readJson("human-adjudication-package/human-decision-form.json");

const reviewTargetManifest = readJson(path.join(roots.prep, "review-target-manifest.json"));
const sourceInventory = readJson(path.join(roots.base, "source-directory-inventory.json"));
const sourceRegister = readJson(path.join(roots.base, "source-scope-register.yaml"));
const sourceIdentity = readJson(path.join(roots.base, "source-identity-resolution.json"));
const correctionRecord = readJson(path.join(roots.remediation, "compatibility-remediation", "correction-integrity-record.json"));
const sourceAuthorityEffective = readJson(path.join(roots.remediation, "compatibility-remediation", "source-authority-effective-state.json"));
const scopeCorrection = readJson(path.join(roots.remediation, "compatibility-remediation", "source-scope-status-correction.json"));
const architectureState = readJson(path.join(roots.remediation, "compatibility-remediation", "architecture-reconciliation-authorization-state.json"));
const downstreamProhibition = readJson(path.join(roots.remediation, "compatibility-remediation", "downstream-policy-consumption-prohibition.yaml"));
const prematureDisposition = readJson(path.join(roots.remediation, "compatibility-remediation", "original-premature-statements-disposition.json"));

const tests = [];
function check(requirement, condition, details = null) {
  tests.push({ test_id: tests.length + 1, requirement, status: condition ? "PASS" : "FAIL", ...(details ? { details } : {}) });
}

const baseResults = reviewTargetManifest.artifacts.map((entry) => {
  const absolutePath = path.join(roots.base, ...entry.normalized_relative_path.split("/"));
  return {
    relative_path: entry.normalized_relative_path,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.file_size_bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const sourceRoot = sourceInventory.source_root;
const topLevelSourceFiles = fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isFile());
const sourceResults = sourceInventory.files.map((entry) => {
  const absolutePath = entry.absolute_path;
  return {
    actual_filename: entry.actual_filename,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.file_size_bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const normalizedClassCounts = { CORE_INCLUDED: 0, OPTIONAL_PATTERN_ONLY: 0, EXCLUDED: 0 };
for (const source of sourceRegister.sources) {
  if (source.classification === "CORE_INCLUDED") normalizedClassCounts.CORE_INCLUDED++;
  else if (source.classification === "OPTIONAL_PATTERN_ONLY") normalizedClassCounts.OPTIONAL_PATTERN_ONLY++;
  else if (source.classification.startsWith("EXCLUDE")) normalizedClassCounts.EXCLUDED++;
}

const overlayRoot = path.join(roots.remediation, "compatibility-remediation");
const overlayResults = correctionRecord.record_core.corrective_overlay_artifacts.map((entry) => {
  const absolutePath = path.join(overlayRoot, entry.normalized_relative_path);
  return {
    relative_path: entry.normalized_relative_path,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.file_size_bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const historicalResults = historyIntegrity.historical_tasks.map((entry) => {
  const key = Object.entries(taskIds).find(([, id]) => id === entry.task_id)?.[0];
  const actual = treeDigest(roots[key]);
  return {
    task_id: entry.task_id,
    expected_file_count: entry.file_count,
    actual_file_count: actual.file_count,
    expected_manifest_sha256: entry.manifest_sha256_before,
    actual_manifest_sha256: actual.canonical_manifest_sha256,
    match: entry.file_count === actual.file_count && entry.manifest_sha256_before === actual.canonical_manifest_sha256,
  };
});

const governanceResults = governanceIntegrity.files.map((entry) => {
  const absolutePath = path.join(productRoot, ...entry.relative_path.split("/"));
  return {
    relative_path: entry.relative_path,
    expected_sha256: entry.sha256_before,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.bytes_before,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

function validateHumanDecisionForm(form) {
  if (form.review_model !== "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT" || form.assurance_level !== "REDUCED_ASSURANCE") return false;
  if (!Array.isArray(form.decisions) || form.decisions.length !== 2) return false;
  if (new Set(form.decisions.map((decision) => decision.finding_id)).size !== 2) return false;
  if (!form.decisions.every((decision) => ["COMPAT-R1-001", "COMPAT-R1-002"].includes(decision.finding_id))) return false;
  if (form.codex_filled_human_decision_count !== 0 || form.codex_filled_human_rationale_count !== 0) return false;
  if (form.submission_status === "PENDING_HUMAN_DECISION") {
    return form.decisions.every((decision) => decision.human_decision === "PENDING_HUMAN_DECISION" && decision.human_rationale === null &&
      decision.assurance_limitation_acknowledged === null && decision.decision_timestamp === null);
  }
  if (form.submission_status !== "SUBMITTED_BY_HUMAN") return false;
  return form.decisions.every((decision) => ["HUMAN_CLOSED", "HUMAN_NOT_CLOSED"].includes(decision.human_decision) &&
    typeof decision.human_rationale === "string" && decision.human_rationale.length > 0 &&
    decision.assurance_limitation_acknowledged === true && typeof decision.decision_timestamp === "string" && !Number.isNaN(Date.parse(decision.decision_timestamp)));
}

function recommendationContract(validation, assessment) {
  if (assessment.finding_closed_by_codex !== false) return false;
  if (validation.validation_result === "VALIDATION_PASS") return ["RECOMMEND_HUMAN_CLOSE", "RECOMMEND_HUMAN_DO_NOT_CLOSE"].includes(assessment.technical_recommendation);
  return assessment.technical_recommendation === "RECOMMEND_HUMAN_DO_NOT_CLOSE";
}

function safeDownstreamBoundary(aggregator, architecture) {
  return aggregator.current_status === "NOT_AUTHORIZED" && aggregator.authorization_from_this_task === false && aggregator.launch_from_this_task === false &&
    architecture.current_status === "NOT_AUTHORIZED" && architecture.started === false;
}

check("Human path decision is APPROVED", pathDecision.decision_status === "APPROVED" && pathDecision.decision === "APPROVE_HUMAN_ADJUDICATED_COMPATIBILITY_REVIEW_WITH_REDUCED_ASSURANCE");
check("Adopted review model name is exact", pathDecision.adopted_review_model === "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT");
check("Clean-Room review completed is false", intent.completion_flags.clean_room_review_completed === false && assurance.clean_room_review_completed === false);
check("Reduced assurance is true", intent.completion_flags.reduced_assurance === true && assurance.reduced_assurance === true);
check("Codex Finding closure authority is NONE", pathDecision.codex_finding_closure_authority === "NONE" && authorityBoundary.codex_authority.close_finding === false);
check("Base Target 20/20 unchanged", baseResults.length === 20 && baseResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), baseResults);
check("Source root 11/11 unchanged", topLevelSourceFiles.length === 11 && sourceResults.length === 11 && sourceResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), sourceResults);
check("Source identities 11/11 remain resolved", sourceIdentity.actual_source_count === 11 && sourceIdentity.uniquely_verified_count === 11 && sourceIdentity.failed_count === 0);
check("Source classification 4/1/6 unchanged", normalizedClassCounts.CORE_INCLUDED === 4 && normalizedClassCounts.OPTIONAL_PATTERN_ONLY === 1 && normalizedClassCounts.EXCLUDED === 6);
check("Source Authority Policy unchanged", sha256File(path.join(roots.base, "source-authority-policy.yaml")) === authorityIntegrity.source_authority_policy.expected_sha256);
check("Claim Eligibility Policy unchanged", sha256File(path.join(roots.base, "source-claim-eligibility-policy.yaml")) === authorityIntegrity.source_claim_eligibility_policy.expected_sha256);
check("VET-C contamination policy unchanged", sha256File(path.join(roots.base, "vetc-contamination-prevention-policy.yaml")) === contaminationIntegrity.vetc_contamination_policy.expected_sha256);
check("Health contamination policy unchanged", sha256File(path.join(roots.base, "health-domain-contamination-prevention-policy.yaml")) === contaminationIntegrity.health_domain_contamination_policy.expected_sha256);
check("Corrective Overlay 7/7 unchanged", overlayResults.length === 7 && overlayResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), overlayResults);
check("Named historical Tasks unchanged", historicalResults.every((entry) => entry.match), historicalResults);
check("Product and Governance baseline unchanged", governanceResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), governanceResults);
check("COMPAT-R1-001 effective state is verifiable", sourceAuthorityEffective.source_authority_status === "PROPOSED_NOT_ADOPTED" && scopeCorrection.source_scope_lock_review_gate === "PENDING");
check("COMPAT-R1-002 effective state is verifiable", architectureState.architecture_reconciliation_status === "NOT_AUTHORIZED" && architectureState.core_object_library_status === "NOT_AUTHORIZED");
check("Downstream policy use is false", downstreamProhibition.downstream_policy_use_allowed === false && effectiveState.effective_state.downstream_policy_use_allowed === false);
check("Source Authority is PROPOSED_NOT_ADOPTED", effectiveState.effective_state.source_authority_status === "PROPOSED_NOT_ADOPTED");
check("Architecture Reconciliation is NOT_AUTHORIZED", architectureBoundary.current_status === "NOT_AUTHORIZED" && architectureValidation.current_state.architecture_reconciliation_status === "NOT_AUTHORIZED");
check("Architecture Reconciliation has not started", architectureBoundary.started === false && architectureValidation.current_state.architecture_reconciliation_started === false);
check("Human Finding decisions remain pending", findingStatus.findings.every((finding) => finding.current_status === "PENDING_HUMAN_ADJUDICATION" && finding.human_decision === "PENDING_HUMAN_DECISION" && finding.closed === false));
check("Aggregator is not authorized", aggregatorBoundary.current_status === "NOT_AUTHORIZED" && aggregatorBoundary.authorization_from_this_task === false);
check("Git was not used", baseIntegrity.git_used === false && sourceIntegrity.git_used === false && overlayIntegrity.git_used === false && historyIntegrity.git_used === false && governanceIntegrity.git_used === false);
check("Source Scope Lock remains complete while current gate is NO-GO", effectiveState.effective_state.source_scope_lock_status === "COMPLETE" && effectiveState.effective_state.current_source_scope_review_gate === "NO-GO");
check("Human Source Scope adoption is NOT_STARTED", effectiveState.effective_state.human_source_scope_adoption_status === "NOT_STARTED");
check("Historical premature wording has no authority effect", prematureDisposition.disposition === "HISTORICAL_PREMATURE_DIRECTION" && prematureDisposition.downstream_authorization_effect === "NONE");
check("Corrective Overlay binds the exact frozen target", correctionRecord.record_core.base_target_binding.review_target_manifest_sha256 === "C156854BA326194C5E26FB05C69849DC81784FC33E5713340D1E06DF0FF5F3D4");
check("COMPAT-R1-001 deterministic validation passed", finding001Validation.validation_result === "VALIDATION_PASS" && finding001Validation.fail_count === 0 && finding001Validation.insufficient_evidence_count === 0);
check("COMPAT-R1-002 deterministic validation passed", finding002Validation.validation_result === "VALIDATION_PASS" && finding002Validation.fail_count === 0 && finding002Validation.insufficient_evidence_count === 0);
check("COMPAT-R1-001 recommendation contract is valid", recommendationContract(finding001Validation, assessment001) && assessment001.technical_recommendation === "RECOMMEND_HUMAN_CLOSE");
check("COMPAT-R1-002 recommendation contract is valid", recommendationContract(finding002Validation, assessment002) && assessment002.technical_recommendation === "RECOMMEND_HUMAN_CLOSE");
check("COMPAT-R1-001 is not closed by Codex", assessment001.finding_closed_by_codex === false && assessment001.final_status === "PENDING_HUMAN_ADJUDICATION");
check("COMPAT-R1-002 is not closed by Codex", assessment002.finding_closed_by_codex === false && assessment002.final_status === "PENDING_HUMAN_ADJUDICATION");
const requiredPackageFiles = ["finding-001-decision-input.json", "finding-002-decision-input.json", "evidence-index.json", "technical-assessment-summary.md", "assurance-disclosure.md", "human-decision-form.json", "human-decision-form.schema.json"];
check("Human adjudication package contains all seven required artifacts", requiredPackageFiles.every((name) => fs.existsSync(path.join(taskRoot, "human-adjudication-package", name))));
check("Pending Human decision form is structurally valid", validateHumanDecisionForm(decisionForm));
check("Finding decision inputs expose only HUMAN_CLOSED or HUMAN_NOT_CLOSED", JSON.stringify(decisionInput001.available_human_decisions) === JSON.stringify(["HUMAN_CLOSED", "HUMAN_NOT_CLOSED"]) && JSON.stringify(decisionInput002.available_human_decisions) === JSON.stringify(["HUMAN_CLOSED", "HUMAN_NOT_CLOSED"]));
check("Reduced-assurance disclosure is complete", assuranceAck.limitations_acknowledged === true && disclosure.required_on_all_downstream_artifacts.reduced_assurance === true && disclosure.required_on_all_downstream_artifacts.clean_room_review_completed === false);
check("No independent-review equivalence is claimed", independenceGap.clean_room_independence === false && independenceGap.external_reviewer_independence === false && validationSummary.independent_review_equivalence === false);
check("Core Object Library is not authorized or created by this task", architectureBoundary.core_object_library_status === "NOT_AUTHORIZED" && architectureBoundary.core_object_library_created_by_this_task === false);
check("No Reviewer launch is assigned", blueprint.review_assignments.length === 0 && blueprint.formal_independent_review_status === "NOT_COMPLETED");
check("No subagent execution is configured", blueprint.execution_mode === "ROOT_ORCHESTRATOR_SEQUENTIAL_NO_SUBAGENTS");
check("Recommendation summary preserves both pending statuses", recommendationSummary.recommendations.every((entry) => entry.final_status === "PENDING_HUMAN_ADJUDICATION") && recommendationSummary.finding_closed_by_codex_count === 0);
check("Current downstream boundary is fail-closed", safeDownstreamBoundary(aggregatorBoundary, architectureBoundary));

const validSubmittedForm = {
  ...decisionForm,
  submission_status: "SUBMITTED_BY_HUMAN",
  decisions: decisionForm.decisions.map((decision) => ({
    ...decision,
    human_decision: "HUMAN_CLOSED",
    human_rationale: "Synthetic Human-form positive fixture only; not an adopted decision.",
    assurance_limitation_acknowledged: true,
    decision_timestamp: "2026-07-22T20:30:00+08:00",
  })),
};
check("Synthetic submitted Human form positive fixture is accepted", validateHumanDecisionForm(validSubmittedForm));
check("Negative unknown Human decision is rejected", !validateHumanDecisionForm({ ...validSubmittedForm, decisions: [{ ...validSubmittedForm.decisions[0], human_decision: "AUTO_CLOSED" }, validSubmittedForm.decisions[1]] }));
check("Negative pending form with Codex-filled decision is rejected", !validateHumanDecisionForm({ ...decisionForm, decisions: [{ ...decisionForm.decisions[0], human_decision: "HUMAN_CLOSED" }, decisionForm.decisions[1]] }));
check("Negative submitted form without Human rationale is rejected", !validateHumanDecisionForm({ ...validSubmittedForm, decisions: [{ ...validSubmittedForm.decisions[0], human_rationale: "" }, validSubmittedForm.decisions[1]] }));
check("Negative submitted form without assurance acknowledgement is rejected", !validateHumanDecisionForm({ ...validSubmittedForm, decisions: [{ ...validSubmittedForm.decisions[0], assurance_limitation_acknowledged: false }, validSubmittedForm.decisions[1]] }));
check("Negative duplicate Finding decisions are rejected", !validateHumanDecisionForm({ ...decisionForm, decisions: [decisionForm.decisions[0], { ...decisionForm.decisions[0] }] }));
check("Negative VALIDATION_FAIL cannot support RECOMMEND_HUMAN_CLOSE", !recommendationContract({ validation_result: "VALIDATION_FAIL" }, { ...assessment001, technical_recommendation: "RECOMMEND_HUMAN_CLOSE" }));
check("Negative early Aggregator authorization is rejected", !safeDownstreamBoundary({ ...aggregatorBoundary, current_status: "AUTHORIZED" }, architectureBoundary));
check("Negative early Architecture start is rejected", !safeDownstreamBoundary(aggregatorBoundary, { ...architectureBoundary, started: true }));
check("Negative Clean-Room completion claim conflicts with reduced assurance", !(assurance.clean_room_review_completed === true || independenceGap.clean_room_independence === true));

const passCount = tests.filter((test) => test.status === "PASS").length;
const failCount = tests.length - passCount;
const output = {
  schema_version: 1,
  task_id: path.basename(taskRoot),
  validator_role: "EVIDENCE_AND_BINDING_VALIDATOR",
  validation_scope: "EXACT_INTEGRITY_EFFECTIVE_STATE_RECOMMENDATION_HUMAN_FORM_AND_DOWNSTREAM_BOUNDARY",
  test_count: tests.length,
  pass_count: passCount,
  fail_count: failCount,
  overall_status: failCount === 0 ? `PASS_${passCount}_OF_${tests.length}` : "FAIL",
  tests,
  base_target_results: baseResults,
  source_results: sourceResults,
  source_classification_counts: normalizedClassCounts,
  overlay_results: overlayResults,
  historical_results: historicalResults,
  governance_results: governanceResults,
  git_used: false,
  reviewer_launched: false,
  aggregator_launched: false,
  architecture_reconciliation_started: false,
  findings_closed_by_codex: 0,
};

console.log(JSON.stringify(output, null, 2));
if (failCount > 0) process.exitCode = 1;
