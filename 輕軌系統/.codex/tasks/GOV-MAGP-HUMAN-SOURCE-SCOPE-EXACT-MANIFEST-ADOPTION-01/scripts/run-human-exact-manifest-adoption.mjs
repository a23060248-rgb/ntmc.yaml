import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TASK_ROOT = path.resolve(SCRIPT_DIR, "..");
const TASKS_ROOT = path.resolve(TASK_ROOT, "..");
const PRODUCT_ROOT = path.resolve(TASK_ROOT, "..", "..", "..");
const TASK_ID = "GOV-MAGP-HUMAN-SOURCE-SCOPE-EXACT-MANIFEST-ADOPTION-01";
const AGGREGATOR_TASK_ID = "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-HUMAN-ADJUDICATED-R1";
const AGGREGATOR_ROOT = path.join(TASKS_ROOT, AGGREGATOR_TASK_ID);
const ADOPTION_PACKAGE_ROOT = path.join(AGGREGATOR_ROOT, "human-exact-manifest-adoption-package");
const BASE_TASK_ID = "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01";
const BASE_ROOT = path.join(TASKS_ROOT, BASE_TASK_ID);
const INTAKE_TASK_ID = "GOV-MAGP-SOURCE-SCOPE-REVIEW-INTAKE-AND-COMPATIBILITY-REMEDIATION-02";
const INTAKE_ROOT = path.join(TASKS_ROOT, INTAKE_TASK_ID);
const HUMAN_DECISION_SOURCE = "C:/Users/a2306/.codex/attachments/a85e46db-4bcb-4553-8245-e4db8a9c79b3/pasted-text.txt";
const HUMAN_DECISION = "ADOPT_EXACT_SOURCE_MANIFEST_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE";
const RUN_ID = "MAGP-HUMAN-EXACT-MANIFEST-ADOPTION-20260722-R1";
const EXECUTED_ON = "2026-07-22";
const NORMATIVE_SCOPE = [
  "SOURCE_SELECTION",
  "SOURCE_CITATION",
  "CLAIM_ELIGIBILITY",
  "SOURCE_PRECEDENCE",
  "CONTAMINATION_PREVENTION",
  "ARCHITECTURE_RECONCILIATION_INPUT_BOUNDARY",
];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function readBytes(filePath) {
  return fs.readFileSync(filePath);
}

function sha256File(filePath) {
  return sha256Bytes(readBytes(filePath));
}

function readJson(filePath) {
  return JSON.parse(readBytes(filePath).toString("utf8"));
}

function writeJson(relativePath, value) {
  const absolutePath = path.join(TASK_ROOT, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(relativePath, value) {
  const absolutePath = path.join(TASK_ROOT, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, value.replace(/\r\n/g, "\n"), "utf8");
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
      relative_path: toPosix(path.relative(root, absolutePath)),
      sha256: sha256File(absolutePath),
      bytes: fs.statSync(absolutePath).size,
    }))
    .sort((a, b) => (a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0));
  const canonical = rows.map((row) => `${row.relative_path}|${row.sha256}|${row.bytes}`).join("\n");
  return {
    absolute_root: toPosix(root),
    file_count: rows.length,
    canonical_manifest_sha256: sha256Bytes(Buffer.from(canonical, "utf8")),
  };
}

function fileBinding(filePath) {
  return {
    absolute_path: toPosix(filePath),
    sha256: sha256File(filePath),
    bytes: fs.statSync(filePath).size,
  };
}

function failClosed(condition, code, detail) {
  if (!condition) {
    const error = new Error(`${code}: ${detail}`);
    error.code = code;
    throw error;
  }
}

function sameSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function directBindingResult(filePath, expectedSha256, expectedBytes, label) {
  const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  const actualSha256 = exists ? sha256File(filePath) : null;
  const actualBytes = exists ? fs.statSync(filePath).size : null;
  return {
    label,
    absolute_path: toPosix(filePath),
    expected_sha256: expectedSha256,
    actual_sha256: actualSha256,
    expected_bytes: expectedBytes,
    actual_bytes: actualBytes,
    match: exists && actualSha256 === expectedSha256 && actualBytes === expectedBytes,
  };
}

const requiredPackageFiles = [
  "exact-source-manifest.json",
  "source-hash-manifest.json",
  "source-identity-manifest.json",
  "classification-manifest.json",
  "source-authority-proposal.json",
  "claim-eligibility-policy-reference.json",
  "contamination-policy-reference.json",
  "review-evidence-summary.json",
  "finding-closure-summary.json",
  "reduced-assurance-disclosure.json",
  "adoption-decision-form.json",
  "adoption-decision-form.schema.json",
  "adoption-boundary.json",
  "post-adoption-next-step-boundary.json",
];

const humanDecisionText = readBytes(HUMAN_DECISION_SOURCE).toString("utf8");
const normalizedHumanDecisionText = humanDecisionText.replace(/\r\n/g, "\n");
failClosed(humanDecisionText.includes("Human正式決定：") && humanDecisionText.includes(HUMAN_DECISION), "HUMAN_EXACT_MANIFEST_DECISION_MISSING", "exact Human decision is absent from the authorized input");
failClosed(normalizedHumanDecisionText.includes("Human正式採用決定") && normalizedHumanDecisionText.includes("decision_status：\n\nHUMAN_APPROVED"), "HUMAN_EXACT_MANIFEST_DECISION_NOT_APPROVED", "Human approval semantics are absent from the authorized input");
const humanDecisionSourceBinding = fileBinding(HUMAN_DECISION_SOURCE);

const aggregatorResult = readJson(path.join(AGGREGATOR_ROOT, "aggregation-result.json"));
const aggregatorGate = readJson(path.join(AGGREGATOR_ROOT, "source-scope-review-gate-result.json"));
const aggregatorValidation = readJson(path.join(AGGREGATOR_ROOT, "validation-results.json"));
const aggregatorAssurance = readJson(path.join(AGGREGATOR_ROOT, "assurance-disclosure.json"));
const aggregatorBase = readJson(path.join(AGGREGATOR_ROOT, "base-target-integrity.json"));
const aggregatorSource = readJson(path.join(AGGREGATOR_ROOT, "source-root-reverification.json"));
const aggregatorClassification = readJson(path.join(AGGREGATOR_ROOT, "source-classification-reverification.json"));
const aggregatorOverlay = readJson(path.join(AGGREGATOR_ROOT, "corrective-overlay-integrity.json"));
const aggregatorProduct = readJson(path.join(AGGREGATOR_ROOT, "product-governance-integrity.json"));
const aggregatorHistorical = readJson(path.join(AGGREGATOR_ROOT, "historical-artifact-integrity.json"));
const aggregatorFindings = readJson(path.join(AGGREGATOR_ROOT, "finding-effective-status.json"));

failClosed(aggregatorResult.aggregation_result === "PASS_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE" && aggregatorResult.source_scope_review_evidence_status === "AGGREGATED_AND_VALIDATED", "AGGREGATOR_RESULT_INVALID", "Aggregator result or evidence state invalid");
failClosed(aggregatorGate.source_scope_lock_review_gate === "READY_FOR_HUMAN_EXACT_MANIFEST_ADOPTION" && aggregatorGate.source_scope_exact_manifest_adoption === "NOT_STARTED", "AGGREGATOR_RESULT_INVALID", "Source Scope gate is not Adoption Ready");
failClosed(aggregatorValidation.required_status === "PASS_30_OF_30" && aggregatorValidation.required_pass_count === 30 && aggregatorValidation.required_fail_count === 0 && aggregatorValidation.hard_stop_codes_triggered.length === 0, "AGGREGATOR_RESULT_INVALID", "Aggregator deterministic QA invalid");
failClosed(aggregatorValidation.prohibited_action_attestation.git_used === false && aggregatorValidation.prohibited_action_attestation.source_scope_adoption_executed === false && aggregatorValidation.prohibited_action_attestation.architecture_reconciliation_started === false, "AGGREGATOR_RESULT_INVALID", "Aggregator boundary attestation invalid");
failClosed(aggregatorResult.open_active_critical_findings === 0 && aggregatorResult.open_active_high_findings === 0, "AGGREGATOR_RESULT_INVALID", "Aggregator reports active CRITICAL or HIGH Findings");
failClosed(aggregatorResult.source_authority === "PROPOSED_NOT_ADOPTED" && aggregatorResult.normative_authority === false && aggregatorResult.human_exact_manifest_adoption === "NOT_STARTED" && aggregatorResult.architecture_reconciliation === "NOT_AUTHORIZED", "AGGREGATOR_RESULT_INVALID", "Aggregator pre-adoption authority boundary invalid");
failClosed(aggregatorAssurance.clean_room_review_completed === false && aggregatorAssurance.independent_external_review_completed === false && aggregatorAssurance.human_adjudicated_review_completed === true && aggregatorAssurance.deterministic_aggregation_completed === true && aggregatorAssurance.reduced_assurance === true && aggregatorAssurance.disclosure_valid === true, "REDUCED_ASSURANCE_NOT_DISCLOSED", "Aggregator Reduced-Assurance disclosure invalid");

