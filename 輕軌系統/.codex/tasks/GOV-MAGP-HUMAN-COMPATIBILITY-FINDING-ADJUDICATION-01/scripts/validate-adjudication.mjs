import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tasksRoot = path.dirname(taskRoot);
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const sourceRoot = "C:/Users/a2306/Desktop/MAGP-Reference-Sources";

const taskIds = {
  base: "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01",
  prep: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
  remediation: "GOV-MAGP-SOURCE-SCOPE-REVIEW-INTAKE-AND-COMPATIBILITY-REMEDIATION-02",
  attempt: "GOV-MAGP-COMPATIBILITY-R2-STARTUP-BLOCKER-INTAKE-AND-RETRY-PREPARATION-01",
  schema: "GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01",
  runtime: "GOV-MAGP-COMPATIBILITY-R2-RUNTIME-CAPABILITY-AND-HUMAN-ADJUDICATION-PREPARATION-01",
  assessment: "GOV-MAGP-HUMAN-ADJUDICATED-COMPATIBILITY-ASSESSMENT-01",
};

const roots = Object.fromEntries(Object.entries(taskIds).map(([key, id]) => [key, path.join(tasksRoot, id)]));

function readJson(absoluteOrRelativePath, base = taskRoot) {
  const absolutePath = path.isAbsolute(absoluteOrRelativePath)
    ? absoluteOrRelativePath
    : path.join(base, absoluteOrRelativePath);
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function closureRecordValid(record) {
  return record.human_decision === "HUMAN_CLOSED"
    && record.effective_status === "CLOSED_BY_HUMAN_ADJUDICATION"
    && record.closure_model === "HUMAN_ADJUDICATED_REDUCED_ASSURANCE"
    && record.clean_room_closure === false
    && record.independent_reviewer_closure === false
    && record.finding_waived === false
    && record.finding_deleted === false
    && record.finding_superseded === false
    && record.finding_remediation_verified === true
    && record.original_finding_preserved === true
    && record.historical_evidence_preserved === true;
}

function disclosureValid(record) {
  const required = record.required_aggregator_disclosure;
  return record.review_model === "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT"
    && record.assurance_level === "REDUCED_ASSURANCE"
    && record.clean_room_review_completed === false
    && record.independent_external_review_completed === false
    && record.human_adjudicated_review_completed === true
    && record.reduced_assurance === true
    && required?.clean_room_review_completed === false
    && required?.independent_external_review_completed === false
    && required?.human_adjudicated_review_completed === true
    && required?.reduced_assurance === true
    && required?.compatibility_review_model === "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT";
}

function aggregatorInputContractValid(record) {
  const historicalBlocker = record.inputs.find((entry) => entry.input_id === "COMPATIBILITY_R1_BLOCKER_HISTORY");
  return historicalBlocker?.review_status === "BLOCKER"
    && historicalBlocker?.usage === "ORIGINAL_FINDING_SOURCE"
    && historicalBlocker?.may_be_treated_as_pass === false
    && record.compatibility_success_evidence_rule === "HUMAN_ADJUDICATED_ASSESSMENT_PLUS_BOTH_HUMAN_CLOSURE_RECORDS"
    && record.compatibility_r1_blocker_payload_is_pass_input === false;
}

function readinessRecordValid(record) {
  return record.pass_count === 16
    && record.fail_count === 0
    && record.conditions.length === 16
    && record.conditions.every((condition) => condition.status === "PASS")
    && record.readiness === "READY_FOR_HUMAN_TO_LAUNCH_HUMAN_ADJUDICATED_SOURCE_SCOPE_AGGREGATOR"
    && record.aggregator_started === false
    && record.human_launch_action_required === true
    && record.launch_authority_from_this_task === false;
}

function gateBoundaryValid(record) {
  return record.compatibility_gate_result === "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE"
    && record.source_scope_lock_review_gate === "PENDING_AGGREGATOR"
    && record.source_scope_exact_manifest_adoption === "NOT_STARTED"
    && record.aggregator_status === "NOT_STARTED"
    && record.architecture_reconciliation === "NOT_AUTHORIZED"
    && record.core_object_library === "NOT_AUTHORIZED";
}

const intent = readJson("task-intent.yaml");
const classification = readJson("classification.yaml");
const blueprint = readJson("blueprint.yaml");
const inputManifest = readJson("human-adjudication-input-manifest.json");
const decisionRecord = readJson("human-adjudication/human-decision-record.json");
const finding001 = readJson("human-adjudication/finding-001-human-adjudication.json");
const finding002 = readJson("human-adjudication/finding-002-human-adjudication.json");
const authorityAttestation = readJson("human-adjudication/human-authority-attestation.json");
const assuranceAcknowledgement = readJson("human-adjudication/reduced-assurance-acknowledgement.json");
const adjudicationIntegrity = readJson("human-adjudication/adjudication-integrity.json");
const modelResult = readJson("compatibility-review-model-result.json");
const findingFinalStatus = readJson("finding-final-status.json");
const gateBoundary = readJson("source-scope-gate-boundary.json");
const assuranceDisclosure = readJson("assurance-disclosure.json");
const baseIntegrity = readJson("base-target-integrity.json");
const overlayIntegrity = readJson("corrective-overlay-integrity.json");
const sourceIntegrity = readJson("source-root-reverification.json");
const productIntegrity = readJson("product-governance-integrity.json");
const historicalIntegrity = readJson("historical-artifact-integrity.json");
const aggregatorInputs = readJson("aggregator-input-manifest.json");
const readiness = readJson("aggregator-launch-readiness.json");
const packageManifest = readJson("aggregator-launch-package/package-manifest.json");
const packageAssurance = readJson("aggregator-launch-package/assurance-requirements.json");

const assessmentFinding001Input = readJson("human-adjudication-package/finding-001-decision-input.json", roots.assessment);
const assessmentFinding002Input = readJson("human-adjudication-package/finding-002-decision-input.json", roots.assessment);
const assessmentTechnical001 = readJson("technical-assessment/compat-r1-001-assessment.json", roots.assessment);
const assessmentTechnical002 = readJson("technical-assessment/compat-r1-002-assessment.json", roots.assessment);
const assessmentValidation001 = readJson("deterministic-validation/finding-001-validation.json", roots.assessment);
const assessmentValidation002 = readJson("deterministic-validation/finding-002-validation.json", roots.assessment);
const assessmentValidationSummary = readJson("deterministic-validation/validation-summary.json", roots.assessment);
const assessmentValidationResults = readJson("validation-results.json", roots.assessment);
const assessmentBaseIntegrity = readJson("integrity-validation/base-target-integrity.json", roots.assessment);
const assessmentOverlayIntegrity = readJson("integrity-validation/corrective-overlay-integrity.json", roots.assessment);
const assessmentSourceIntegrity = readJson("integrity-validation/source-root-integrity.json", roots.assessment);

const inputFileResults = inputManifest.artifacts.map((entry) => {
  const absolutePath = path.join(roots.assessment, ...entry.relative_path.split("/"));
  return {
    relative_path: entry.relative_path,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const baseResults = assessmentBaseIntegrity.artifacts.map((entry) => {
  const absolutePath = path.join(roots.base, ...entry.relative_path.split("/"));
  return {
    relative_path: entry.relative_path,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const overlayRoot = path.join(roots.remediation, "compatibility-remediation");
const overlayResults = assessmentOverlayIntegrity.artifacts.map((entry) => {
  const absolutePath = path.join(overlayRoot, ...entry.relative_path.split("/"));
  return {
    relative_path: entry.relative_path,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const topLevelSourceFiles = fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isFile());
const sourceResults = assessmentSourceIntegrity.sources.map((entry) => {
  const absolutePath = path.join(sourceRoot, entry.actual_filename);
  return {
    source_id: entry.source_id,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const productResults = productIntegrity.files.map((entry) => {
  const absolutePath = path.join(productRoot, ...entry.relative_path.split("/"));
  return {
    relative_path: entry.relative_path,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const historicalResults = historicalIntegrity.historical_tasks.map((entry) => {
  const actual = treeDigest(path.join(tasksRoot, entry.task_id));
  return {
    task_id: entry.task_id,
    expected_file_count: entry.file_count,
    actual_file_count: actual.file_count,
    expected_manifest_sha256: entry.manifest_sha256,
    actual_manifest_sha256: actual.canonical_manifest_sha256,
    match: entry.file_count === actual.file_count && entry.manifest_sha256 === actual.canonical_manifest_sha256,
  };
});

const adjudicationIntegrityResults = adjudicationIntegrity.artifacts.map((entry) => {
  const absolutePath = path.join(taskRoot, "human-adjudication", entry.relative_path);
  return {
    relative_path: entry.relative_path,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const packageRoot = path.join(taskRoot, "aggregator-launch-package");
const packageResults = packageManifest.artifacts.map((entry) => {
  const absolutePath = path.resolve(packageRoot, ...entry.relative_path.split("/"));
  return {
    relative_path: entry.relative_path,
    expected_sha256: entry.sha256,
    actual_sha256: sha256File(absolutePath),
    expected_bytes: entry.bytes,
    actual_bytes: fs.statSync(absolutePath).size,
  };
});

const reviewerPayloadRoot = path.join(roots.remediation, "reviewer-payloads");
const integrityR1 = readJson(path.join(reviewerPayloadRoot, "source-integrity-r1.raw.txt"));
const authorityR1 = readJson(path.join(reviewerPayloadRoot, "source-authority-r1.raw.txt"));
const contaminationR1 = readJson(path.join(reviewerPayloadRoot, "scope-contamination-r1.raw.txt"));
const compatibilityR1 = readJson(path.join(reviewerPayloadRoot, "compatibility-r1.raw.txt"));

const tests = [];
function check(requirement, condition, details) {
  tests.push({
    test_id: tests.length + 1,
    requirement,
    status: condition ? "PASS" : "FAIL",
    ...(details === undefined ? {} : { details }),
  });
}

check("Human Review Model is exact", intent.adopted_review_model === "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT" && decisionRecord.review_model === intent.adopted_review_model);
check("Reduced Assurance is acknowledged", assuranceAcknowledgement.assurance_level === "REDUCED_ASSURANCE" && assuranceAcknowledgement.acknowledgement_status === "ACKNOWLEDGED");
check("Clean-Room completed is false", assuranceAcknowledgement.clean_room_review_completed === false && modelResult.clean_room_review_completed === false);
check("Independent Review completed is false", assuranceAcknowledgement.independent_external_review_completed === false && modelResult.independent_review_completed === false);
check("Ten Human adjudication inputs match exact hashes and bytes", inputFileResults.length === 10 && inputFileResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), inputFileResults);
check("COMPAT-R1-001 deterministic validation passed", assessmentValidation001.validation_result === "VALIDATION_PASS" && assessmentFinding001Input.deterministic_validation_result === "VALIDATION_PASS");
check("COMPAT-R1-001 technical recommendation is close", assessmentTechnical001.technical_recommendation === "RECOMMEND_HUMAN_CLOSE" && assessmentFinding001Input.codex_technical_recommendation === "RECOMMEND_HUMAN_CLOSE");
check("COMPAT-R1-001 Human decision is closed", finding001.finding_id === "COMPAT-R1-001" && closureRecordValid(finding001));
check("COMPAT-R1-002 deterministic validation passed", assessmentValidation002.validation_result === "VALIDATION_PASS" && assessmentFinding002Input.deterministic_validation_result === "VALIDATION_PASS");
check("COMPAT-R1-002 technical recommendation is close", assessmentTechnical002.technical_recommendation === "RECOMMEND_HUMAN_CLOSE" && assessmentFinding002Input.codex_technical_recommendation === "RECOMMEND_HUMAN_CLOSE");
check("COMPAT-R1-002 Human decision is closed", finding002.finding_id === "COMPAT-R1-002" && closureRecordValid(finding002));
check("Neither Finding was deleted", finding001.finding_deleted === false && finding002.finding_deleted === false && findingFinalStatus.findings.every((entry) => entry.deleted === false));
check("Neither Finding was waived", finding001.finding_waived === false && finding002.finding_waived === false && findingFinalStatus.findings.every((entry) => entry.waived === false));
check("Closure model is Human-adjudicated reduced assurance", finding001.closure_model === "HUMAN_ADJUDICATED_REDUCED_ASSURANCE" && finding002.closure_model === "HUMAN_ADJUDICATED_REDUCED_ASSURANCE");
check("Base Review Target is unchanged 20/20", baseIntegrity.status === "UNCHANGED_20_OF_20" && baseResults.length === 20 && baseResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), baseResults);
check("Corrective Overlay is unchanged 7/7", overlayIntegrity.status === "UNCHANGED_7_OF_7" && overlayResults.length === 7 && overlayResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), overlayResults);
check("Source root is unchanged 11/11", sourceIntegrity.status === "UNCHANGED_11_OF_11_CLASSIFICATION_4_1_6" && topLevelSourceFiles.length === 11 && sourceResults.length === 11 && sourceResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), sourceResults);
check("Source classification remains 4/1/6", sourceIntegrity.classification_counts.CORE_INCLUDED === 4 && sourceIntegrity.classification_counts.OPTIONAL_PATTERN_ONLY === 1 && sourceIntegrity.classification_counts.EXCLUDED === 6);
check("Source Authority remains PROPOSED_NOT_ADOPTED", overlayIntegrity.source_authority_effective_status === "PROPOSED_NOT_ADOPTED" && gateBoundary.source_authority === "PROPOSED_NOT_ADOPTED");
check("Product and Governance baseline is unchanged", productIntegrity.overall_status === "PASS_UNCHANGED" && productResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), productResults);
check("Historical Tasks are unchanged", historicalIntegrity.all_historical_tasks_unchanged === true && historicalResults.length === 7 && historicalResults.every((entry) => entry.match), historicalResults);
check("Aggregator has not started", readiness.aggregator_started === false && gateBoundary.aggregator_status === "NOT_STARTED");
check("Architecture Reconciliation is not authorized", gateBoundary.architecture_reconciliation === "NOT_AUTHORIZED" && readiness.architecture_reconciliation === "NOT_AUTHORIZED");
check("Source Scope Exact-Manifest Adoption has not started", gateBoundary.source_scope_exact_manifest_adoption === "NOT_STARTED");
check("Git was not used", productIntegrity.git_used === false && baseIntegrity.git_used === false && overlayIntegrity.git_used === false && sourceIntegrity.git_used === false && historicalIntegrity.git_used === false);
check("Original Findings and historical evidence are preserved", finding001.original_finding_preserved === true && finding002.original_finding_preserved === true && finding001.historical_evidence_preserved === true && finding002.historical_evidence_preserved === true);
check("Original HIGH severities are preserved", finding001.original_severity === "HIGH" && finding002.original_severity === "HIGH" && findingFinalStatus.findings.every((entry) => entry.original_severity === "HIGH"));
check("Compatibility R1 BLOCKER is original finding source only", aggregatorInputContractValid(aggregatorInputs));
check("Compatibility success evidence uses assessment plus both Human closures", aggregatorInputs.compatibility_success_evidence_rule === "HUMAN_ADJUDICATED_ASSESSMENT_PLUS_BOTH_HUMAN_CLOSURE_RECORDS");
check("Open Compatibility CRITICAL count is zero", findingFinalStatus.open_compatibility_critical_findings === 0 && modelResult.open_compatibility_critical_findings === 0);
check("Open Compatibility HIGH count is zero", findingFinalStatus.open_compatibility_high_findings === 0 && modelResult.open_compatibility_high_findings === 0);
check("Compatibility Gate is Human-adjudicated reduced assurance GO", modelResult.compatibility_gate_result === "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE" && gateBoundary.compatibility_gate_result === modelResult.compatibility_gate_result);
check("Full Source Scope Lock Review Gate remains pending Aggregator", modelResult.source_scope_lock_review_gate === "PENDING_AGGREGATOR" && gateBoundary.source_scope_lock_review_gate === "PENDING_AGGREGATOR");
check("Aggregator readiness conditions pass 16/16", readiness.conditions.length === 16 && readiness.conditions.every((entry) => entry.status === "PASS") && readiness.pass_count === 16 && readiness.fail_count === 0);
check("Aggregator launch readiness label is exact", readinessRecordValid(readiness));
check("Mandatory reduced-assurance disclosure is complete", disclosureValid(assuranceDisclosure));
check("Prohibited clean-room and independent result labels are absent", ![modelResult.result, modelResult.compatibility_gate_result, gateBoundary.compatibility_gate_result, readiness.readiness].some((value) => assuranceDisclosure.aggregator_prohibited_results.includes(value)));
check("Human closure authority is valid and Codex authority is none", authorityAttestation.finding_closure_authority_valid === true && authorityAttestation.codex_decision_authority === "NONE" && authorityAttestation.decision_inferred_by_codex === false);
check("Human adjudication records match 5/5 exact bindings", adjudicationIntegrity.status === "PASS_5_OF_5" && adjudicationIntegrityResults.length === 5 && adjudicationIntegrityResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), adjudicationIntegrityResults);
check("Review model result is PASS_WITH_REDUCED_ASSURANCE", modelResult.result === "PASS_WITH_REDUCED_ASSURANCE" && modelResult.human_adjudication_completed === true && modelResult.deterministic_validation_completed === true);
check("Core Object Library remains not authorized", gateBoundary.core_object_library === "NOT_AUTHORIZED");
check("No subagent or formal Reviewer execution is configured", blueprint.execution_mode === "ROOT_ORCHESTRATOR_SEQUENTIAL_NO_SUBAGENTS" && blueprint.review_assignments.length === 0 && classification.parallel_allowed === false);
check("Aggregator launch package matches 8/8 exact bindings", packageManifest.expected_artifact_count === 8 && packageResults.length === 8 && packageResults.every((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes), packageResults);
check("Integrity R1 raw payload is PASS", integrityR1.payload_core.review_status === "PASS" && integrityR1.payload_core.completed === true);
check("Authority R1 raw payload is PASS", authorityR1.payload_core.review_status === "PASS" && authorityR1.payload_core.completed === true);
check("Contamination R1 raw payload is PASS", contaminationR1.payload_core.review_status === "PASS" && contaminationR1.payload_core.completed === true);
check("Compatibility R1 raw payload remains BLOCKER history", compatibilityR1.payload_core.review_status === "BLOCKER" && compatibilityR1.payload_core.findings.length === 2);
check("Assessment validator result remains PASS_55_OF_55", assessmentValidationResults.validation_status === "PASS_55_OF_55" && assessmentValidationSummary.overall_result === "VALIDATION_PASS");
check("Aggregator maximum result preserves Human adoption gate", packageAssurance.maximum_success_result === "READY_FOR_HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION_WITH_REDUCED_ASSURANCE_DISCLOSURE");

const negativeCleanRoom = clone(finding001);
negativeCleanRoom.clean_room_closure = true;
check("Negative Clean-Room closure claim is rejected", !closureRecordValid(negativeCleanRoom));
const negativeIndependent = clone(finding001);
negativeIndependent.independent_reviewer_closure = true;
check("Negative independent closure claim is rejected", !closureRecordValid(negativeIndependent));
const negativeWaiver = clone(finding001);
negativeWaiver.finding_waived = true;
check("Negative waived Finding is rejected", !closureRecordValid(negativeWaiver));
const negativeDeleted = clone(finding001);
negativeDeleted.finding_deleted = true;
check("Negative deleted Finding is rejected", !closureRecordValid(negativeDeleted));
const negativeBlockerUsage = clone(aggregatorInputs);
const negativeBlockerEntry = negativeBlockerUsage.inputs.find((entry) => entry.input_id === "COMPATIBILITY_R1_BLOCKER_HISTORY");
negativeBlockerEntry.usage = "FORMAL_PASS_INPUT";
negativeBlockerEntry.may_be_treated_as_pass = true;
negativeBlockerUsage.compatibility_r1_blocker_payload_is_pass_input = true;
check("Negative Compatibility R1 BLOCKER-as-PASS use is rejected", !aggregatorInputContractValid(negativeBlockerUsage));
const negativeAggregatorStarted = clone(readiness);
negativeAggregatorStarted.aggregator_started = true;
check("Negative early Aggregator start is rejected", !readinessRecordValid(negativeAggregatorStarted));
const negativeAdoption = clone(gateBoundary);
negativeAdoption.source_scope_exact_manifest_adoption = "STARTED";
check("Negative early Source Scope Adoption is rejected", !gateBoundaryValid(negativeAdoption));
const negativeArchitecture = clone(gateBoundary);
negativeArchitecture.architecture_reconciliation = "AUTHORIZED";
check("Negative early Architecture authorization is rejected", !gateBoundaryValid(negativeArchitecture));
const negativeDisclosure = clone(assuranceDisclosure);
negativeDisclosure.required_aggregator_disclosure.reduced_assurance = false;
check("Negative missing reduced-assurance disclosure is rejected", !disclosureValid(negativeDisclosure));
const negativeHumanDecision = clone(finding002);
negativeHumanDecision.human_decision = "HUMAN_NOT_CLOSED";
check("Negative non-closed Human decision is rejected", !closureRecordValid(negativeHumanDecision));

const passCount = tests.filter((test) => test.status === "PASS").length;
const failCount = tests.length - passCount;
const overallStatus = failCount === 0 ? `PASS_${passCount}_OF_${tests.length}` : "HUMAN_ADJUDICATION_INPUT_INVALID";

console.log(JSON.stringify({
  schema_version: 1,
  task_id: intent.task_id,
  validator_role: "HUMAN_ADJUDICATION_AND_AGGREGATOR_READINESS_DETERMINISTIC_QA_RUNNER",
  test_count: tests.length,
  pass_count: passCount,
  fail_count: failCount,
  overall_status: overallStatus,
  tests,
  evidence_summary: {
    human_adjudication_input_matches: `${inputFileResults.filter((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes).length}_OF_${inputFileResults.length}`,
    base_target_matches: `${baseResults.filter((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes).length}_OF_${baseResults.length}`,
    corrective_overlay_matches: `${overlayResults.filter((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes).length}_OF_${overlayResults.length}`,
    source_root_matches: `${sourceResults.filter((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes).length}_OF_${sourceResults.length}`,
    historical_task_matches: `${historicalResults.filter((entry) => entry.match).length}_OF_${historicalResults.length}`,
    adjudication_record_matches: `${adjudicationIntegrityResults.filter((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes).length}_OF_${adjudicationIntegrityResults.length}`,
    aggregator_package_matches: `${packageResults.filter((entry) => entry.expected_sha256 === entry.actual_sha256 && entry.expected_bytes === entry.actual_bytes).length}_OF_${packageResults.length}`,
  },
  final_state: {
    review_model: modelResult.review_model,
    assurance_level: modelResult.assurance_level,
    clean_room_review_completed: modelResult.clean_room_review_completed,
    COMPAT_R1_001: finding001.effective_status,
    COMPAT_R1_002: finding002.effective_status,
    open_compatibility_critical: findingFinalStatus.open_compatibility_critical_findings,
    open_compatibility_high: findingFinalStatus.open_compatibility_high_findings,
    compatibility_gate: modelResult.compatibility_gate_result,
    source_scope_lock_review_gate: modelResult.source_scope_lock_review_gate,
    aggregator: readiness.aggregator_started ? "STARTED" : "NOT_STARTED",
    aggregator_launch_readiness: readiness.readiness,
    architecture_reconciliation: gateBoundary.architecture_reconciliation,
    git_used: false,
  },
}, null, 2));

if (failCount > 0) process.exitCode = 1;