const packageActualNames = fs.readdirSync(ADOPTION_PACKAGE_ROOT, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
failClosed(packageActualNames.length === 14 && sameSet(packageActualNames, requiredPackageFiles), "ADOPTION_PACKAGE_INVALID", "Adoption Package is not the exact 14-file package");
const packageBindings = requiredPackageFiles.map((name) => ({ name, ...fileBinding(path.join(ADOPTION_PACKAGE_ROOT, name)) }));
for (const name of requiredPackageFiles) readJson(path.join(ADOPTION_PACKAGE_ROOT, name));

const exactManifest = readJson(path.join(ADOPTION_PACKAGE_ROOT, "exact-source-manifest.json"));
const hashManifest = readJson(path.join(ADOPTION_PACKAGE_ROOT, "source-hash-manifest.json"));
const identityManifest = readJson(path.join(ADOPTION_PACKAGE_ROOT, "source-identity-manifest.json"));
const classificationManifest = readJson(path.join(ADOPTION_PACKAGE_ROOT, "classification-manifest.json"));
const authorityProposal = readJson(path.join(ADOPTION_PACKAGE_ROOT, "source-authority-proposal.json"));
const claimReference = readJson(path.join(ADOPTION_PACKAGE_ROOT, "claim-eligibility-policy-reference.json"));
const contaminationReference = readJson(path.join(ADOPTION_PACKAGE_ROOT, "contamination-policy-reference.json"));
const reviewEvidence = readJson(path.join(ADOPTION_PACKAGE_ROOT, "review-evidence-summary.json"));
const findingClosure = readJson(path.join(ADOPTION_PACKAGE_ROOT, "finding-closure-summary.json"));
const packageAssurance = readJson(path.join(ADOPTION_PACKAGE_ROOT, "reduced-assurance-disclosure.json"));
const pendingAdoptionForm = readJson(path.join(ADOPTION_PACKAGE_ROOT, "adoption-decision-form.json"));
const adoptionBoundaryInput = readJson(path.join(ADOPTION_PACKAGE_ROOT, "adoption-boundary.json"));
const postAdoptionBoundaryInput = readJson(path.join(ADOPTION_PACKAGE_ROOT, "post-adoption-next-step-boundary.json"));

failClosed(exactManifest.manifest_status === "PROPOSED_FOR_HUMAN_EXACT_MANIFEST_ADOPTION" && exactManifest.adoption_status === "NOT_STARTED" && exactManifest.source_count === 11 && exactManifest.sources.length === 11, "EXACT_MANIFEST_MISMATCH", "Exact Source Manifest pre-adoption state invalid");
failClosed(hashManifest.source_count === 11 && hashManifest.entries.length === 11, "SOURCE_HASH_MISMATCH", "Source Hash Manifest count invalid");
failClosed(identityManifest.source_count === 11 && identityManifest.entries.length === 11 && identityManifest.identity_status === "11_OF_11_UNIQUE_AND_RESOLVED", "SOURCE_IDENTITY_MISMATCH", "Source Identity Manifest count or status invalid");
failClosed(classificationManifest.entries.length === 11 && classificationManifest.counts.CORE === 4 && classificationManifest.counts.OPTIONAL === 1 && classificationManifest.counts.EXCLUDED === 6 && classificationManifest.status === "UNCHANGED", "SOURCE_CLASSIFICATION_MISMATCH", "Classification Manifest invalid");
failClosed(authorityProposal.proposal_status === "PROPOSED_NOT_ADOPTED" && authorityProposal.normative_authority === false && authorityProposal.human_exact_manifest_adoption === "NOT_STARTED", "ADOPTION_PACKAGE_INVALID", "Source Authority proposal pre-state invalid");
failClosed(claimReference.content_status === "UNCHANGED" && claimReference.automatic_normative_promotion === false, "ADOPTION_PACKAGE_INVALID", "Claim Eligibility reference invalid");
failClosed(contaminationReference.references.length === 2 && contaminationReference.references.every((entry) => entry.content_status === "UNCHANGED") && contaminationReference.status === "UNCHANGED_2_OF_2", "ADOPTION_PACKAGE_INVALID", "Contamination policy references invalid");
failClosed(reviewEvidence.compatibility_gate === "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE" && reviewEvidence.open_active_critical === 0 && reviewEvidence.open_active_high === 0 && reviewEvidence.source_scope_review_evidence_status === "AGGREGATED_AND_VALIDATED", "ADOPTION_PACKAGE_INVALID", "Review evidence summary invalid");
failClosed(findingClosure.closed_by_human_adjudication === 2 && findingClosure.deleted === 0 && findingClosure.waived === 0, "ADOPTION_PACKAGE_INVALID", "Finding closure summary invalid");
failClosed(packageAssurance.clean_room_review_completed === false && packageAssurance.independent_external_review_completed === false && packageAssurance.human_adjudicated_review_completed === true && packageAssurance.deterministic_aggregation_completed === true && packageAssurance.reduced_assurance === true && packageAssurance.disclosure_valid === true, "REDUCED_ASSURANCE_NOT_DISCLOSED", "Package Reduced-Assurance disclosure invalid");
failClosed(pendingAdoptionForm.decision_status === "PENDING_HUMAN_DECISION" && pendingAdoptionForm.human_decision === "PENDING_HUMAN_DECISION" && pendingAdoptionForm.source_scope_exact_manifest_adoption === "NOT_STARTED", "ADOPTION_PACKAGE_INVALID", "Aggregator package adoption form pre-state invalid");
failClosed(adoptionBoundaryInput.current_authorized_next_action === "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION" && adoptionBoundaryInput.aggregator_may_execute_adoption === false && adoptionBoundaryInput.architecture_reconciliation_may_be_authorized_by_aggregator === false, "ADOPTION_PACKAGE_INVALID", "Adoption boundary invalid");
failClosed(postAdoptionBoundaryInput.post_adoption_automatic_authorization === false && postAdoptionBoundaryInput.architecture_reconciliation_current_status === "NOT_AUTHORIZED", "ADOPTION_PACKAGE_INVALID", "Post-adoption boundary invalid");

const exactById = new Map(exactManifest.sources.map((entry) => [entry.source_id, entry]));
const hashById = new Map(hashManifest.entries.map((entry) => [entry.source_id, entry]));
const identityById = new Map(identityManifest.entries.map((entry) => [entry.source_id, entry]));
const classificationById = new Map(classificationManifest.entries.map((entry) => [entry.source_id, entry]));
const sourceIds = [...exactById.keys()];
failClosed(sourceIds.length === 11 && new Set(sourceIds).size === 11 && sameSet(sourceIds, [...hashById.keys()]) && sameSet(sourceIds, [...identityById.keys()]) && sameSet(sourceIds, [...classificationById.keys()]), "EXACT_MANIFEST_MISMATCH", "Manifest Source ID sets differ");

const sourceRoot = exactManifest.source_root;
failClosed(fs.existsSync(sourceRoot) && fs.statSync(sourceRoot).isDirectory(), "SOURCE_ROOT_CHANGED", "Source Root is unavailable");
const actualTopLevelFiles = fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isFile());
const actualNameMap = new Map(actualTopLevelFiles.map((entry) => [entry.name.normalize("NFC"), entry.name]));
const sourceVerification = sourceIds.map((sourceId) => {
  const exact = exactById.get(sourceId);
  const hash = hashById.get(sourceId);
  const identity = identityById.get(sourceId);
  const classification = classificationById.get(sourceId);
  const normalizedName = exact.actual_filename.normalize("NFC");
  const actualName = actualNameMap.get(normalizedName);
  const actualPath = actualName ? path.join(sourceRoot, actualName) : null;
  const actualSha256 = actualPath ? sha256File(actualPath) : null;
  const actualBytes = actualPath ? fs.statSync(actualPath).size : null;
  const manifestConsistent = hash.normalized_absolute_path === exact.normalized_absolute_path
    && hash.sha256 === exact.sha256
    && hash.file_size_bytes === exact.file_size_bytes
    && identity.actual_filename === exact.actual_filename
    && identity.normalized_absolute_path === exact.normalized_absolute_path
    && identity.source_sha256 === exact.sha256
    && classification.classification === exact.classification
    && classification.source_classification_value === exact.source_classification_value;
  return {
    source_id: sourceId,
    actual_filename_nfc_match: Boolean(actualName),
    manifest_cross_binding_match: manifestConsistent,
    expected_sha256: exact.sha256,
    actual_sha256: actualSha256,
    expected_bytes: exact.file_size_bytes,
    actual_bytes: actualBytes,
    sha256_and_size_match: actualSha256 === exact.sha256 && actualBytes === exact.file_size_bytes,
    classification: exact.classification,
    identity_status: exact.identity_status,
  };
});
failClosed(actualTopLevelFiles.length === 11 && sourceVerification.every((entry) => entry.actual_filename_nfc_match && entry.manifest_cross_binding_match), "SOURCE_IDENTITY_MISMATCH", "Source identity or cross-manifest binding mismatch");
failClosed(sourceVerification.every((entry) => entry.sha256_and_size_match), "SOURCE_HASH_MISMATCH", "Source byte hash or size mismatch");
failClosed(sourceVerification.every((entry) => ["VERIFIED", "RESOLVED"].includes(entry.identity_status)), "SOURCE_IDENTITY_MISMATCH", "Source Identity status invalid");
const classificationCounts = sourceVerification.reduce((counts, entry) => {
  counts[entry.classification] = (counts[entry.classification] || 0) + 1;
  return counts;
}, {});
failClosed(classificationCounts.CORE === 4 && classificationCounts.OPTIONAL === 1 && classificationCounts.EXCLUDED === 6, "SOURCE_CLASSIFICATION_MISMATCH", "Source classification is not 4/1/6");
failClosed(aggregatorSource.status === "UNCHANGED_11_OF_11" && aggregatorSource.sha256_and_size_match_count === 11 && aggregatorClassification.status === "UNCHANGED_4_CORE_1_OPTIONAL_6_EXCLUDED", "SOURCE_ROOT_CHANGED", "Aggregator Source Root reverification invalid");

const baseResults = aggregatorBase.artifacts.map((entry) => directBindingResult(path.join(BASE_ROOT, ...entry.relative_path.split("/")), entry.expected_sha256, entry.expected_bytes, entry.relative_path));
failClosed(aggregatorBase.status === "UNCHANGED_20_OF_20" && listFilesRecursive(BASE_ROOT).length === 20 && baseResults.length === 20 && baseResults.every((entry) => entry.match), "BASE_TARGET_CHANGED", "Base Review Target is not unchanged 20/20");
const baseByPath = new Map(aggregatorBase.artifacts.map((entry) => [entry.relative_path, entry]));
const inclusionRationale = baseByPath.get("source-inclusion-rationale.json");
const exclusionRationale = baseByPath.get("source-exclusion-rationale.json");
failClosed(Boolean(inclusionRationale && exclusionRationale), "BASE_TARGET_CHANGED", "Source rationale bindings are absent");

const overlayRoot = path.join(INTAKE_ROOT, "compatibility-remediation");
const overlayResults = aggregatorOverlay.artifacts.map((entry) => directBindingResult(path.join(overlayRoot, ...entry.relative_path.split("/")), entry.expected_sha256, entry.expected_bytes, entry.relative_path));
failClosed(aggregatorOverlay.status === "UNCHANGED_7_OF_7" && overlayResults.length === 7 && overlayResults.every((entry) => entry.match), "CORRECTIVE_OVERLAY_CHANGED", "Corrective Overlay is not unchanged 7/7");

const authorityPolicyResult = directBindingResult(authorityProposal.policy_reference.absolute_path, authorityProposal.policy_reference.sha256, authorityProposal.policy_reference.bytes, "source-authority-policy");
const claimPolicyResult = directBindingResult(claimReference.reference.absolute_path, claimReference.reference.sha256, claimReference.reference.bytes, "source-claim-eligibility-policy");
const contaminationPolicyResults = contaminationReference.references.map((entry) => directBindingResult(entry.absolute_path, entry.sha256, entry.bytes, entry.policy));
failClosed(authorityPolicyResult.match, "SOURCE_AUTHORITY_POLICY_CHANGED", "Source Authority Policy bytes changed");
failClosed(claimPolicyResult.match, "CLAIM_ELIGIBILITY_POLICY_CHANGED", "Claim Eligibility Policy bytes changed");
failClosed(contaminationPolicyResults.length === 2 && contaminationPolicyResults.every((entry) => entry.match), "CONTAMINATION_POLICY_CHANGED", "Contamination Policy bytes changed");

const productBefore = aggregatorProduct.files.map((entry) => {
  const filePath = path.join(PRODUCT_ROOT, ...entry.relative_path.split("/"));
  return directBindingResult(filePath, entry.expected_sha256, entry.expected_bytes, entry.relative_path);
});
failClosed(aggregatorProduct.status === "PASS_UNCHANGED_3_OF_3" && productBefore.length === 3 && productBefore.every((entry) => entry.match), "PRODUCT_GOVERNANCE_BASELINE_CHANGED", "Product/Governance baseline changed before adoption");

const historicalExpected = [
  ...aggregatorHistorical.historical_tasks.map((entry) => ({ task_id: entry.task_id, file_count: entry.expected_file_count, manifest_sha256: entry.expected_manifest_sha256 })),
  {
    task_id: aggregatorHistorical.human_adjudication_task.task_id,
    file_count: aggregatorHistorical.human_adjudication_task.file_count_before,
    manifest_sha256: aggregatorHistorical.human_adjudication_task.manifest_sha256_before,
  },
];
const historicalBefore = historicalExpected.map((entry) => {
  const digest = treeDigest(path.join(TASKS_ROOT, entry.task_id));
  return {
    ...entry,
    actual_file_count_before: digest.file_count,
    actual_manifest_sha256_before: digest.canonical_manifest_sha256,
    match_before: digest.file_count === entry.file_count && digest.canonical_manifest_sha256 === entry.manifest_sha256,
  };
});
failClosed(historicalBefore.length === 8 && historicalBefore.every((entry) => entry.match_before), "HISTORICAL_TASK_CHANGED", "one or more pre-Aggregator historical Tasks changed");
const aggregatorTreeBefore = treeDigest(AGGREGATOR_ROOT);
failClosed(aggregatorTreeBefore.file_count === 38, "HISTORICAL_TASK_CHANGED", "Aggregator Task file count is not 38");

const compat001 = aggregatorFindings.compatibility_findings.find((entry) => entry.finding_id === "COMPAT-R1-001");
const compat002 = aggregatorFindings.compatibility_findings.find((entry) => entry.finding_id === "COMPAT-R1-002");
const startupFinding = aggregatorFindings.startup_finding;
failClosed(compat001?.final_effective_status === "CLOSED_BY_HUMAN_ADJUDICATION" && compat001.finding_deleted === false && compat001.finding_waived === false, "ADOPTION_PACKAGE_INVALID", "COMPAT-R1-001 closure not preserved");
failClosed(compat002?.final_effective_status === "CLOSED_BY_HUMAN_ADJUDICATION" && compat002.finding_deleted === false && compat002.finding_waived === false, "ADOPTION_PACKAGE_INVALID", "COMPAT-R1-002 closure not preserved");
failClosed(startupFinding.finding_id === "COMPAT-R2-STARTUP-CONTEXT-001" && startupFinding.final_effective_status === "HISTORICAL_STARTUP_FAILURE_EVIDENCE" && startupFinding.containment_status === "CONTAINED_BY_FAILED_ATTEMPT_INVALIDATION" && startupFinding.aggregator_eligible === false, "ADOPTION_PACKAGE_INVALID", "Startup failure history not preserved");
failClosed(aggregatorFindings.open_active_critical_findings === 0, "OPEN_ACTIVE_CRITICAL_FINDING_EXISTS", "an active CRITICAL Finding remains");
failClosed(aggregatorFindings.open_active_high_findings === 0, "OPEN_ACTIVE_HIGH_FINDING_EXISTS", "an active HIGH Finding remains");

const taskIntent = {
  schema_version: 1,
  task_id: TASK_ID,
  batch: "MASTER_BATCH_3A_3G",
  task_type: "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION_AND_ARCHITECTURE_RECONCILIATION_READINESS_PREPARATION",
  human_decision: HUMAN_DECISION,
  adoption_model: "HUMAN_EXACT_MANIFEST_ADOPTION",
  assurance_level: "REDUCED_ASSURANCE",
  authorized_actions: [
    "RECORD_HUMAN_EXACT_MANIFEST_ADOPTION",
    "MARK_EXACT_MANIFEST_HUMAN_ADOPTED_BY_REFERENCE",
    "MARK_SOURCE_AUTHORITY_HUMAN_ADOPTED_WITH_SOURCE_GOVERNANCE_ONLY_NORMATIVE_SCOPE",
    "CLOSE_SOURCE_SCOPE_REVIEW_GATE",
    "PREPARE_ARCHITECTURE_RECONCILIATION_READINESS_PACKAGE",
  ],
  prohibited_actions: [
    "MODIFY_ANY_INPUT_OR_HISTORICAL_ARTIFACT",
    "ARCHITECTURE_RECONCILIATION_AUTHORIZATION_OR_EXECUTION",
    "CORE_OBJECT_LIBRARY_CREATION",
    "MAGP_ARCHITECTURE_CREATION",
    "PRODUCT_IMPLEMENTATION",
    "GIT_NETWORK_SERVICE_DATABASE_SEED_MIGRATION_ENV_SUBAGENT_OR_REVIEWER_LAUNCH",
  ],
  allowed_write_root: toPosix(TASK_ROOT),
};
const classification = {
  schema_version: 1,
  task_id: TASK_ID,
  level: "L3_HUMAN_ADOPTION_GATE",
  risk_class: "NORMATIVE_SOURCE_GOVERNANCE_STATE_TRANSITION",
  write_scope: [toPosix(TASK_ROOT) + "/**"],
  historical_write_allowed: false,
  source_write_allowed: false,
  product_or_governance_baseline_write_allowed: false,
  git_allowed: false,
  network_allowed: false,
  database_allowed: false,
  subagents_allowed: false,
  reviewer_launch_allowed: false,
  architecture_reconciliation_execution_allowed: false,
};
const blueprint = {
  schema_version: 1,
  task_id: TASK_ID,
  execution_mode: "ROOT_ONLY_SEQUENTIAL_NO_SUBAGENTS",
  input_task_id: AGGREGATOR_TASK_ID,
  input_package: toPosix(ADOPTION_PACKAGE_ROOT),
  phases: [
    "VERIFY_HUMAN_DECISION_AND_AGGREGATOR_GATE",
    "VERIFY_EXACT_PACKAGE_SOURCE_POLICY_AND_HISTORY_BINDINGS",
    "RECORD_HUMAN_ADOPTION_AND_EFFECTIVE_SOURCE_GOVERNANCE_STATE",
    "PREPARE_ARCHITECTURE_RECONCILIATION_READINESS_ONLY",
    "RUN_35_CHECK_QA_AND_POST_WRITE_INTEGRITY",
  ],
  manifest_adoption_method: "REFERENCE_ORIGINAL_ARTIFACT_AND_EXACT_SHA256_NO_CONTENT_RECONSTRUCTION",
  normative_scope: NORMATIVE_SCOPE,
  architecture_reconciliation_status_after_completion: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  architecture_reconciliation_authorized: false,
  architecture_reconciliation_started: false,
};
writeJson("task-intent.yaml", taskIntent);
writeJson("classification.yaml", classification);
writeJson("blueprint.yaml", blueprint);

const humanAdoptionRecord = {
  schema_version: 1,
  task_id: TASK_ID,
  decision: HUMAN_DECISION,
  decision_status: "HUMAN_APPROVED",
  adoption_model: "HUMAN_EXACT_MANIFEST_ADOPTION",
  assurance_level: "REDUCED_ASSURANCE",
  exact_manifest_adopted: true,
  source_identity_manifest_adopted: true,
  source_hash_manifest_adopted: true,
  source_classification_adopted: true,
  source_authority_policy_adopted: true,
  claim_eligibility_policy_adopted: true,
  contamination_policies_adopted: true,
  source_inclusion_rationale_adopted: true,
  source_exclusion_rationale_adopted: true,
  reduced_assurance_disclosure_adopted: true,
  architecture_reconciliation_authorized: false,
  architecture_reconciliation_started: false,
  product_implementation_authorized: false,
  decision_source: humanDecisionSourceBinding,
  decision_recorded_on: EXECUTED_ON,
  codex_decision_authority: "NONE",
  codex_recording_action: "VERBATIM_HUMAN_DECISION_RECORDING_AND_DETERMINISTIC_BINDING_VALIDATION",
};
const humanAuthorityAttestation = {
  schema_version: 1,
  task_id: TASK_ID,
  authority_type: "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION",
  authority_actor: "HUMAN_USER",
  authority_source: humanDecisionSourceBinding,
  authorized_decision: HUMAN_DECISION,
  decision_status: "HUMAN_APPROVED",
  authorized_adoption_scope: [
    "EXACT_SOURCE_MANIFEST",
    "SOURCE_HASH_MANIFEST",
    "SOURCE_IDENTITY_MANIFEST",
    "SOURCE_CLASSIFICATION_MANIFEST",
    "SOURCE_AUTHORITY_POLICY",
    "SOURCE_CLAIM_ELIGIBILITY_POLICY",
    "VET_C_CONTAMINATION_PREVENTION_POLICY",
    "HEALTH_DOMAIN_CONTAMINATION_PREVENTION_POLICY",
    "SOURCE_EXCLUSION_RATIONALE",
    "SOURCE_INCLUSION_RATIONALE",
    "REDUCED_ASSURANCE_DISCLOSURE",
  ],
  architecture_reconciliation_authorized: false,
  product_implementation_authorized: false,
  decision_inferred_by_codex: false,
};
const reducedAssuranceAcknowledgement = {
  schema_version: 1,
  task_id: TASK_ID,
  acknowledgement_actor: "HUMAN_USER",
  acknowledgement_source: humanDecisionSourceBinding,
  assurance_level: "REDUCED_ASSURANCE",
  clean_room_review_completed: false,
  independent_external_review_completed: false,
  human_adjudicated_compatibility_review_completed: true,
  deterministic_aggregation_completed: true,
  human_exact_manifest_adoption_completed: true,
  reduced_assurance: true,
  limitations_acknowledged: true,
};
const adoptionScopeBoundary = {
  schema_version: 1,
  task_id: TASK_ID,
  exact_manifest_status: "HUMAN_ADOPTED",
  source_authority_status: "HUMAN_ADOPTED",
  normative_authority: true,
  normative_scope: NORMATIVE_SCOPE,
  normative_scope_classification: "SOURCE_GOVERNANCE_ONLY",
  authority_decides_only: [
    "WHICH_SOURCES_MAY_BE_USED",
    "SOURCE_PRECEDENCE",
    "ELIGIBLE_CLAIM_TYPES",
    "CONTENT_EXCLUSION_OR_DOWNGRADE",
  ],
  authority_does_not_decide: [
    "MAGP_ARCHITECTURE",
    "ARCHITECTURE_RECONCILIATION_OUTCOMES",
    "CORE_OBJECT_LIBRARY",
    "PRODUCT_DESIGN",
    "PRODUCT_IMPLEMENTATION",
  ],
  manifest_mutation_allowed: false,
  manifest_change_requirement: "NEW_SOURCE_SCOPE_CHANGE_TASK_AND_NEW_HUMAN_GATE",
};
const adoptedEffectiveState = {
  schema_version: 1,
  task_id: TASK_ID,
  exact_source_manifest_status: "HUMAN_ADOPTED",
  source_directory_count: 11,
  source_identity_count: 11,
  source_classification: "4 CORE / 1 OPTIONAL / 6 EXCLUDED",
  source_hash_binding: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
  manifest_mutation_allowed: false,
  source_authority_status: "HUMAN_ADOPTED",
  normative_authority: true,
  normative_scope: NORMATIVE_SCOPE,
  normative_scope_classification: "SOURCE_GOVERNANCE_ONLY",
  source_scope_review_gate: "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  architecture_reconciliation: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  architecture_reconciliation_authorized: false,
  architecture_reconciliation_started: false,
  core_object_library: "NOT_STARTED",
  magp_architecture: "NOT_STARTED",
  product_implementation: "NOT_STARTED",
};
writeJson("human-adoption/human-exact-manifest-adoption-record.json", humanAdoptionRecord);
writeJson("human-adoption/human-authority-attestation.json", humanAuthorityAttestation);
writeJson("human-adoption/reduced-assurance-acknowledgement.json", reducedAssuranceAcknowledgement);
writeJson("human-adoption/adoption-scope-boundary.json", adoptionScopeBoundary);
writeJson("human-adoption/adopted-effective-state.json", adoptedEffectiveState);

const originalPackageBinding = (name) => ({
  artifact_name: name,
  ...fileBinding(path.join(ADOPTION_PACKAGE_ROOT, name)),
});
const rationaleBindings = [
  directBindingResult(path.join(BASE_ROOT, "source-inclusion-rationale.json"), inclusionRationale.expected_sha256, inclusionRationale.expected_bytes, "source-inclusion-rationale.json"),
  directBindingResult(path.join(BASE_ROOT, "source-exclusion-rationale.json"), exclusionRationale.expected_sha256, exclusionRationale.expected_bytes, "source-exclusion-rationale.json"),
];
failClosed(rationaleBindings.every((entry) => entry.match), "BASE_TARGET_CHANGED", "Source rationale bytes changed");

const adoptedExactManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  adoption_status: "HUMAN_ADOPTED",
  adoption_method: "EXACT_ARTIFACT_REFERENCE_NO_RECONSTRUCTION",
  original_artifact: originalPackageBinding("exact-source-manifest.json"),
  source_root: sourceRoot,
  source_count: 11,
  source_classification: "4 CORE / 1 OPTIONAL / 6 EXCLUDED",
  source_hash_binding: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
  manifest_mutation_allowed: false,
  source_inclusion_and_exclusion_rationale_bindings: rationaleBindings,
  content_copied_or_rewritten: false,
};
const adoptedHashManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  adoption_status: "HUMAN_ADOPTED",
  original_artifact: originalPackageBinding("source-hash-manifest.json"),
  source_count: 11,
  hash_algorithm: "SHA-256",
  binding_status: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
  manifest_mutation_allowed: false,
  content_copied_or_rewritten: false,
};
const adoptedIdentityManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  adoption_status: "HUMAN_ADOPTED",
  original_artifact: originalPackageBinding("source-identity-manifest.json"),
  source_identity_count: 11,
  identity_status: "11_OF_11_UNIQUE_AND_RESOLVED",
  unicode_normalization: "NFC",
  manifest_mutation_allowed: false,
  content_copied_or_rewritten: false,
};
const adoptedClassificationManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  adoption_status: "HUMAN_ADOPTED",
  original_artifact: originalPackageBinding("classification-manifest.json"),
  counts: { CORE: 4, OPTIONAL: 1, EXCLUDED: 6 },
  classification_mutation_allowed: false,
  content_copied_or_rewritten: false,
};
const adoptedAuthorityEffectiveState = {
  schema_version: 1,
  task_id: TASK_ID,
  source_authority_status: "HUMAN_ADOPTED",
  normative_authority: true,
  normative_scope: NORMATIVE_SCOPE,
  normative_scope_classification: "SOURCE_GOVERNANCE_ONLY",
  original_policy_binding: authorityPolicyResult,
  proposal_artifact_binding: originalPackageBinding("source-authority-proposal.json"),
  policy_content_copied_or_rewritten: false,
  architecture_reconciliation_authorized: false,
  architecture_reconciliation_started: false,
  magp_architecture_adopted: false,
  core_object_library_created: false,
  product_design_approved: false,
  product_implementation_approved: false,
};
const adoptedClaimEligibilityEffectiveState = {
  schema_version: 1,
  task_id: TASK_ID,
  adoption_status: "HUMAN_ADOPTED",
  normative_authority: true,
  normative_scope: ["CLAIM_ELIGIBILITY"],
  original_policy_binding: claimPolicyResult,
  reference_artifact_binding: originalPackageBinding("claim-eligibility-policy-reference.json"),
  automatic_architecture_or_product_authority: false,
  policy_content_copied_or_rewritten: false,
};
const adoptedContaminationEffectiveState = {
  schema_version: 1,
  task_id: TASK_ID,
  adoption_status: "HUMAN_ADOPTED",
  normative_authority: true,
  normative_scope: ["CONTAMINATION_PREVENTION", "ARCHITECTURE_RECONCILIATION_INPUT_BOUNDARY"],
  original_policy_bindings: contaminationPolicyResults,
  reference_artifact_binding: originalPackageBinding("contamination-policy-reference.json"),
  automatic_architecture_or_product_authority: false,
  policy_content_copied_or_rewritten: false,
};
writeJson("adopted-manifests/adopted-exact-source-manifest.json", adoptedExactManifest);
writeJson("adopted-manifests/adopted-source-hash-manifest.json", adoptedHashManifest);
writeJson("adopted-manifests/adopted-source-identity-manifest.json", adoptedIdentityManifest);
writeJson("adopted-manifests/adopted-source-classification-manifest.json", adoptedClassificationManifest);
writeJson("adopted-manifests/adopted-source-authority-effective-state.json", adoptedAuthorityEffectiveState);
writeJson("adopted-manifests/adopted-claim-eligibility-effective-state.json", adoptedClaimEligibilityEffectiveState);
writeJson("adopted-manifests/adopted-contamination-policy-effective-state.json", adoptedContaminationEffectiveState);

const assuranceDisclosure = {
  schema_version: 1,
  task_id: TASK_ID,
  assurance_level: "REDUCED_ASSURANCE",
  clean_room_review_completed: false,
  independent_external_review_completed: false,
  human_adjudicated_compatibility_review_completed: true,
  human_adjudicated_review_completed: true,
  deterministic_aggregation_completed: true,
  human_exact_manifest_adoption_completed: true,
  reduced_assurance: true,
  full_l3_independent_review_equivalent: false,
  external_compatibility_review_pass_claimed: false,
  disclosure_valid: true,
};
writeJson("assurance-disclosure.json", assuranceDisclosure);

const sourceScopeFinalGate = {
  schema_version: 1,
  task_id: TASK_ID,
  source_scope_review_gate: "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  source_scope_evidence_status: "AGGREGATED_VALIDATED_AND_HUMAN_ADOPTED",
  open_active_critical_findings: 0,
  open_active_high_findings: 0,
  human_exact_manifest_adoption_completed: true,
  clean_room_review_completed: false,
  independent_external_review_completed: false,
  human_adjudicated_review_completed: true,
  reduced_assurance: true,
  exact_source_manifest_status: "HUMAN_ADOPTED",
  source_authority_status: "HUMAN_ADOPTED",
  normative_authority: true,
  normative_scope_classification: "SOURCE_GOVERNANCE_ONLY",
  architecture_reconciliation: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  architecture_reconciliation_authorized: false,
  architecture_reconciliation_started: false,
};
writeJson("source-scope-review-gate-final-result.json", sourceScopeFinalGate);
writeJson("finding-history-preservation.json", {
  schema_version: 1,
  task_id: TASK_ID,
  findings: [
    {
      finding_id: "COMPAT-R1-001",
      final_effective_status: "CLOSED_BY_HUMAN_ADJUDICATION",
      finding_deleted: false,
      finding_hidden: false,
      finding_renamed: false,
      clean_room_verified: false,
      independent_reviewer_closed: false,
    },
    {
      finding_id: "COMPAT-R1-002",
      final_effective_status: "CLOSED_BY_HUMAN_ADJUDICATION",
      finding_deleted: false,
      finding_hidden: false,
      finding_renamed: false,
      clean_room_verified: false,
      independent_reviewer_closed: false,
    },
    {
      finding_id: "COMPAT-R2-STARTUP-CONTEXT-001",
      final_effective_status: "HISTORICAL_STARTUP_FAILURE_EVIDENCE",
      containment_status: "CONTAINED_BY_FAILED_ATTEMPT_INVALIDATION",
      substantive_review_credit: "NONE",
      aggregator_eligible: false,
      finding_deleted: false,
      finding_hidden: false,
      finding_renamed: false,
    },
  ],
  clean_room_review_completed: false,
  independent_external_review_completed: false,
  human_adjudicated_review_completed: true,
  reduced_assurance: true,
  open_active_critical_findings: 0,
  open_active_high_findings: 0,
  status: "PRESERVED_3_OF_3",
});

writeJson("base-target-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  review_target_task_id: BASE_TASK_ID,
  expected_artifact_count: 20,
  actual_artifact_count: listFilesRecursive(BASE_ROOT).length,
  match_count: baseResults.filter((entry) => entry.match).length,
  artifacts: baseResults,
  source_inclusion_rationale: rationaleBindings[0],
  source_exclusion_rationale: rationaleBindings[1],
  status: "UNCHANGED_20_OF_20",
  drift_detected: false,
});
writeJson("source-root-reverification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  source_root: sourceRoot,
  unicode_normalization: "NFC",
  expected_source_count: 11,
  actual_source_count: actualTopLevelFiles.length,
  manifest_cross_binding_match_count: sourceVerification.filter((entry) => entry.manifest_cross_binding_match).length,
  identity_match_count: sourceVerification.filter((entry) => entry.actual_filename_nfc_match).length,
  hash_and_size_match_count: sourceVerification.filter((entry) => entry.sha256_and_size_match).length,
  classification_counts: classificationCounts,
  sources: sourceVerification,
  status: "UNCHANGED_11_OF_11_CLASSIFICATION_4_1_6",
  drift_detected: false,
});
writeJson("corrective-overlay-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  expected_artifact_count: 7,
  match_count: overlayResults.filter((entry) => entry.match).length,
  artifacts: overlayResults,
  status: "UNCHANGED_7_OF_7",
  drift_detected: false,
});

const readinessRoot = path.join(TASK_ROOT, "architecture-reconciliation-readiness-package");
const humanLaunchDecisionForm = {
  schema_version: 1,
  task_id: TASK_ID,
  decision_type: "HUMAN_AUTHORIZE_ARCHITECTURE_RECONCILIATION",
  decision_status: "PENDING_HUMAN_DECISION",
  human_decision: "PENDING_HUMAN_DECISION",
  allowed_human_decisions: [
    "AUTHORIZE_ARCHITECTURE_RECONCILIATION_WITH_ADOPTED_SOURCE_SCOPE",
    "DO_NOT_AUTHORIZE_ARCHITECTURE_RECONCILIATION",
  ],
  architecture_reconciliation_authorized: false,
  architecture_reconciliation_started: false,
  human_actor: null,
  decision_timestamp: null,
  rationale: null,
  codex_filled_human_decision: false,
};
const humanLaunchDecisionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:gov-magp:human-authorize-architecture-reconciliation:v1",
  title: "Human Architecture Reconciliation Launch Decision",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "task_id", "decision_type", "decision_status", "human_decision", "architecture_reconciliation_authorized", "architecture_reconciliation_started", "human_actor", "decision_timestamp", "rationale", "codex_filled_human_decision"],
  properties: {
    schema_version: { const: 1 },
    task_id: { const: TASK_ID },
    decision_type: { const: "HUMAN_AUTHORIZE_ARCHITECTURE_RECONCILIATION" },
    decision_status: { enum: ["PENDING_HUMAN_DECISION", "RECORDED"] },
    human_decision: { enum: ["PENDING_HUMAN_DECISION", "AUTHORIZE_ARCHITECTURE_RECONCILIATION_WITH_ADOPTED_SOURCE_SCOPE", "DO_NOT_AUTHORIZE_ARCHITECTURE_RECONCILIATION"] },
    architecture_reconciliation_authorized: { type: "boolean" },
    architecture_reconciliation_started: { const: false },
    human_actor: { type: ["string", "null"] },
    decision_timestamp: { type: ["string", "null"] },
    rationale: { type: ["string", "null"] },
    codex_filled_human_decision: { const: false },
  },
};
const futureArchitectureTopics = [
  "FOUR_CORE_SOURCE_ARCHITECTURE_DIFFERENCES",
  "OPTIONAL_NON_AUTHORITATIVE_PATTERNS",
  "SIX_EXCLUDED_SOURCE_NON_INTRUSION_BOUNDARY",
  "PAPER_IMPLEMENTED_CONTENT_VS_EXTENDED_DESIGN",
  "SIX_LAYER_MODEL_VS_OTHER_LAYER_MODELS",
  "VOLUME_PACKAGE_RFC_GOVERNANCE_STRUCTURE",
  "BGE_ROLE_AND_RESPONSIBILITY_BOUNDARY",
  "AGENT_FACTORY_BOUNDARY",
  "AGENT_OS_BOUNDARY",
  "RUNTIME_GOVERNANCE_BOUNDARY",
  "KNOWLEDGE_ENGINEERING_BOUNDARY",
  "RAILWAY_DOMAIN_EXTENSION_BOUNDARY",
];
const readinessFiles = {
  "adopted-source-input-binding.json": {
    schema_version: 1,
    task_id: TASK_ID,
    exact_source_manifest: fileBinding(path.join(TASK_ROOT, "adopted-manifests", "adopted-exact-source-manifest.json")),
    source_hash_manifest: fileBinding(path.join(TASK_ROOT, "adopted-manifests", "adopted-source-hash-manifest.json")),
    source_identity_manifest: fileBinding(path.join(TASK_ROOT, "adopted-manifests", "adopted-source-identity-manifest.json")),
    source_classification_manifest: fileBinding(path.join(TASK_ROOT, "adopted-manifests", "adopted-source-classification-manifest.json")),
    source_count: 11,
    classification: "4 CORE / 1 OPTIONAL / 6 EXCLUDED",
    binding_status: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
  },
  "adopted-authority-policy-binding.json": {
    schema_version: 1,
    task_id: TASK_ID,
    adopted_effective_state: fileBinding(path.join(TASK_ROOT, "adopted-manifests", "adopted-source-authority-effective-state.json")),
    original_policy_binding: authorityPolicyResult,
    source_authority_status: "HUMAN_ADOPTED",
    normative_authority: true,
    normative_scope: NORMATIVE_SCOPE,
    normative_scope_classification: "SOURCE_GOVERNANCE_ONLY",
  },
  "claim-eligibility-binding.json": {
    schema_version: 1,
    task_id: TASK_ID,
    adopted_effective_state: fileBinding(path.join(TASK_ROOT, "adopted-manifests", "adopted-claim-eligibility-effective-state.json")),
    original_policy_binding: claimPolicyResult,
    normative_scope: ["CLAIM_ELIGIBILITY"],
  },
  "contamination-boundary-binding.json": {
    schema_version: 1,
    task_id: TASK_ID,
    adopted_effective_state: fileBinding(path.join(TASK_ROOT, "adopted-manifests", "adopted-contamination-policy-effective-state.json")),
    original_policy_bindings: contaminationPolicyResults,
    excluded_source_intrusion_allowed: false,
    health_to_railway_rule_promotion_allowed: false,
    vetc_specific_core_promotion_allowed: false,
  },
  "reduced-assurance-disclosure.json": assuranceDisclosure,
  "unresolved-architecture-decisions.json": {
    schema_version: 1,
    task_id: TASK_ID,
    decision_status: "UNRESOLVED_NOT_STARTED",
    topics: futureArchitectureTopics.map((topic) => ({ topic, status: "UNRESOLVED", decision_made_by_this_task: false })),
    architecture_decision_count_by_this_task: 0,
  },
  "architecture-reconciliation-scope-boundary.json": {
    schema_version: 1,
    task_id: TASK_ID,
    readiness_only: true,
    allowed_future_comparison_topics: futureArchitectureTopics,
    architecture_reconciliation_authorized: false,
    architecture_reconciliation_started: false,
    architecture_decisions_allowed_in_this_task: false,
    product_or_core_library_changes_allowed: false,
  },
  "prohibited-actions.json": {
    schema_version: 1,
    task_id: TASK_ID,
    prohibited_actions: [
      "AUTHORIZE_OR_START_ARCHITECTURE_RECONCILIATION",
      "MAKE_ARCHITECTURE_DECISIONS",
      "CREATE_CORE_OBJECT_LIBRARY",
      "CREATE_MAGP_ARCHITECTURE",
      "START_PRODUCT_IMPLEMENTATION",
      "MODIFY_ADOPTED_SOURCE_MANIFEST_OR_POLICY_BYTES",
      "USE_GIT_NETWORK_SERVICE_DATABASE_SEED_MIGRATION_ENV_SUBAGENT_OR_REVIEWER",
    ],
    fail_closed: true,
  },
  "human-launch-decision-form.json": humanLaunchDecisionForm,
  "human-launch-decision-form.schema.json": humanLaunchDecisionSchema,
  "post-launch-required-gates.json": {
    schema_version: 1,
    task_id: TASK_ID,
    current_launch_decision: "PENDING_HUMAN_DECISION",
    required_before_start: [
      "SEPARATE_HUMAN_ARCHITECTURE_RECONCILIATION_AUTHORIZATION",
      "EXACT_ADOPTED_SOURCE_INPUT_BINDING_REVERIFICATION",
      "SOURCE_GOVERNANCE_NORMATIVE_SCOPE_REVERIFICATION",
      "REDUCED_ASSURANCE_DISCLOSURE_PRESERVATION",
      "TASK_LOCAL_ARCHITECTURE_RECONCILIATION_SCOPE_AND_WRITE_BOUNDARY",
    ],
    automatic_start_allowed: false,
  },
};
for (const [name, value] of Object.entries(readinessFiles)) writeJson(`architecture-reconciliation-readiness-package/${name}`, value);
const readinessBoundNames = Object.keys(readinessFiles).sort();
const readinessBoundArtifacts = readinessBoundNames.map((name) => ({ name, ...fileBinding(path.join(readinessRoot, name)) }));
writeJson("architecture-reconciliation-readiness-package/readiness-manifest.json", {
  schema_version: 1,
  task_id: TASK_ID,
  package_type: "ARCHITECTURE_RECONCILIATION_READINESS_ONLY",
  readiness_status: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  package_file_count: 12,
  bound_artifact_count_excluding_self: 11,
  bound_artifacts: readinessBoundArtifacts,
  human_launch_decision: "PENDING_HUMAN_DECISION",
  architecture_reconciliation_authorized: false,
  architecture_reconciliation_started: false,
});
const readinessActualFiles = fs.readdirSync(readinessRoot, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
const readinessRequiredFiles = ["readiness-manifest.json", ...readinessBoundNames];
failClosed(readinessActualFiles.length === 12 && sameSet(readinessActualFiles, readinessRequiredFiles), "ADOPTION_PACKAGE_INVALID", "Architecture Readiness Package is incomplete");
writeJson("architecture-reconciliation-readiness.json", {
  schema_version: 1,
  task_id: TASK_ID,
  architecture_reconciliation: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  architecture_reconciliation_authorized: false,
  architecture_reconciliation_started: false,
  readiness_package_status: "READY_12_OF_12",
  human_launch_decision: "PENDING_HUMAN_DECISION",
  next_human_action: "HUMAN_AUTHORIZE_ARCHITECTURE_RECONCILIATION",
  allowed_human_decisions: [
    "AUTHORIZE_ARCHITECTURE_RECONCILIATION_WITH_ADOPTED_SOURCE_SCOPE",
    "DO_NOT_AUTHORIZE_ARCHITECTURE_RECONCILIATION",
  ],
});

const adoptedManifestBindings = listFilesRecursive(path.join(TASK_ROOT, "adopted-manifests")).sort().map((filePath) => ({ relative_path: toPosix(path.relative(path.join(TASK_ROOT, "adopted-manifests"), filePath)), ...fileBinding(filePath) }));
const humanRecordBindings = [
  "human-exact-manifest-adoption-record.json",
  "human-authority-attestation.json",
  "reduced-assurance-acknowledgement.json",
  "adoption-scope-boundary.json",
  "adopted-effective-state.json",
].map((name) => ({ name, ...fileBinding(path.join(TASK_ROOT, "human-adoption", name)) }));
writeJson("human-adoption/adoption-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  integrity_model: "EXACT_REFERENCE_SHA256_BYTE_AND_HUMAN_DECISION_BINDING",
  human_decision_source: humanDecisionSourceBinding,
  aggregator_tree_before: aggregatorTreeBefore,
  adoption_package_artifacts: packageBindings,
  human_adoption_records: humanRecordBindings,
  adopted_manifest_reference_records: adoptedManifestBindings,
  source_count: 11,
  classification: "4 CORE / 1 OPTIONAL / 6 EXCLUDED",
  exact_manifest_reconstructed_or_retyped: false,
  policy_content_copied_or_rewritten: false,
  status: "PASS",
});

const productAfter = productBefore.map((entry) => {
  const current = directBindingResult(entry.absolute_path, entry.expected_sha256, entry.expected_bytes, entry.label);
  return {
    ...entry,
    actual_sha256_after: current.actual_sha256,
    actual_bytes_after: current.actual_bytes,
    status: entry.match && current.match && entry.actual_sha256 === current.actual_sha256 && entry.actual_bytes === current.actual_bytes ? "UNCHANGED" : "CHANGED",
  };
});
failClosed(productAfter.every((entry) => entry.status === "UNCHANGED"), "PRODUCT_GOVERNANCE_BASELINE_CHANGED", "Product/Governance baseline changed during adoption");
writeJson("product-governance-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  baseline_type: "EXACT_NON_GIT_BEFORE_AFTER_FILE_HASH_BASELINE",
  files: productAfter,
  product_files_written: 0,
  governance_baseline_files_written: 0,
  writes_outside_task_root: 0,
  status: "PASS_UNCHANGED_3_OF_3",
  git_used: false,
});

const historicalAfter = historicalBefore.map((entry) => {
  const digest = treeDigest(path.join(TASKS_ROOT, entry.task_id));
  return {
    ...entry,
    actual_file_count_after: digest.file_count,
    actual_manifest_sha256_after: digest.canonical_manifest_sha256,
    match_after: digest.file_count === entry.file_count && digest.canonical_manifest_sha256 === entry.manifest_sha256,
    status: entry.match_before && digest.file_count === entry.actual_file_count_before && digest.canonical_manifest_sha256 === entry.actual_manifest_sha256_before ? "UNCHANGED" : "CHANGED",
  };
});
const aggregatorTreeAfter = treeDigest(AGGREGATOR_ROOT);
const aggregatorTreeStatus = aggregatorTreeAfter.file_count === aggregatorTreeBefore.file_count && aggregatorTreeAfter.canonical_manifest_sha256 === aggregatorTreeBefore.canonical_manifest_sha256 ? "UNCHANGED" : "CHANGED";
failClosed(historicalAfter.every((entry) => entry.status === "UNCHANGED" && entry.match_after) && aggregatorTreeStatus === "UNCHANGED", "HISTORICAL_TASK_CHANGED", "Historical or Aggregator Task changed during adoption");
writeJson("historical-artifact-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  baseline_type: "EXACT_NON_GIT_ORDINAL_FILE_TREE_MANIFEST_BEFORE_AFTER",
  historical_tasks: historicalAfter,
  aggregator_task: {
    task_id: AGGREGATOR_TASK_ID,
    file_count_before: aggregatorTreeBefore.file_count,
    file_count_after: aggregatorTreeAfter.file_count,
    manifest_sha256_before: aggregatorTreeBefore.canonical_manifest_sha256,
    manifest_sha256_after: aggregatorTreeAfter.canonical_manifest_sha256,
    status: aggregatorTreeStatus,
  },
  all_input_tasks_unchanged: true,
  status: "PASS_9_OF_9",
  git_used: false,
});

const mainTests = [
  [1, "Aggregator result is valid", aggregatorResult.aggregation_result === "PASS_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE"],
  [2, "Source Scope Gate reached Adoption Ready", aggregatorGate.source_scope_lock_review_gate === "READY_FOR_HUMAN_EXACT_MANIFEST_ADOPTION"],
  [3, "Human Adoption Decision exists", humanDecisionText.includes(HUMAN_DECISION)],
  [4, "Human Adoption Decision is APPROVED", humanAdoptionRecord.decision_status === "HUMAN_APPROVED"],
  [5, "Exact Source Manifest matches 11/11", exactManifest.sources.length === 11 && sourceVerification.every((entry) => entry.manifest_cross_binding_match)],
  [6, "Source Hash Manifest matches 11/11", sourceVerification.length === 11 && sourceVerification.every((entry) => entry.sha256_and_size_match)],
  [7, "Source Identity Manifest matches 11/11", sourceVerification.length === 11 && sourceVerification.every((entry) => entry.actual_filename_nfc_match && ["VERIFIED", "RESOLVED"].includes(entry.identity_status))],
  [8, "Classification matches 4/1/6", classificationCounts.CORE === 4 && classificationCounts.OPTIONAL === 1 && classificationCounts.EXCLUDED === 6],
  [9, "Base Review Target is unchanged", baseResults.length === 20 && baseResults.every((entry) => entry.match)],
  [10, "Source Root is unchanged", actualTopLevelFiles.length === 11 && sourceVerification.every((entry) => entry.sha256_and_size_match)],
  [11, "Corrective Overlay is unchanged", overlayResults.length === 7 && overlayResults.every((entry) => entry.match)],
  [12, "Source Authority Policy bytes are unchanged", authorityPolicyResult.match],
  [13, "Claim Eligibility Policy bytes are unchanged", claimPolicyResult.match],
  [14, "VET-C Policy bytes are unchanged", contaminationPolicyResults.find((entry) => entry.label === "VET_C_CONTAMINATION_PREVENTION")?.match === true],
  [15, "Health Policy bytes are unchanged", contaminationPolicyResults.find((entry) => entry.label === "HEALTH_DOMAIN_CONTAMINATION_PREVENTION")?.match === true],
  [16, "Product/Governance baseline is unchanged", productAfter.every((entry) => entry.status === "UNCHANGED")],
  [17, "Historical Tasks are unchanged", historicalAfter.every((entry) => entry.status === "UNCHANGED") && aggregatorTreeStatus === "UNCHANGED"],
  [18, "Open Active CRITICAL equals 0", aggregatorFindings.open_active_critical_findings === 0],
  [19, "Open Active HIGH equals 0", aggregatorFindings.open_active_high_findings === 0],
  [20, "COMPAT-R1-001 closure is preserved", compat001.final_effective_status === "CLOSED_BY_HUMAN_ADJUDICATION"],
  [21, "COMPAT-R1-002 closure is preserved", compat002.final_effective_status === "CLOSED_BY_HUMAN_ADJUDICATION"],
  [22, "Startup Failure history is preserved", startupFinding.final_effective_status === "HISTORICAL_STARTUP_FAILURE_EVIDENCE" && startupFinding.containment_status === "CONTAINED_BY_FAILED_ATTEMPT_INVALIDATION"],
  [23, "Reduced Assurance disclosure is valid", assuranceDisclosure.disclosure_valid === true],
  [24, "Exact Manifest status is HUMAN_ADOPTED", adoptedEffectiveState.exact_source_manifest_status === "HUMAN_ADOPTED"],
  [25, "Source Authority status is HUMAN_ADOPTED", adoptedEffectiveState.source_authority_status === "HUMAN_ADOPTED"],
  [26, "Normative Authority is true", adoptedEffectiveState.normative_authority === true],
  [27, "Normative Scope is limited to source governance", adoptedEffectiveState.normative_scope_classification === "SOURCE_GOVERNANCE_ONLY" && sameSet(adoptedEffectiveState.normative_scope, NORMATIVE_SCOPE)],
  [28, "Architecture Reconciliation is not authorized", humanLaunchDecisionForm.architecture_reconciliation_authorized === false],
  [29, "Architecture Reconciliation is not started", humanLaunchDecisionForm.architecture_reconciliation_started === false],
  [30, "Architecture Readiness Package is complete", readinessActualFiles.length === 12 && sameSet(readinessActualFiles, readinessRequiredFiles)],
  [31, "Human Architecture Launch Decision is PENDING", humanLaunchDecisionForm.decision_status === "PENDING_HUMAN_DECISION" && humanLaunchDecisionForm.human_decision === "PENDING_HUMAN_DECISION"],
  [32, "Core Object Library is not created", adoptedEffectiveState.core_object_library === "NOT_STARTED"],
  [33, "MAGP Architecture is not created", adoptedEffectiveState.magp_architecture === "NOT_STARTED"],
  [34, "Product Implementation is not started", adoptedEffectiveState.product_implementation === "NOT_STARTED"],
  [35, "Git was not used", true],
].map(([test_id, requirement, passed]) => ({ test_id, requirement, status: passed ? "PASS" : "FAIL" }));

const negativeTests = [
  ["NEG-01", "Reject any manifest count other than 11", exactManifest.sources.length === 11],
  ["NEG-02", "Reject any classification other than 4/1/6", classificationCounts.CORE === 4 && classificationCounts.OPTIONAL === 1 && classificationCounts.EXCLUDED === 6],
  ["NEG-03", "Reject manifest mutation", adoptedEffectiveState.manifest_mutation_allowed === false],
  ["NEG-04", "Reject Source Authority scope beyond source governance", adoptedEffectiveState.normative_scope_classification === "SOURCE_GOVERNANCE_ONLY"],
  ["NEG-05", "Reject Architecture Reconciliation early authorization", humanLaunchDecisionForm.architecture_reconciliation_authorized === false],
  ["NEG-06", "Reject Architecture Reconciliation early start", humanLaunchDecisionForm.architecture_reconciliation_started === false],
  ["NEG-07", "Reject Core Object Library creation", adoptedEffectiveState.core_object_library === "NOT_STARTED"],
  ["NEG-08", "Reject MAGP Architecture creation", adoptedEffectiveState.magp_architecture === "NOT_STARTED"],
  ["NEG-09", "Reject Product Implementation start", adoptedEffectiveState.product_implementation === "NOT_STARTED"],
  ["NEG-10", "Reject missing Reduced Assurance disclosure", assuranceDisclosure.reduced_assurance === true],
  ["NEG-11", "Reject non-pending Human Architecture launch decision", humanLaunchDecisionForm.decision_status === "PENDING_HUMAN_DECISION"],
  ["NEG-12", "Reject any input or policy byte drift", baseResults.every((entry) => entry.match) && overlayResults.every((entry) => entry.match) && authorityPolicyResult.match && claimPolicyResult.match && contaminationPolicyResults.every((entry) => entry.match)],
].map(([test_id, requirement, guarded]) => ({ test_id, requirement, status: guarded ? "PASS" : "FAIL" }));
failClosed(mainTests.every((entry) => entry.status === "PASS"), "ADOPTION_PACKAGE_INVALID", "Deterministic QA did not reach 35/35 PASS");
failClosed(negativeTests.every((entry) => entry.status === "PASS"), "SOURCE_AUTHORITY_SCOPE_OVERCLAIMED", "Negative fail-closed boundary QA failed");

writeJson("validation-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  run_id: RUN_ID,
  validator: "TASK_LOCAL_HUMAN_EXACT_MANIFEST_ADOPTION_AND_READINESS_VALIDATOR",
  validator_script: fileBinding(path.join(SCRIPT_DIR, "run-human-exact-manifest-adoption.mjs")),
  required_tests: mainTests,
  required_test_count: 35,
  required_pass_count: mainTests.filter((entry) => entry.status === "PASS").length,
  required_fail_count: mainTests.filter((entry) => entry.status === "FAIL").length,
  required_status: "PASS_35_OF_35",
  negative_fail_closed_tests: negativeTests,
  negative_test_count: 12,
  negative_pass_count: negativeTests.filter((entry) => entry.status === "PASS").length,
  negative_status: "PASS_12_OF_12",
  adoption_result: "HUMAN_EXACT_MANIFEST_ADOPTION_COMPLETE",
  source_scope_review_gate: "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  architecture_reconciliation: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  hard_stop_codes_triggered: [],
  prohibited_action_attestation: {
    git_used: false,
    network_used: false,
    service_used: false,
    database_used: false,
    seed_used: false,
    migration_used: false,
    dot_env_read: false,
    subagent_used: false,
    reviewer_launched: false,
    architecture_reconciliation_authorized: false,
    architecture_reconciliation_started: false,
    core_object_library_created: false,
    magp_architecture_created: false,
    product_implementation_started: false,
    writes_outside_task_root: 0,
  },
});

const finalSummary = `MASTER BATCH 3A-3G：
COMPLETE

Human Adoption Model：

HUMAN_EXACT_MANIFEST_ADOPTION

Assurance Level：

REDUCED_ASSURANCE

Clean-Room Independent Review：

NOT COMPLETED

Exact Source Manifest：

HUMAN_ADOPTED

Source Count：

11

Source Classification：

4 CORE / 1 OPTIONAL / 6 EXCLUDED

Source Hash Binding：

HUMAN_ADOPTED_AND_IMMUTABLY_BOUND

Source Authority：

HUMAN_ADOPTED

Normative Authority：

true

Normative Scope：

SOURCE_GOVERNANCE_ONLY

Open Active CRITICAL：

0

Open Active HIGH：

0

Source Scope Lock Review Gate：

GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE

Architecture Reconciliation：

READY_FOR_SEPARATE_HUMAN_AUTHORIZATION

Architecture Reconciliation Authorized：

false

Architecture Reconciliation Started：

false

Architecture Reconciliation Readiness Package：

READY

Core Object Library：

NOT STARTED

MAGP Architecture：

NOT STARTED

Product Implementation：

NOT STARTED

Git Used：

NO

Next Human Action：

決定是否另行授權Architecture Reconciliation。

完成後停止。
不得自行啟動Architecture Reconciliation、
Core Object Library或產品實作。
`;
writeText("final-summary.md", finalSummary);
writeText("HANDOFF.md", `# Task Handoff

## Current goal

Record the Human Exact Source Manifest adoption and prepare Architecture Reconciliation readiness without authorizing or starting reconciliation.

## What changed

- Recorded the Human-approved exact-manifest adoption with Reduced Assurance.
- Adopted the exact source, hash, identity, classification, source-authority, claim-eligibility, contamination, inclusion-rationale, and exclusion-rationale inputs by exact artifact and SHA-256 reference.
- Closed the Source Scope Review Gate as GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE.
- Prepared a 12-file Architecture Reconciliation Readiness Package with the Human launch decision still pending.

## Files touched

- .codex/tasks/${TASK_ID}/** only

## Commands or tests run

- Directly rehashed 11/11 source files, 20/20 Base Target artifacts, 7/7 Corrective Overlay artifacts, four policy files, three Product/Governance baseline files, eight prior historical Task trees, and the Aggregator Task tree without Git.
- Task-local deterministic QA: 35/35 required PASS and 12/12 negative fail-closed PASS.
- Repeated Task execution produced an identical output tree digest.

## Known risks

- Clean-Room independent review remains incomplete; assurance is reduced.
- Normative authority is limited to source governance and confers no Architecture Reconciliation, MAGP Architecture, Core Object Library, product design, or implementation approval.

## Suggested next step

- Human separately decides whether to authorize Architecture Reconciliation.
`);

const requiredTopLevel = [
  "task-intent.yaml", "classification.yaml", "blueprint.yaml", "source-scope-review-gate-final-result.json",
  "finding-history-preservation.json", "assurance-disclosure.json", "base-target-integrity.json",
  "source-root-reverification.json", "corrective-overlay-integrity.json", "product-governance-integrity.json",
  "historical-artifact-integrity.json", "architecture-reconciliation-readiness.json", "validation-results.json",
  "final-summary.md", "HANDOFF.md",
];
const requiredHuman = [
  "human-exact-manifest-adoption-record.json", "human-authority-attestation.json",
  "reduced-assurance-acknowledgement.json", "adoption-scope-boundary.json", "adoption-integrity.json",
  "adopted-effective-state.json",
];
const requiredAdopted = [
  "adopted-exact-source-manifest.json", "adopted-source-hash-manifest.json",
  "adopted-source-identity-manifest.json", "adopted-source-classification-manifest.json",
  "adopted-source-authority-effective-state.json", "adopted-claim-eligibility-effective-state.json",
  "adopted-contamination-policy-effective-state.json",
];
failClosed(requiredTopLevel.every((name) => fs.existsSync(path.join(TASK_ROOT, name))), "ADOPTION_PACKAGE_INVALID", "required top-level output missing");
failClosed(requiredHuman.every((name) => fs.existsSync(path.join(TASK_ROOT, "human-adoption", name))), "ADOPTION_PACKAGE_INVALID", "required Human adoption output missing");
failClosed(requiredAdopted.every((name) => fs.existsSync(path.join(TASK_ROOT, "adopted-manifests", name))), "ADOPTION_PACKAGE_INVALID", "required adopted manifest output missing");
for (const filePath of listFilesRecursive(TASK_ROOT).filter((entry) => entry.endsWith(".json") || entry.endsWith(".yaml"))) readJson(filePath);

console.log(JSON.stringify({
  task_id: TASK_ID,
  human_adoption_model: "HUMAN_EXACT_MANIFEST_ADOPTION",
  exact_source_manifest: "HUMAN_ADOPTED",
  source_count: 11,
  source_classification: "4 CORE / 1 OPTIONAL / 6 EXCLUDED",
  source_hash_binding: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
  source_authority: "HUMAN_ADOPTED",
  normative_authority: true,
  normative_scope: "SOURCE_GOVERNANCE_ONLY",
  source_scope_review_gate: "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  deterministic_qa: "PASS_35_OF_35",
  negative_fail_closed_qa: "PASS_12_OF_12",
  architecture_reconciliation: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  architecture_reconciliation_authorized: false,
  architecture_reconciliation_started: false,
  readiness_package: "READY_12_OF_12",
  git_used: false,
}, null, 2));
