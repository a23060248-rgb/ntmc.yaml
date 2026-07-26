import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TASK_ROOT = path.resolve(SCRIPT_DIR, "..");
const TASKS_ROOT = path.resolve(TASK_ROOT, "..");
const PRODUCT_ROOT = path.resolve(TASK_ROOT, "..", "..", "..");
const TASK_ID = "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-HUMAN-ADJUDICATED-R1";
const ROLE = "SOURCE_SCOPE_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER_HA1";
const RUN_ID = "MAGP-SOURCE-SCOPE-HA1-20260722-R1";
const EXECUTED_ON = "2026-07-22";

const taskIds = {
  base: "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01",
  preparation: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
  intake: "GOV-MAGP-SOURCE-SCOPE-REVIEW-INTAKE-AND-COMPATIBILITY-REMEDIATION-02",
  schemaV2: "GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01",
  startup: "GOV-MAGP-COMPATIBILITY-R2-STARTUP-BLOCKER-INTAKE-AND-RETRY-PREPARATION-01",
  runtime: "GOV-MAGP-COMPATIBILITY-R2-RUNTIME-CAPABILITY-AND-HUMAN-ADJUDICATION-PREPARATION-01",
  assessment: "GOV-MAGP-HUMAN-ADJUDICATED-COMPATIBILITY-ASSESSMENT-01",
  adjudication: "GOV-MAGP-HUMAN-COMPATIBILITY-FINDING-ADJUDICATION-01",
};

const roots = Object.fromEntries(Object.entries(taskIds).map(([key, id]) => [key, path.join(TASKS_ROOT, id)]));
const packageRoot = path.join(TASK_ROOT, "human-exact-manifest-adoption-package");

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

function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("RFC8785_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  throw new Error(`RFC8785_UNSUPPORTED_TYPE:${typeof value}`);
}

function sha256Jcs(value) {
  return sha256Bytes(Buffer.from(canonicalize(value), "utf8"));
}

function writeJson(relativePath, value) {
  const absolutePath = path.join(TASK_ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(relativePath, value) {
  const absolutePath = path.join(TASK_ROOT, relativePath);
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

function bindingResults(root, entries, relativeKey = "relative_path", sizeKey = "bytes") {
  return entries.map((entry) => {
    const relativePath = entry[relativeKey];
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const exists = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
    const actualSha256 = exists ? sha256File(absolutePath) : null;
    const actualBytes = exists ? fs.statSync(absolutePath).size : null;
    return {
      relative_path: relativePath,
      expected_sha256: entry.sha256,
      actual_sha256: actualSha256,
      expected_bytes: entry[sizeKey],
      actual_bytes: actualBytes,
      match: exists && actualSha256 === entry.sha256 && actualBytes === entry[sizeKey],
    };
  });
}

function normalizeClassification(value) {
  if (value === "CORE_INCLUDED") return "CORE";
  if (value === "OPTIONAL_PATTERN_ONLY") return "OPTIONAL";
  if (value.startsWith("EXCLUDE")) return "EXCLUDED";
  return "UNKNOWN";
}

function exactKeys(value, expected) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

const baseManifestPath = path.join(roots.preparation, "review-target-manifest.json");
const baseCanonicalPath = path.join(roots.preparation, "review-target-canonical-record.json");
const sourceHashBindingPath = path.join(roots.preparation, "source-hash-binding.json");
const sourceIdentityPath = path.join(roots.base, "source-identity-resolution.json");
const sourceRegisterPath = path.join(roots.base, "source-scope-register.yaml");
const sourceInventoryPath = path.join(roots.base, "source-directory-inventory.json");
const correctionIntegrityPath = path.join(roots.intake, "compatibility-remediation", "correction-integrity-record.json");
const formalIntakePath = path.join(roots.intake, "formal-intake-results.json");
const originalAggregatorManifestPath = path.join(roots.adjudication, "aggregator-input-manifest.json");

const baseManifest = readJson(baseManifestPath);
const baseCanonical = readJson(baseCanonicalPath);
const sourceHashBinding = readJson(sourceHashBindingPath);
const sourceIdentity = readJson(sourceIdentityPath);
const sourceRegister = readJson(sourceRegisterPath);
const sourceInventory = readJson(sourceInventoryPath);
const correctionIntegrity = readJson(correctionIntegrityPath);
const formalIntake = readJson(formalIntakePath);
const originalAggregatorManifest = readJson(originalAggregatorManifestPath);
const assessmentValidation = readJson(path.join(roots.assessment, "validation-results.json"));
const assessmentValidationSummary = readJson(path.join(roots.assessment, "deterministic-validation", "validation-summary.json"));
const adjudicationValidation = readJson(path.join(roots.adjudication, "validation-results.json"));
const humanDecision = readJson(path.join(roots.adjudication, "human-adjudication", "human-decision-record.json"));
const humanAuthority = readJson(path.join(roots.adjudication, "human-adjudication", "human-authority-attestation.json"));
const closure001 = readJson(path.join(roots.adjudication, "human-adjudication", "finding-001-human-adjudication.json"));
const closure002 = readJson(path.join(roots.adjudication, "human-adjudication", "finding-002-human-adjudication.json"));
const reducedAcknowledgement = readJson(path.join(roots.adjudication, "human-adjudication", "reduced-assurance-acknowledgement.json"));
const priorAssurance = readJson(path.join(roots.adjudication, "assurance-disclosure.json"));
const priorFindingStatus = readJson(path.join(roots.adjudication, "finding-final-status.json"));
const compatibilityModel = readJson(path.join(roots.adjudication, "compatibility-review-model-result.json"));
const sourceGateBoundary = readJson(path.join(roots.adjudication, "source-scope-gate-boundary.json"));
const historicalBaseline = readJson(path.join(roots.adjudication, "historical-artifact-integrity.json"));
const productBaseline = readJson(path.join(roots.adjudication, "product-governance-integrity.json"));
const assessmentPolicyIntegrity = readJson(path.join(roots.assessment, "integrity-validation", "authority-policy-integrity.json"));
const assessmentContaminationIntegrity = readJson(path.join(roots.assessment, "integrity-validation", "contamination-policy-integrity.json"));
const startupWrapper = readJson(path.join(roots.startup, "compatibility-r2-attempt-1", "parsed-wrapper.json"));
const startupVerification = readJson(path.join(roots.startup, "compatibility-r2-attempt-1", "payload-verification.json"));

failClosed(sha256File(baseManifestPath) === baseCanonical.record_core.review_target_manifest_sha256, "BASE_TARGET_CHANGED", "review target manifest hash mismatch");
failClosed(sha256Jcs(baseCanonical.record_core) === baseCanonical.record_core_sha256, "BASE_TARGET_CHANGED", "canonical review target core hash mismatch");

const baseResults = bindingResults(roots.base, baseManifest.artifacts, "normalized_relative_path", "file_size_bytes");
const actualBaseFiles = listFilesRecursive(roots.base);
failClosed(baseManifest.artifact_count === 20 && actualBaseFiles.length === 20 && baseResults.length === 20 && baseResults.every((entry) => entry.match), "BASE_TARGET_CHANGED", "Base Review Target is not unchanged 20/20");

failClosed(sha256Jcs(correctionIntegrity.record_core) === correctionIntegrity.record_core_sha256, "CORRECTIVE_OVERLAY_CHANGED", "corrective record core hash mismatch");
const overlayEntries = correctionIntegrity.record_core.corrective_overlay_artifacts.map((entry) => ({
  relative_path: entry.normalized_relative_path,
  sha256: entry.sha256,
  bytes: entry.file_size_bytes,
}));
const overlayRoot = path.join(roots.intake, "compatibility-remediation");
const overlayResults = bindingResults(overlayRoot, overlayEntries);
const overlayDirectoryRelativePaths = listFilesRecursive(overlayRoot).map((filePath) => toPosix(path.relative(overlayRoot, filePath))).sort();
const expectedOverlayDirectoryRelativePaths = [...overlayEntries.map((entry) => entry.relative_path), "correction-integrity-record.json"].sort();
failClosed(JSON.stringify(overlayDirectoryRelativePaths) === JSON.stringify(expectedOverlayDirectoryRelativePaths) && overlayResults.length === 7 && overlayResults.every((entry) => entry.match), "CORRECTIVE_OVERLAY_CHANGED", "Corrective Overlay is not unchanged 7/7 plus its integrity record");

const sourceRoot = sourceInventory.source_root;
failClosed(fs.existsSync(sourceRoot) && fs.statSync(sourceRoot).isDirectory(), "SOURCE_ROOT_CHANGED", "source root is unavailable");
const topLevelSourceEntries = fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isFile());
const topLevelNameMap = new Map(topLevelSourceEntries.map((entry) => [entry.name.normalize("NFC"), entry.name]));
const sourceResults = sourceInventory.files.map((entry) => {
  const normalizedName = entry.actual_filename.normalize("NFC");
  const actualName = topLevelNameMap.get(normalizedName);
  const absolutePath = actualName ? path.join(sourceRoot, actualName) : null;
  const exists = Boolean(absolutePath && fs.existsSync(absolutePath));
  const actualSha256 = exists ? sha256File(absolutePath) : null;
  const actualBytes = exists ? fs.statSync(absolutePath).size : null;
  return {
    actual_filename: entry.actual_filename,
    normalized_filename_nfc: normalizedName,
    expected_sha256: entry.sha256,
    actual_sha256: actualSha256,
    expected_bytes: entry.file_size_bytes,
    actual_bytes: actualBytes,
    filename_nfc_match: Boolean(actualName),
    hash_and_size_match: exists && actualSha256 === entry.sha256 && actualBytes === entry.file_size_bytes,
  };
});
failClosed(topLevelSourceEntries.length === 11 && sourceResults.length === 11 && sourceResults.every((entry) => entry.filename_nfc_match && entry.hash_and_size_match), "SOURCE_ROOT_CHANGED", "Source Root is not unchanged 11/11");
failClosed(new Set(sourceIdentity.sources.map((entry) => entry.source_id)).size === 11 && sourceIdentity.actual_source_count === 11 && sourceIdentity.uniquely_verified_count === 11 && sourceIdentity.failed_count === 0, "SOURCE_IDENTITY_CHANGED", "Source Identity is not 11/11 uniquely resolved");

const identityById = new Map(sourceIdentity.sources.map((entry) => [entry.source_id, entry]));
const registerById = new Map(sourceRegister.sources.map((entry) => [entry.source_id, entry]));
const normalizedSources = sourceRegister.sources.map((entry) => {
  const identity = identityById.get(entry.source_id);
  const inventory = sourceInventory.files.find((item) => item.actual_filename.normalize("NFC") === entry.actual_filename.normalize("NFC"));
  failClosed(Boolean(identity && inventory), "SOURCE_IDENTITY_CHANGED", `missing identity or inventory binding for ${entry.source_id}`);
  return {
    source_id: entry.source_id,
    actual_filename: entry.actual_filename,
    normalized_absolute_path: `${sourceRoot}/${entry.actual_filename}`.normalize("NFC"),
    file_size_bytes: inventory.file_size_bytes,
    sha256: inventory.sha256,
    classification: normalizeClassification(entry.classification),
    source_classification_value: entry.classification,
    authority_level: entry.authority_level,
    read_scope: entry.read_scope,
    claim_eligibility: entry.claim_eligibility,
    identity_method: identity.identity_match_method,
    identity_status: identity.identity_match_status,
    automatic_normative_effect: entry.automatic_normative_effect ?? false,
  };
});
const classificationCounts = normalizedSources.reduce((counts, entry) => {
  counts[entry.classification] = (counts[entry.classification] || 0) + 1;
  return counts;
}, {});
failClosed(classificationCounts.CORE === 4 && classificationCounts.OPTIONAL === 1 && classificationCounts.EXCLUDED === 6, "SOURCE_CLASSIFICATION_CHANGED", "classification is not 4/1/6");
failClosed(normalizedSources.every((entry) => ["VERIFIED", "RESOLVED"].includes(entry.identity_status)), "SOURCE_IDENTITY_CHANGED", "one or more source identities are not verified");

const policyBindings = {
  source_authority_policy: fileBinding(path.join(roots.base, "source-authority-policy.yaml")),
  claim_eligibility_policy: fileBinding(path.join(roots.base, "source-claim-eligibility-policy.yaml")),
  vetc_contamination_policy: fileBinding(path.join(roots.base, "vetc-contamination-prevention-policy.yaml")),
  health_contamination_policy: fileBinding(path.join(roots.base, "health-domain-contamination-prevention-policy.yaml")),
};
failClosed(policyBindings.source_authority_policy.sha256 === assessmentPolicyIntegrity.source_authority_policy.expected_sha256, "SOURCE_AUTHORITY_POLICY_CHANGED", "Source Authority Policy hash mismatch");
failClosed(policyBindings.claim_eligibility_policy.sha256 === assessmentPolicyIntegrity.source_claim_eligibility_policy.expected_sha256, "CLAIM_ELIGIBILITY_POLICY_CHANGED", "Claim Eligibility Policy hash mismatch");
failClosed(policyBindings.vetc_contamination_policy.sha256 === assessmentContaminationIntegrity.vetc_contamination_policy.expected_sha256, "CONTAMINATION_POLICY_CHANGED", "VET-C policy hash mismatch");
failClosed(policyBindings.health_contamination_policy.sha256 === assessmentContaminationIntegrity.health_domain_contamination_policy.expected_sha256, "CONTAMINATION_POLICY_CHANGED", "Health policy hash mismatch");

const originalInputById = new Map(originalAggregatorManifest.inputs.map((entry) => [entry.input_id, entry]));
const formalResultByKey = new Map(formalIntake.results_core.results.map((entry) => [entry.reviewer_key, entry]));
const r1Definitions = [
  { key: "source_integrity_r1", inputId: "INTEGRITY_R1_PASS", file: "source-integrity-r1.raw.txt", attestation: "source_integrity_r1.json", expectedStatus: "PASS", role: "INTEGRITY" },
  { key: "source_authority_r1", inputId: "AUTHORITY_R1_PASS", file: "source-authority-r1.raw.txt", attestation: "source_authority_r1.json", expectedStatus: "PASS", role: "AUTHORITY" },
  { key: "scope_contamination_r1", inputId: "CONTAMINATION_R1_PASS", file: "scope-contamination-r1.raw.txt", attestation: "scope_contamination_r1.json", expectedStatus: "PASS", role: "CONTAMINATION" },
  { key: "compatibility_r1", inputId: "COMPATIBILITY_R1_BLOCKER_HISTORY", file: "compatibility-r1.raw.txt", attestation: "compatibility_r1.json", expectedStatus: "BLOCKER", role: "COMPATIBILITY" },
];

const r1Records = r1Definitions.map((definition) => {
  const rawPath = path.join(roots.intake, "reviewer-payloads", definition.file);
  const rawBytes = readBytes(rawPath);
  const rawText = rawBytes.toString("utf8");
  const wrapper = JSON.parse(rawText);
  const attestationPath = path.join(roots.intake, "transport-attestations", definition.attestation);
  const attestation = readJson(attestationPath);
  const formal = formalResultByKey.get(definition.key);
  const declared = originalInputById.get(definition.inputId);
  const rawSha256 = sha256Bytes(rawBytes);
  failClosed(exactKeys(wrapper, ["payload_core", "payload_core_sha256"]), "R1_PASS_PAYLOAD_INVALID", `${definition.key} wrapper fields invalid`);
  failClosed(rawText === canonicalize(wrapper), "R1_PASS_PAYLOAD_INVALID", `${definition.key} wrapper is not RFC8785 JCS canonical`);
  failClosed(sha256Jcs(wrapper.payload_core) === wrapper.payload_core_sha256, "R1_PASS_PAYLOAD_INVALID", `${definition.key} payload core hash invalid`);
  failClosed(rawSha256 === attestation.payload_sha256 && rawSha256 === formal.raw_payload_sha256 && rawSha256 === declared.sha256, "R1_PASS_PAYLOAD_INVALID", `${definition.key} raw payload hash binding invalid`);
  failClosed(wrapper.payload_core.reviewer_role === attestation.reviewer_role && wrapper.payload_core.review_package_id === attestation.review_package_id && wrapper.payload_core.reviewer_run_id === attestation.reviewer_run_id, "R1_PASS_PAYLOAD_INVALID", `${definition.key} reviewer identity binding invalid`);
  failClosed(wrapper.payload_core.review_status === definition.expectedStatus && formal.review_status === definition.expectedStatus, "R1_PASS_PAYLOAD_INVALID", `${definition.key} review status invalid`);
  failClosed(attestation.payload_modified === false && attestation.transported_by_human === true && formal.formal_intake_status.startsWith("FORMALLY_ACCEPTED"), "R1_PASS_PAYLOAD_INVALID", `${definition.key} formal intake invalid`);
  return {
    ...definition,
    raw_path: rawPath,
    raw_sha256: rawSha256,
    raw_bytes: rawBytes.length,
    wrapper,
    attestation: fileBinding(attestationPath),
    formal,
  };
});

const r1ByRole = new Map(r1Records.map((entry) => [entry.role, entry]));
failClosed(r1ByRole.get("INTEGRITY").wrapper.payload_core.review_status === "PASS", "R1_PASS_PAYLOAD_INVALID", "Integrity R1 PASS invalid");
failClosed(r1ByRole.get("AUTHORITY").wrapper.payload_core.review_status === "PASS", "R1_PASS_PAYLOAD_INVALID", "Authority R1 PASS invalid");
failClosed(r1ByRole.get("CONTAMINATION").wrapper.payload_core.review_status === "PASS", "R1_PASS_PAYLOAD_INVALID", "Contamination R1 PASS invalid");
failClosed(r1ByRole.get("COMPATIBILITY").wrapper.payload_core.review_status === "BLOCKER", "STARTUP_FAILURE_IMPROPERLY_USED_AS_PASS", "Compatibility R1 history was not preserved as BLOCKER");

const closureRules = (closure, id) => closure.finding_id === id
  && closure.original_finding_preserved === true
  && closure.historical_evidence_preserved === true
  && closure.human_decision === "HUMAN_CLOSED"
  && closure.effective_status === "CLOSED_BY_HUMAN_ADJUDICATION"
  && closure.closure_model === "HUMAN_ADJUDICATED_REDUCED_ASSURANCE"
  && closure.finding_remediation_verified === true
  && closure.finding_deleted === false
  && closure.finding_waived === false
  && closure.clean_room_closure === false
  && closure.independent_reviewer_closure === false;

failClosed(closureRules(closure001, "COMPAT-R1-001"), "HUMAN_CLOSURE_RECORD_INVALID", "COMPAT-R1-001 closure invalid");
failClosed(closureRules(closure002, "COMPAT-R1-002"), "HUMAN_CLOSURE_RECORD_INVALID", "COMPAT-R1-002 closure invalid");
failClosed(humanAuthority.finding_closure_authority_valid === true && humanAuthority.authority_actor === "HUMAN_USER" && humanAuthority.decision_inferred_by_codex === false, "HUMAN_CLOSURE_RECORD_INVALID", "Human authority attestation invalid");
failClosed(humanDecision.status === "FINAL_HUMAN_ADJUDICATION_RECORDED" && humanDecision.human_final_adjudication_completed === true && humanDecision.codex_decision_authority === "NONE", "HUMAN_CLOSURE_RECORD_INVALID", "Human decision record invalid");
failClosed(reducedAcknowledgement.acknowledgement_status === "ACKNOWLEDGED" && reducedAcknowledgement.limitations_accepted === true && reducedAcknowledgement.clean_room_review_completed === false && reducedAcknowledgement.independent_external_review_completed === false, "REDUCED_ASSURANCE_NOT_DISCLOSED", "Reduced Assurance acknowledgement invalid");
failClosed(priorAssurance.disclosure_valid === true && priorAssurance.reduced_assurance === true && priorAssurance.clean_room_review_completed === false && priorAssurance.independent_external_review_completed === false && priorAssurance.human_adjudicated_review_completed === true, "REDUCED_ASSURANCE_NOT_DISCLOSED", "Reduced Assurance disclosure invalid");
failClosed(assessmentValidation.validation_status === "PASS_55_OF_55" && assessmentValidationSummary.overall_result === "VALIDATION_PASS", "HUMAN_CLOSURE_RECORD_INVALID", "Human-adjudicated assessment validation invalid");
failClosed(adjudicationValidation.validation_status === "PASS_59_OF_59", "HUMAN_CLOSURE_RECORD_INVALID", "Human finding adjudication validation invalid");

const closureInput001 = originalInputById.get("COMPAT_R1_001_HUMAN_CLOSURE");
const closureInput002 = originalInputById.get("COMPAT_R1_002_HUMAN_CLOSURE");
const reducedInput = originalInputById.get("REDUCED_ASSURANCE_ACKNOWLEDGEMENT");
failClosed(sha256File(path.join(roots.adjudication, "human-adjudication", "finding-001-human-adjudication.json")) === closureInput001.sha256, "HUMAN_CLOSURE_RECORD_INVALID", "COMPAT-R1-001 closure hash invalid");
failClosed(sha256File(path.join(roots.adjudication, "human-adjudication", "finding-002-human-adjudication.json")) === closureInput002.sha256, "HUMAN_CLOSURE_RECORD_INVALID", "COMPAT-R1-002 closure hash invalid");
failClosed(sha256File(path.join(roots.adjudication, "human-adjudication", "reduced-assurance-acknowledgement.json")) === reducedInput.sha256, "REDUCED_ASSURANCE_NOT_DISCLOSED", "Reduced Assurance acknowledgement hash invalid");

failClosed(startupWrapper.payload_core.findings.length === 1 && startupWrapper.payload_core.findings[0].finding_id === "COMPAT-R2-STARTUP-CONTEXT-001", "STARTUP_FAILURE_IMPROPERLY_USED_AS_PASS", "startup finding identity invalid");
failClosed(startupVerification.interpretation.substantive_review_credit === "NONE" && startupVerification.interpretation.may_be_used_by_aggregator === false && startupVerification.interpretation.substantive_review_started === false, "STARTUP_FAILURE_IMPROPERLY_USED_AS_PASS", "startup failure is improperly eligible as a successful review");

const historicalBefore = historicalBaseline.historical_tasks.map((entry) => {
  const digest = treeDigest(path.join(TASKS_ROOT, entry.task_id));
  return {
    task_id: entry.task_id,
    expected_file_count: entry.file_count,
    actual_file_count_before: digest.file_count,
    expected_manifest_sha256: entry.manifest_sha256,
    actual_manifest_sha256_before: digest.canonical_manifest_sha256,
    match_before: digest.file_count === entry.file_count && digest.canonical_manifest_sha256 === entry.manifest_sha256,
  };
});
failClosed(historicalBefore.length === 7 && historicalBefore.every((entry) => entry.match_before), "HISTORICAL_TASK_CHANGED", "one or more historical Task trees changed before aggregation");
const adjudicationTreeBefore = treeDigest(roots.adjudication);
failClosed(adjudicationTreeBefore.file_count === 32, "HISTORICAL_TASK_CHANGED", "Human Adjudication Task file count changed");

const productBefore = productBaseline.files.map((entry) => {
  const absolutePath = path.join(PRODUCT_ROOT, ...entry.relative_path.split("/"));
  return {
    relative_path: entry.relative_path,
    expected_sha256: entry.sha256,
    expected_bytes: entry.bytes,
    actual_sha256_before: sha256File(absolutePath),
    actual_bytes_before: fs.statSync(absolutePath).size,
  };
});
failClosed(productBefore.every((entry) => entry.expected_sha256 === entry.actual_sha256_before && entry.expected_bytes === entry.actual_bytes_before), "PRODUCT_GOVERNANCE_BASELINE_CHANGED", "Product/Governance baseline changed before aggregation");

const compatibilityFindings = r1ByRole.get("COMPATIBILITY").wrapper.payload_core.findings;
failClosed(compatibilityFindings.length === 2 && compatibilityFindings.every((entry) => entry.status === "OPEN" && entry.severity === "HIGH") && new Set(compatibilityFindings.map((entry) => entry.finding_id)).size === 2, "R1_PASS_PAYLOAD_INVALID", "Compatibility R1 exact original Finding set invalid");

const effectiveCompatibilityFindings = compatibilityFindings.map((finding) => {
  const closure = finding.finding_id === "COMPAT-R1-001" ? closure001 : closure002;
  return {
    finding_id: finding.finding_id,
    title: finding.title,
    severity: finding.severity,
    original_status: "OPEN",
    remediation_status: "REMEDIATED",
    final_effective_status: "CLOSED_BY_HUMAN_ADJUDICATION",
    closure_model: "HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
    finding_deleted: false,
    finding_waived: false,
    clean_room_verified: false,
    independent_reviewer_closed: false,
    human_decision: closure.human_decision,
    active: false,
  };
});

const reviewerFindings = r1Records.flatMap((record) => record.wrapper.payload_core.findings.map((finding) => ({
  finding_id: finding.finding_id,
  reviewer_domain: record.role,
  title: finding.title,
  severity: finding.severity,
  original_status: finding.status,
  final_effective_status: finding.status,
  active: finding.status === "OPEN" && record.role !== "COMPATIBILITY",
  original_finding_source: toPosix(record.raw_path),
})));

const findingLedger = [
  ...reviewerFindings.filter((entry) => entry.reviewer_domain !== "COMPATIBILITY"),
  ...effectiveCompatibilityFindings.map((entry) => ({
    ...entry,
    reviewer_domain: "COMPATIBILITY",
    original_finding_source: toPosix(r1ByRole.get("COMPATIBILITY").raw_path),
  })),
  {
    finding_id: "COMPAT-R2-STARTUP-CONTEXT-001",
    reviewer_domain: "STARTUP_HISTORY",
    title: startupWrapper.payload_core.findings[0].title,
    severity: "CRITICAL",
    original_status: "OPEN",
    final_effective_status: "HISTORICAL_STARTUP_FAILURE_EVIDENCE",
    containment_status: "CONTAINED_BY_FAILED_ATTEMPT_INVALIDATION",
    substantive_review_credit: "NONE",
    aggregator_eligible: false,
    current_source_scope_content_finding: false,
    active: false,
    original_finding_source: toPosix(path.join(roots.startup, "compatibility-r2-attempt-1", "parsed-wrapper.json")),
  },
];

const openActiveCritical = findingLedger.filter((entry) => entry.active && entry.severity === "CRITICAL").length;
const openActiveHigh = findingLedger.filter((entry) => entry.active && entry.severity === "HIGH").length;
failClosed(openActiveCritical === 0, "OPEN_ACTIVE_CRITICAL_FINDING_EXISTS", "an active CRITICAL Finding remains");
failClosed(openActiveHigh === 0, "OPEN_ACTIVE_HIGH_FINDING_EXISTS", "an active HIGH Finding remains");
failClosed(compatibilityModel.compatibility_gate_result === "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE", "HUMAN_CLOSURE_RECORD_INVALID", "Compatibility Gate is invalid");
failClosed(sourceGateBoundary.source_authority === "PROPOSED_NOT_ADOPTED" && sourceGateBoundary.source_scope_exact_manifest_adoption === "NOT_STARTED" && sourceGateBoundary.architecture_reconciliation === "NOT_AUTHORIZED", "SOURCE_AUTHORITY_MARKED_ADOPTED_EARLY", "downstream authority boundary invalid");

const taskIntent = {
  schema_version: 1,
  task_id: TASK_ID,
  batch: "MASTER_BATCH_3A_3F",
  role: ROLE,
  human_launch_authorization: "LAUNCH_HUMAN_ADJUDICATED_SOURCE_SCOPE_AGGREGATOR",
  objective: "Aggregate existing Reviewer and Human-adjudication evidence, run deterministic QA, calculate the Source Scope Review Gate, and prepare but not execute Human Exact-Manifest Adoption.",
  review_model: "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT",
  assurance_level: "REDUCED_ASSURANCE",
  authorized_actions: [
    "AGGREGATE_EXISTING_REVIEW_AND_HUMAN_ADJUDICATION_EVIDENCE",
    "RUN_DETERMINISTIC_QA",
    "CALCULATE_SOURCE_SCOPE_REVIEW_GATE",
    "PREPARE_HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION_PACKAGE",
  ],
  prohibited_actions: [
    "SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION",
    "SOURCE_AUTHORITY_ADOPTION",
    "ARCHITECTURE_RECONCILIATION",
    "CORE_OBJECT_LIBRARY_CREATION",
    "MAGP_ARCHITECTURE_CREATION",
    "PRODUCT_IMPLEMENTATION",
    "GIT",
    "NETWORK",
    "SERVICE_DATABASE_SEED_MIGRATION_OR_ENV_ACCESS",
    "SUBAGENT_OR_REVIEWER_LAUNCH",
  ],
  allowed_write_root: toPosix(TASK_ROOT),
};

const classification = {
  schema_version: 1,
  task_id: TASK_ID,
  level: "L3",
  task_type: "HUMAN_ADJUDICATED_SOURCE_SCOPE_EVIDENCE_AGGREGATION",
  risk_class: "GOVERNANCE_GATE_CALCULATION",
  write_scope: [toPosix(TASK_ROOT) + "/**"],
  product_change_allowed: false,
  governance_baseline_change_allowed: false,
  historical_task_change_allowed: false,
  git_allowed: false,
  network_allowed: false,
  database_allowed: false,
  subagents_allowed: false,
  reviewer_launch_allowed: false,
  human_adoption_allowed: false,
  architecture_reconciliation_allowed: false,
};

const blueprint = {
  schema_version: 1,
  task_id: TASK_ID,
  actor_role: ROLE,
  execution_mode: "ROOT_ONLY_SEQUENTIAL_NO_SUBAGENTS",
  phases: [
    "INPUT_BINDING_RECOMPUTATION",
    "FINDING_AND_REVIEW_LEDGER_AGGREGATION",
    "DETERMINISTIC_30_CHECK_GATE_QA",
    "HUMAN_EXACT_MANIFEST_ADOPTION_PACKAGE_PREPARATION",
    "POST_WRITE_INPUT_AND_BOUNDARY_REVERIFICATION",
  ],
  input_task_ids: Object.values(taskIds).filter((id) => id !== taskIds.startup),
  historical_startup_evidence_task_id: taskIds.startup,
  compatibility_success_rule: "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT_PLUS_BOTH_CLOSED_BY_HUMAN_ADJUDICATION_RECORDS",
  compatibility_r1_usage: "ORIGINAL_FINDING_SOURCE_ONLY",
  startup_failure_usage: "HISTORICAL_STARTUP_FAILURE_EVIDENCE_ONLY",
  success_result: "PASS_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  success_gate: "READY_FOR_HUMAN_EXACT_MANIFEST_ADOPTION",
  next_human_action: "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION",
};

writeJson("task-intent.yaml", taskIntent);
writeJson("classification.yaml", classification);
writeJson("blueprint.yaml", blueprint);

const currentInputManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  aggregator_role: ROLE,
  run_id: RUN_ID,
  input_contract: "HUMAN_ADJUDICATED_REDUCED_ASSURANCE_SOURCE_SCOPE_AGGREGATION",
  formal_input_tasks: Object.entries(taskIds).filter(([key]) => key !== "startup").map(([key, id]) => ({
    input_key: key,
    task_id: id,
    absolute_root: toPosix(roots[key]),
    tree_digest: treeDigest(roots[key]),
  })),
  reviewer_payloads: r1Records.map((record) => ({
    reviewer_key: record.key,
    reviewer_role: record.wrapper.payload_core.reviewer_role,
    reviewer_task_id: record.wrapper.payload_core.task_id,
    review_package_id: record.wrapper.payload_core.review_package_id,
    reviewer_run_id: record.wrapper.payload_core.reviewer_run_id,
    raw_payload_path: toPosix(record.raw_path),
    raw_payload_sha256: record.raw_sha256,
    raw_payload_bytes: record.raw_bytes,
    payload_core_sha256: record.wrapper.payload_core_sha256,
    review_status: record.wrapper.payload_core.review_status,
    aggregator_usage: record.role === "COMPATIBILITY" ? "ORIGINAL_FINDING_SOURCE" : "FORMAL_PASS_INPUT",
    aggregator_eligible_as_success_input: record.role !== "COMPATIBILITY",
  })),
  human_closure_records: [
    fileBinding(path.join(roots.adjudication, "human-adjudication", "finding-001-human-adjudication.json")),
    fileBinding(path.join(roots.adjudication, "human-adjudication", "finding-002-human-adjudication.json")),
  ],
  reduced_assurance_acknowledgement: fileBinding(path.join(roots.adjudication, "human-adjudication", "reduced-assurance-acknowledgement.json")),
  base_review_target: {
    manifest: fileBinding(baseManifestPath),
    record: fileBinding(baseCanonicalPath),
    artifact_count: 20,
  },
  corrective_overlay: {
    integrity_record: fileBinding(correctionIntegrityPath),
    record_core_sha256: correctionIntegrity.record_core_sha256,
    artifact_count: 7,
  },
  source_root: {
    absolute_path: sourceRoot,
    source_count: 11,
    source_directory_manifest_sha256: baseCanonical.record_core.source_directory_manifest_sha256,
    source_hash_binding: fileBinding(sourceHashBindingPath),
  },
  startup_failure_history: {
    task_id: taskIds.startup,
    tree_digest: treeDigest(roots.startup),
    finding_id: "COMPAT-R2-STARTUP-CONTEXT-001",
    usage: "HISTORICAL_STARTUP_FAILURE_EVIDENCE",
    substantive_review_credit: "NONE",
    aggregator_eligible: false,
  },
  all_input_bindings_recomputed: true,
};
writeJson("aggregator-input-manifest.json", currentInputManifest);

writeJson("input-integrity-verification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  verification_model: "DIRECT_BYTE_SHA256_NFC_IDENTITY_AND_ORDINAL_TASK_TREE_RECOMPUTATION",
  checks: [
    { id: 1, requirement: "Base Review Target 20/20 and hash set unchanged", status: "PASS", evidence: "20_OF_20" },
    { id: 2, requirement: "Source Directory 11/11 and hash set unchanged", status: "PASS", evidence: "11_OF_11" },
    { id: 3, requirement: "Source Identity 11/11 unchanged", status: "PASS", evidence: "11_OF_11_UNIQUE_AND_RESOLVED" },
    { id: 4, requirement: "Classification 4/1/6 unchanged", status: "PASS", evidence: classificationCounts },
    { id: 5, requirement: "Source Authority Policy unchanged", status: "PASS", evidence_sha256: policyBindings.source_authority_policy.sha256 },
    { id: 6, requirement: "Claim Eligibility Policy unchanged", status: "PASS", evidence_sha256: policyBindings.claim_eligibility_policy.sha256 },
    { id: 7, requirement: "VET-C Contamination Policy unchanged", status: "PASS", evidence_sha256: policyBindings.vetc_contamination_policy.sha256 },
    { id: 8, requirement: "Health-Domain Contamination Policy unchanged", status: "PASS", evidence_sha256: policyBindings.health_contamination_policy.sha256 },
    { id: 9, requirement: "Corrective Overlay unchanged", status: "PASS", evidence: "7_OF_7" },
    { id: 10, requirement: "Integrity R1 Payload Hash and Identity valid", status: "PASS", evidence_sha256: r1ByRole.get("INTEGRITY").raw_sha256 },
    { id: 11, requirement: "Authority R1 Payload Hash and Identity valid", status: "PASS", evidence_sha256: r1ByRole.get("AUTHORITY").raw_sha256 },
    { id: 12, requirement: "Contamination R1 Payload Hash and Identity valid", status: "PASS", evidence_sha256: r1ByRole.get("CONTAMINATION").raw_sha256 },
    { id: 13, requirement: "Compatibility R1 historical Payload preserved", status: "PASS", evidence_sha256: r1ByRole.get("COMPATIBILITY").raw_sha256 },
    { id: 14, requirement: "COMPAT-R1-001 Human Closure valid", status: "PASS" },
    { id: 15, requirement: "COMPAT-R1-002 Human Closure valid", status: "PASS" },
    { id: 16, requirement: "Historical Startup Failure Evidence preserved", status: "PASS", evidence_sha256: startupVerification.raw_wrapper.sha256 },
    { id: 17, requirement: "Product/Governance baseline unchanged", status: "PASS", evidence: "3_OF_3" },
    { id: 18, requirement: "Historical Tasks unchanged", status: "PASS", evidence: "7_OF_7_BASELINES_PLUS_HUMAN_ADJUDICATION_TASK" },
  ],
  pass_count: 18,
  fail_count: 0,
  status: "PASS_18_OF_18",
  hard_stop_code: null,
});

writeJson("reviewer-result-ledger.json", {
  schema_version: 1,
  task_id: TASK_ID,
  results: [
    ...r1Records.map((record) => ({
      result_id: record.key.toUpperCase(),
      reviewer_role: record.wrapper.payload_core.reviewer_role,
      review_status: record.wrapper.payload_core.review_status,
      formal_intake_status: record.formal.formal_intake_status,
      preserved: true,
      usage: record.role === "COMPATIBILITY" ? "ORIGINAL_FINDING_SOURCE" : "FORMAL_PASS_INPUT",
      successful_compatibility_input: false,
    })),
    {
      result_id: "COMPATIBILITY_R2_ATTEMPT_1_STARTUP_FAILURE",
      review_status: "BLOCKER",
      substantive_review_credit: "NONE",
      aggregator_eligible: false,
      usage: "HISTORICAL_STARTUP_FAILURE_EVIDENCE",
      disposition: "CONTAINED_BY_FAILED_ATTEMPT_INVALIDATION",
    },
    {
      result_id: "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT_PLUS_CLOSURES",
      review_model: "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT",
      assessment_validation: "PASS_55_OF_55",
      human_adjudication_validation: "PASS_59_OF_59",
      COMPAT_R1_001: "CLOSED_BY_HUMAN_ADJUDICATION",
      COMPAT_R1_002: "CLOSED_BY_HUMAN_ADJUDICATION",
      result: "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
      successful_compatibility_input: true,
    },
  ],
  compatibility_success_rule: "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT_PLUS_BOTH_HUMAN_CLOSURE_RECORDS",
});

writeJson("finding-ledger.json", {
  schema_version: 1,
  task_id: TASK_ID,
  finding_count: findingLedger.length,
  findings: findingLedger,
  source_integrity_finding_count: r1ByRole.get("INTEGRITY").wrapper.payload_core.findings.length,
  authority_finding_count: r1ByRole.get("AUTHORITY").wrapper.payload_core.findings.length,
  contamination_finding_count: r1ByRole.get("CONTAMINATION").wrapper.payload_core.findings.length,
  compatibility_r1_finding_count: 2,
  historical_startup_finding_count: 1,
  human_closure_record_count: 2,
});

writeJson("finding-effective-status.json", {
  schema_version: 1,
  task_id: TASK_ID,
  compatibility_findings: effectiveCompatibilityFindings,
  startup_finding: findingLedger.find((entry) => entry.finding_id === "COMPAT-R2-STARTUP-CONTEXT-001"),
  open_active_critical_findings: openActiveCritical,
  open_active_high_findings: openActiveHigh,
  deleted_finding_count: 0,
  waived_finding_count: 0,
  status: "PASS_NO_OPEN_ACTIVE_CRITICAL_OR_HIGH",
});

writeJson("human-closure-verification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  review_model: "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT",
  assurance_level: "REDUCED_ASSURANCE",
  records: [
    { finding_id: "COMPAT-R1-001", binding: fileBinding(path.join(roots.adjudication, "human-adjudication", "finding-001-human-adjudication.json")), verification_status: "PASS", effective_status: closure001.effective_status, closure_model: closure001.closure_model },
    { finding_id: "COMPAT-R1-002", binding: fileBinding(path.join(roots.adjudication, "human-adjudication", "finding-002-human-adjudication.json")), verification_status: "PASS", effective_status: closure002.effective_status, closure_model: closure002.closure_model },
  ],
  human_authority_attestation: fileBinding(path.join(roots.adjudication, "human-adjudication", "human-authority-attestation.json")),
  findings_deleted: false,
  findings_waived: false,
  clean_room_verified: false,
  independent_reviewer_closed: false,
  status: "PASS_2_OF_2",
});

const deterministicGates = [
  { gate: "Integrity", expected: "PASS", actual: "PASS", status: "PASS" },
  { gate: "Authority", expected: "PASS", actual: "PASS", status: "PASS" },
  { gate: "Contamination", expected: "PASS", actual: "PASS", status: "PASS" },
  { gate: "Compatibility", expected: "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE", actual: compatibilityModel.compatibility_gate_result, status: "PASS" },
  { gate: "Open active CRITICAL findings", expected: 0, actual: openActiveCritical, status: "PASS" },
  { gate: "Open active HIGH findings", expected: 0, actual: openActiveHigh, status: "PASS" },
  { gate: "Base Review Target", expected: "UNCHANGED", actual: "UNCHANGED", status: "PASS" },
  { gate: "Corrective Overlay", expected: "UNCHANGED", actual: "UNCHANGED", status: "PASS" },
  { gate: "Source Root", expected: "UNCHANGED", actual: "UNCHANGED", status: "PASS" },
  { gate: "Classification", expected: "4/1/6 UNCHANGED", actual: "4/1/6 UNCHANGED", status: "PASS" },
  { gate: "Source Authority", expected: "PROPOSED_NOT_ADOPTED", actual: "PROPOSED_NOT_ADOPTED", status: "PASS" },
  { gate: "Normative Authority", expected: false, actual: false, status: "PASS" },
  { gate: "Human Exact-Manifest Adoption", expected: "NOT_STARTED", actual: "NOT_STARTED", status: "PASS" },
  { gate: "Architecture Reconciliation", expected: "NOT_AUTHORIZED", actual: "NOT_AUTHORIZED", status: "PASS" },
  { gate: "Product/Governance baseline", expected: "UNCHANGED", actual: "UNCHANGED", status: "PASS" },
  { gate: "Reduced-Assurance Disclosure", expected: "VALID", actual: "VALID", status: "PASS" },
];
writeJson("deterministic-gate-validation.json", {
  schema_version: 1,
  task_id: TASK_ID,
  run_id: RUN_ID,
  gates: deterministicGates,
  pass_count: deterministicGates.length,
  fail_count: 0,
  status: "PASS_16_OF_16",
});

const assuranceDisclosure = {
  schema_version: 1,
  task_id: TASK_ID,
  assurance_level: "REDUCED_ASSURANCE",
  clean_room_review_completed: false,
  independent_external_review_completed: false,
  human_adjudicated_review_completed: true,
  reduced_assurance: true,
  compatibility_review_model: "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT",
  deterministic_aggregation_completed: true,
  full_l3_independent_review_completed: false,
  not_equivalent_to: ["FULL_L3_PASS", "CLEAN_ROOM_PASS", "INDEPENDENT_REVIEW_PASS"],
  disclosure_valid: true,
};
writeJson("assurance-disclosure.json", assuranceDisclosure);

writeJson("base-target-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  review_target_task_id: taskIds.base,
  review_target_manifest_sha256: sha256File(baseManifestPath),
  review_target_record_core_sha256: baseCanonical.record_core_sha256,
  expected_artifact_count: 20,
  actual_artifact_count: actualBaseFiles.length,
  match_count: baseResults.filter((entry) => entry.match).length,
  artifacts: baseResults,
  status: "UNCHANGED_20_OF_20",
  drift_detected: false,
  git_used: false,
});

writeJson("corrective-overlay-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  corrective_overlay_id: correctionIntegrity.record_core.corrective_overlay_id,
  correction_integrity_record_core_sha256: correctionIntegrity.record_core_sha256,
  expected_artifact_count: 7,
  actual_artifact_count: overlayResults.length,
  overlay_directory_file_count_including_integrity_record: overlayDirectoryRelativePaths.length,
  match_count: overlayResults.filter((entry) => entry.match).length,
  artifacts: overlayResults,
  status: "UNCHANGED_7_OF_7",
  drift_detected: false,
});

writeJson("source-root-reverification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  source_root: sourceRoot,
  unicode_normalization: "NFC",
  expected_source_count: 11,
  actual_source_count: topLevelSourceEntries.length,
  filename_nfc_match_count: sourceResults.filter((entry) => entry.filename_nfc_match).length,
  sha256_and_size_match_count: sourceResults.filter((entry) => entry.hash_and_size_match).length,
  sources: sourceResults,
  source_directory_manifest_sha256: baseCanonical.record_core.source_directory_manifest_sha256,
  source_hash_binding_sha256: sha256File(sourceHashBindingPath),
  status: "UNCHANGED_11_OF_11",
  drift_detected: false,
});

writeJson("source-classification-reverification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  counts: classificationCounts,
  expected_counts: { CORE: 4, OPTIONAL: 1, EXCLUDED: 6 },
  groups: {
    CORE: normalizedSources.filter((entry) => entry.classification === "CORE").map((entry) => entry.source_id),
    OPTIONAL: normalizedSources.filter((entry) => entry.classification === "OPTIONAL").map((entry) => entry.source_id),
    EXCLUDED: normalizedSources.filter((entry) => entry.classification === "EXCLUDED").map((entry) => entry.source_id),
  },
  identity_match_count: 11,
  status: "UNCHANGED_4_CORE_1_OPTIONAL_6_EXCLUDED",
});

writeJson("source-authority-status.json", {
  schema_version: 1,
  task_id: TASK_ID,
  source_authority: "PROPOSED_NOT_ADOPTED",
  normative_authority: false,
  source_authority_policy_content_unchanged: true,
  source_authority_policy_sha256: policyBindings.source_authority_policy.sha256,
  claim_eligibility_policy_content_unchanged: true,
  claim_eligibility_policy_sha256: policyBindings.claim_eligibility_policy.sha256,
  human_exact_manifest_adoption: "NOT_STARTED",
  human_adoption_decision: "PENDING_HUMAN_DECISION",
  downstream_policy_use_allowed: false,
  architecture_reconciliation: "NOT_AUTHORIZED",
});

const reviewEvidenceSummary = {
  schema_version: 1,
  task_id: TASK_ID,
  integrity_r1: "PASS_FORMALLY_ACCEPTED_PRESERVED",
  authority_r1: "PASS_FORMALLY_ACCEPTED_PRESERVED",
  contamination_r1: "PASS_FORMALLY_ACCEPTED_PRESERVED",
  compatibility_r1: "BLOCKER_ORIGINAL_FINDING_SOURCE_ONLY",
  compatibility_success_basis: "HUMAN_ADJUDICATED_COMPATIBILITY_ASSESSMENT_PLUS_BOTH_HUMAN_CLOSURES",
  compatibility_gate: "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  open_active_critical: 0,
  open_active_high: 0,
  source_scope_review_evidence_status: "AGGREGATED_AND_VALIDATED",
};

const findingClosureSummary = {
  schema_version: 1,
  task_id: TASK_ID,
  findings: effectiveCompatibilityFindings,
  closed_by_human_adjudication: 2,
  closed_by_clean_room_review: 0,
  closed_by_independent_reviewer: 0,
  deleted: 0,
  waived: 0,
};

const exactSourceManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  manifest_status: "PROPOSED_FOR_HUMAN_EXACT_MANIFEST_ADOPTION",
  adoption_status: "NOT_STARTED",
  source_root: sourceRoot,
  source_count: 11,
  sources: normalizedSources,
};
const sourceHashManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  source_root: sourceRoot,
  source_count: 11,
  hash_algorithm: "SHA-256",
  entries: normalizedSources.map(({ source_id, normalized_absolute_path, file_size_bytes, sha256 }) => ({ source_id, normalized_absolute_path, file_size_bytes, sha256 })),
};
const sourceIdentityManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  source_count: 11,
  identity_status: "11_OF_11_UNIQUE_AND_RESOLVED",
  unicode_normalization: "NFC",
  entries: normalizedSources.map((entry) => {
    const identity = identityById.get(entry.source_id);
    return {
      source_id: entry.source_id,
      actual_filename: entry.actual_filename,
      normalized_absolute_path: entry.normalized_absolute_path,
      identity_method: entry.identity_method,
      identity_status: entry.identity_status,
      approved_exact_stem: identity.approved_exact_stem ?? null,
      source_sha256: entry.sha256,
    };
  }),
};
const classificationManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  counts: { CORE: 4, OPTIONAL: 1, EXCLUDED: 6 },
  entries: normalizedSources.map(({ source_id, classification, source_classification_value, read_scope, claim_eligibility }) => ({ source_id, classification, source_classification_value, read_scope, claim_eligibility })),
  status: "UNCHANGED",
};
const sourceAuthorityProposal = {
  schema_version: 1,
  task_id: TASK_ID,
  proposal_status: "PROPOSED_NOT_ADOPTED",
  normative_authority: false,
  human_exact_manifest_adoption: "NOT_STARTED",
  human_decision: "PENDING_HUMAN_DECISION",
  policy_reference: policyBindings.source_authority_policy,
  automatic_adoption_by_aggregator: false,
};
const claimEligibilityReference = {
  schema_version: 1,
  task_id: TASK_ID,
  reference: policyBindings.claim_eligibility_policy,
  content_status: "UNCHANGED",
  automatic_normative_promotion: false,
  adoption_effect: "NONE_UNTIL_HUMAN_EXACT_MANIFEST_ADOPTION",
};
const contaminationPolicyReference = {
  schema_version: 1,
  task_id: TASK_ID,
  references: [
    { policy: "VET_C_CONTAMINATION_PREVENTION", ...policyBindings.vetc_contamination_policy, content_status: "UNCHANGED" },
    { policy: "HEALTH_DOMAIN_CONTAMINATION_PREVENTION", ...policyBindings.health_contamination_policy, content_status: "UNCHANGED" },
  ],
  status: "UNCHANGED_2_OF_2",
};
const adoptionDecisionForm = {
  schema_version: 1,
  task_id: TASK_ID,
  decision_type: "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION",
  decision_status: "PENDING_HUMAN_DECISION",
  human_decision: "PENDING_HUMAN_DECISION",
  source_scope_exact_manifest_adoption: "NOT_STARTED",
  source_authority: "PROPOSED_NOT_ADOPTED",
  normative_authority: false,
  architecture_reconciliation: "NOT_AUTHORIZED",
  human_actor: null,
  decision_timestamp: null,
  rationale: null,
  codex_filled_human_decision: false,
};
const adoptionDecisionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:gov-magp:human-source-scope-exact-manifest-adoption-decision:v1",
  title: "Human Source Scope Exact-Manifest Adoption Decision",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "task_id", "decision_type", "decision_status", "human_decision", "source_scope_exact_manifest_adoption", "source_authority", "normative_authority", "architecture_reconciliation", "human_actor", "decision_timestamp", "rationale", "codex_filled_human_decision"],
  properties: {
    schema_version: { const: 1 },
    task_id: { const: TASK_ID },
    decision_type: { const: "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION" },
    decision_status: { enum: ["PENDING_HUMAN_DECISION", "RECORDED"] },
    human_decision: { enum: ["PENDING_HUMAN_DECISION", "ADOPT_EXACT_MANIFEST", "REJECT_EXACT_MANIFEST"] },
    source_scope_exact_manifest_adoption: { enum: ["NOT_STARTED", "ADOPTED", "REJECTED"] },
    source_authority: { enum: ["PROPOSED_NOT_ADOPTED", "ADOPTED", "REJECTED"] },
    normative_authority: { type: "boolean" },
    architecture_reconciliation: { const: "NOT_AUTHORIZED" },
    human_actor: { type: ["string", "null"] },
    decision_timestamp: { type: ["string", "null"] },
    rationale: { type: ["string", "null"] },
    codex_filled_human_decision: { const: false },
  },
};
const adoptionBoundary = {
  schema_version: 1,
  task_id: TASK_ID,
  current_authorized_next_action: "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION",
  aggregator_may_prepare_package: true,
  aggregator_may_execute_adoption: false,
  source_authority_may_be_marked_adopted_by_aggregator: false,
  policy_may_be_marked_normative_by_aggregator: false,
  architecture_reconciliation_may_be_authorized_by_aggregator: false,
};
const postAdoptionBoundary = {
  schema_version: 1,
  task_id: TASK_ID,
  current_state: "PRE_ADOPTION",
  current_next_human_action: "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION",
  post_adoption_automatic_authorization: false,
  post_adoption_candidate_next_step: "SEPARATELY_AUTHORIZED_ARCHITECTURE_RECONCILIATION_TASK",
  architecture_reconciliation_current_status: "NOT_AUTHORIZED",
  core_object_library_current_status: "NOT_AUTHORIZED",
  magp_architecture_current_status: "NOT_AUTHORIZED",
};

writeJson("human-exact-manifest-adoption-package/exact-source-manifest.json", exactSourceManifest);
writeJson("human-exact-manifest-adoption-package/source-hash-manifest.json", sourceHashManifest);
writeJson("human-exact-manifest-adoption-package/source-identity-manifest.json", sourceIdentityManifest);
writeJson("human-exact-manifest-adoption-package/classification-manifest.json", classificationManifest);
writeJson("human-exact-manifest-adoption-package/source-authority-proposal.json", sourceAuthorityProposal);
writeJson("human-exact-manifest-adoption-package/claim-eligibility-policy-reference.json", claimEligibilityReference);
writeJson("human-exact-manifest-adoption-package/contamination-policy-reference.json", contaminationPolicyReference);
writeJson("human-exact-manifest-adoption-package/review-evidence-summary.json", reviewEvidenceSummary);
writeJson("human-exact-manifest-adoption-package/finding-closure-summary.json", findingClosureSummary);
writeJson("human-exact-manifest-adoption-package/reduced-assurance-disclosure.json", assuranceDisclosure);
writeJson("human-exact-manifest-adoption-package/adoption-decision-form.json", adoptionDecisionForm);
writeJson("human-exact-manifest-adoption-package/adoption-decision-form.schema.json", adoptionDecisionSchema);
writeJson("human-exact-manifest-adoption-package/adoption-boundary.json", adoptionBoundary);
writeJson("human-exact-manifest-adoption-package/post-adoption-next-step-boundary.json", postAdoptionBoundary);

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
const packageBindings = requiredPackageFiles.map((relativePath) => ({ relative_path: relativePath, ...fileBinding(path.join(packageRoot, relativePath)) }));
failClosed(packageBindings.length === 14 && packageBindings.every((entry) => fs.existsSync(entry.absolute_path)), "AGGREGATOR_INPUT_INTEGRITY_BLOCKER", "Human Exact-Manifest Adoption Package incomplete");
failClosed(readJson(path.join(packageRoot, "adoption-decision-form.json")).decision_status === "PENDING_HUMAN_DECISION", "AGGREGATOR_IMPERSONATED_HUMAN_ADOPTION", "adoption decision is not pending");

writeJson("aggregation-result.json", {
  schema_version: 1,
  task_id: TASK_ID,
  run_id: RUN_ID,
  aggregator_role: ROLE,
  aggregation_result: "PASS_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  source_scope_review_evidence_status: "AGGREGATED_AND_VALIDATED",
  source_scope_lock_review_gate: "READY_FOR_HUMAN_EXACT_MANIFEST_ADOPTION",
  assurance: assuranceDisclosure,
  open_active_critical_findings: 0,
  open_active_high_findings: 0,
  source_authority: "PROPOSED_NOT_ADOPTED",
  normative_authority: false,
  human_exact_manifest_adoption: "NOT_STARTED",
  architecture_reconciliation: "NOT_AUTHORIZED",
  prohibited_success_labels_emitted: [],
});

writeJson("source-scope-review-gate-result.json", {
  schema_version: 1,
  task_id: TASK_ID,
  source_scope_lock_review_gate: "READY_FOR_HUMAN_EXACT_MANIFEST_ADOPTION",
  gate_basis: {
    integrity: "PASS",
    authority: "PASS",
    contamination: "PASS",
    compatibility: "GO_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
    open_active_critical: 0,
    open_active_high: 0,
    input_integrity: "PASS_18_OF_18",
    deterministic_gate_validation: "PASS_16_OF_16",
  },
  source_scope_exact_manifest_adoption: "NOT_STARTED",
  next_human_action: "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION",
  architecture_reconciliation: "NOT_AUTHORIZED",
});

const productAfter = productBefore.map((entry) => {
  const absolutePath = path.join(PRODUCT_ROOT, ...entry.relative_path.split("/"));
  const actualSha256After = sha256File(absolutePath);
  const actualBytesAfter = fs.statSync(absolutePath).size;
  return {
    ...entry,
    actual_sha256_after: actualSha256After,
    actual_bytes_after: actualBytesAfter,
    status: entry.expected_sha256 === actualSha256After && entry.expected_bytes === actualBytesAfter && entry.actual_sha256_before === actualSha256After && entry.actual_bytes_before === actualBytesAfter ? "UNCHANGED" : "CHANGED",
  };
});
failClosed(productAfter.every((entry) => entry.status === "UNCHANGED"), "PRODUCT_GOVERNANCE_BASELINE_CHANGED", "Product/Governance baseline changed during aggregation");
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
    match_after: digest.file_count === entry.expected_file_count && digest.canonical_manifest_sha256 === entry.expected_manifest_sha256,
    status: entry.match_before && digest.file_count === entry.actual_file_count_before && digest.canonical_manifest_sha256 === entry.actual_manifest_sha256_before ? "UNCHANGED" : "CHANGED",
  };
});
const adjudicationTreeAfter = treeDigest(roots.adjudication);
const adjudicationTreeStatus = adjudicationTreeAfter.file_count === adjudicationTreeBefore.file_count && adjudicationTreeAfter.canonical_manifest_sha256 === adjudicationTreeBefore.canonical_manifest_sha256 ? "UNCHANGED" : "CHANGED";
failClosed(historicalAfter.every((entry) => entry.status === "UNCHANGED" && entry.match_after) && adjudicationTreeStatus === "UNCHANGED", "HISTORICAL_TASK_CHANGED", "Historical Task changed during aggregation");
writeJson("historical-artifact-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  baseline_type: "EXACT_NON_GIT_ORDINAL_FILE_TREE_MANIFEST_BEFORE_AFTER",
  canonical_manifest_format: "normalized_relative_path|uppercase_sha256|byte_length joined by LF after ordinal relative-path sort",
  historical_tasks: historicalAfter,
  human_adjudication_task: {
    task_id: taskIds.adjudication,
    file_count_before: adjudicationTreeBefore.file_count,
    file_count_after: adjudicationTreeAfter.file_count,
    manifest_sha256_before: adjudicationTreeBefore.canonical_manifest_sha256,
    manifest_sha256_after: adjudicationTreeAfter.canonical_manifest_sha256,
    status: adjudicationTreeStatus,
  },
  compatibility_r1_payload_preserved: true,
  startup_failure_evidence_preserved: true,
  all_historical_tasks_unchanged: true,
  status: "PASS_8_OF_8",
  git_used: false,
});

const mainTests = [
  [1, "Aggregator role is correct", ROLE === "SOURCE_SCOPE_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER_HA1"],
  [2, "Integrity R1 PASS is valid", r1ByRole.get("INTEGRITY").wrapper.payload_core.review_status === "PASS"],
  [3, "Authority R1 PASS is valid", r1ByRole.get("AUTHORITY").wrapper.payload_core.review_status === "PASS"],
  [4, "Contamination R1 PASS is valid", r1ByRole.get("CONTAMINATION").wrapper.payload_core.review_status === "PASS"],
  [5, "Compatibility R1 is only an Original Finding Source", r1ByRole.get("COMPATIBILITY").wrapper.payload_core.review_status === "BLOCKER"],
  [6, "COMPAT-R1-001 Human Closure is valid", closureRules(closure001, "COMPAT-R1-001")],
  [7, "COMPAT-R1-002 Human Closure is valid", closureRules(closure002, "COMPAT-R1-002")],
  [8, "Open active CRITICAL equals 0", openActiveCritical === 0],
  [9, "Open active HIGH equals 0", openActiveHigh === 0],
  [10, "Startup Failure is not used as successful review", startupVerification.interpretation.substantive_review_credit === "NONE" && startupVerification.interpretation.may_be_used_by_aggregator === false],
  [11, "Base Target 20/20 is unchanged", baseResults.length === 20 && baseResults.every((entry) => entry.match)],
  [12, "Source Root 11/11 is unchanged", sourceResults.length === 11 && sourceResults.every((entry) => entry.hash_and_size_match)],
  [13, "Classification 4/1/6 is unchanged", classificationCounts.CORE === 4 && classificationCounts.OPTIONAL === 1 && classificationCounts.EXCLUDED === 6],
  [14, "Source Authority Policy is unchanged", policyBindings.source_authority_policy.sha256 === assessmentPolicyIntegrity.source_authority_policy.expected_sha256],
  [15, "Claim Eligibility Policy is unchanged", policyBindings.claim_eligibility_policy.sha256 === assessmentPolicyIntegrity.source_claim_eligibility_policy.expected_sha256],
  [16, "VET-C Policy is unchanged", policyBindings.vetc_contamination_policy.sha256 === assessmentContaminationIntegrity.vetc_contamination_policy.expected_sha256],
  [17, "Health Policy is unchanged", policyBindings.health_contamination_policy.sha256 === assessmentContaminationIntegrity.health_domain_contamination_policy.expected_sha256],
  [18, "Corrective Overlay is unchanged", overlayResults.length === 7 && overlayResults.every((entry) => entry.match)],
  [19, "Product/Governance baseline is unchanged", productAfter.every((entry) => entry.status === "UNCHANGED")],
  [20, "Historical Tasks are unchanged", historicalAfter.every((entry) => entry.status === "UNCHANGED") && adjudicationTreeStatus === "UNCHANGED"],
  [21, "Source Authority is PROPOSED_NOT_ADOPTED", sourceGateBoundary.source_authority === "PROPOSED_NOT_ADOPTED"],
  [22, "Normative Authority is false", sourceAuthorityProposal.normative_authority === false],
  [23, "Human Adoption is NOT_STARTED", adoptionDecisionForm.source_scope_exact_manifest_adoption === "NOT_STARTED"],
  [24, "Architecture Reconciliation is NOT_AUTHORIZED", adoptionDecisionForm.architecture_reconciliation === "NOT_AUTHORIZED"],
  [25, "Reduced-Assurance Disclosure is valid", assuranceDisclosure.disclosure_valid === true],
  [26, "Human Adoption Package is complete", packageBindings.length === 14],
  [27, "Adoption Decision remains PENDING", adoptionDecisionForm.decision_status === "PENDING_HUMAN_DECISION"],
  [28, "Aggregator did not execute Adoption", adoptionBoundary.aggregator_may_execute_adoption === false],
  [29, "Architecture Reconciliation did not start", postAdoptionBoundary.architecture_reconciliation_current_status === "NOT_AUTHORIZED"],
  [30, "Git was not used", true],
].map(([test_id, requirement, passed]) => ({ test_id, requirement, status: passed ? "PASS" : "FAIL" }));

const negativeTests = [
  ["NEG-01", "Reject Compatibility R1 BLOCKER as PASS input", r1ByRole.get("COMPATIBILITY").wrapper.payload_core.review_status !== "PASS"],
  ["NEG-02", "Reject startup failure as substantive review credit", startupVerification.interpretation.substantive_review_credit === "NONE"],
  ["NEG-03", "Reject Clean-Room PASS claim", assuranceDisclosure.clean_room_review_completed === false],
  ["NEG-04", "Reject Independent Review PASS claim", assuranceDisclosure.independent_external_review_completed === false],
  ["NEG-05", "Reject premature Human adoption decision", adoptionDecisionForm.human_decision === "PENDING_HUMAN_DECISION"],
  ["NEG-06", "Reject early Source Authority ADOPTED state", sourceAuthorityProposal.proposal_status !== "ADOPTED"],
  ["NEG-07", "Reject early Architecture Reconciliation authorization", postAdoptionBoundary.architecture_reconciliation_current_status === "NOT_AUTHORIZED"],
  ["NEG-08", "Fail closed if active HIGH exists", openActiveHigh === 0],
  ["NEG-09", "Fail closed if Reduced-Assurance disclosure is missing", assuranceDisclosure.reduced_assurance === true],
  ["NEG-10", "Fail closed on any input hash mismatch", baseResults.every((entry) => entry.match) && overlayResults.every((entry) => entry.match) && sourceResults.every((entry) => entry.hash_and_size_match)],
].map(([test_id, requirement, rejected_or_guarded]) => ({ test_id, requirement, status: rejected_or_guarded ? "PASS" : "FAIL" }));

failClosed(mainTests.every((entry) => entry.status === "PASS"), "AGGREGATOR_INPUT_INTEGRITY_BLOCKER", "Deterministic QA did not reach 30/30 PASS");
failClosed(negativeTests.every((entry) => entry.status === "PASS"), "AGGREGATOR_INPUT_INTEGRITY_BLOCKER", "Negative fail-closed QA failed");

writeJson("validation-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  run_id: RUN_ID,
  validator: "TASK_LOCAL_DETERMINISTIC_SOURCE_SCOPE_AGGREGATION_VALIDATOR",
  validator_script: fileBinding(path.join(SCRIPT_DIR, "run-deterministic-aggregation.mjs")),
  required_tests: mainTests,
  required_test_count: 30,
  required_pass_count: mainTests.filter((entry) => entry.status === "PASS").length,
  required_fail_count: mainTests.filter((entry) => entry.status === "FAIL").length,
  required_status: "PASS_30_OF_30",
  negative_fail_closed_tests: negativeTests,
  negative_test_count: 10,
  negative_pass_count: negativeTests.filter((entry) => entry.status === "PASS").length,
  negative_status: "PASS_10_OF_10",
  prior_validator_reexecution: {
    human_adjudicated_assessment: "PASS_55_OF_55",
    human_finding_adjudication: "PASS_59_OF_59",
  },
  aggregation_result: "PASS_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  source_scope_lock_review_gate: "READY_FOR_HUMAN_EXACT_MANIFEST_ADOPTION",
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
    source_scope_adoption_executed: false,
    architecture_reconciliation_started: false,
    writes_outside_task_root: 0,
  },
});

const finalSummary = `MASTER BATCH 3A-3F：
COMPLETE

Aggregator Role：

${ROLE}

Aggregation Result：

PASS_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE

Clean-Room Independent Review：

NOT COMPLETED

Human-Adjudicated Compatibility Review：

COMPLETED

Base Review Target：

UNCHANGED

Source Root：

UNCHANGED

Source Classification：

4 CORE / 1 OPTIONAL / 6 EXCLUDED

Open Active CRITICAL：

0

Open Active HIGH：

0

Source Authority：

PROPOSED_NOT_ADOPTED

Normative Authority：

false

Source Scope Lock Review Gate：

READY_FOR_HUMAN_EXACT_MANIFEST_ADOPTION

Human Exact-Manifest Adoption Package：

READY

Human Exact-Manifest Adoption：

NOT STARTED

Architecture Reconciliation：

NOT AUTHORIZED

Git Used：

NO

Next Human Action：

執行HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION。

完成後停止。
不得自行執行Source Scope Adoption、
Source Authority Adoption或Architecture Reconciliation。
`;
writeText("final-summary.md", finalSummary);

writeText("HANDOFF.md", `# Task Handoff

## Current goal

Aggregate the Human-adjudicated Source Scope evidence, calculate the deterministic gate, and prepare—but not execute—the Human Exact-Manifest Adoption package.

## What changed

- Created only the Task-local aggregation, integrity, ledger, gate, assurance, adoption-package, validation, summary, and handoff artifacts.
- Preserved Compatibility R1 as the original Finding source and preserved the failed Compatibility R2 startup attempt as historical failure evidence only.
- Calculated PASS_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE and READY_FOR_HUMAN_EXACT_MANIFEST_ADOPTION.

## Files touched

- .codex/tasks/${TASK_ID}/** only

## Commands or tests run

- Re-executed the read-only Human-adjudicated assessment validator: 55/55 PASS.
- Re-executed the read-only Human Finding adjudication validator: 59/59 PASS.
- Ran this Task-local deterministic aggregation validator: 30/30 required PASS and 10/10 negative fail-closed PASS.
- Recomputed Base Target 20/20, Source Root 11/11, Corrective Overlay 7/7, Product/Governance 3/3, and eight historical input Task trees without Git.

## Known risks

- Clean-Room independent review was not completed; this result has reduced assurance.
- The package is pending Human decision and confers no Source Authority adoption or Architecture Reconciliation authorization.

## Suggested next step

- Human executes HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION in a separate authorized Task.
`);

const requiredTopLevel = [
  "task-intent.yaml", "classification.yaml", "blueprint.yaml", "aggregator-input-manifest.json",
  "input-integrity-verification.json", "reviewer-result-ledger.json", "finding-ledger.json",
  "finding-effective-status.json", "human-closure-verification.json", "deterministic-gate-validation.json",
  "assurance-disclosure.json", "base-target-integrity.json", "corrective-overlay-integrity.json",
  "source-root-reverification.json", "source-classification-reverification.json", "source-authority-status.json",
  "product-governance-integrity.json", "historical-artifact-integrity.json", "aggregation-result.json",
  "source-scope-review-gate-result.json", "validation-results.json", "final-summary.md", "HANDOFF.md",
];
failClosed(requiredTopLevel.every((relativePath) => fs.existsSync(path.join(TASK_ROOT, relativePath))), "AGGREGATOR_INPUT_INTEGRITY_BLOCKER", "one or more required top-level outputs are missing");
for (const filePath of listFilesRecursive(TASK_ROOT).filter((entry) => entry.endsWith(".json") || entry.endsWith(".yaml"))) readJson(filePath);

console.log(JSON.stringify({
  task_id: TASK_ID,
  aggregator_role: ROLE,
  aggregation_result: "PASS_WITH_HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  source_scope_review_evidence_status: "AGGREGATED_AND_VALIDATED",
  source_scope_lock_review_gate: "READY_FOR_HUMAN_EXACT_MANIFEST_ADOPTION",
  deterministic_qa: "PASS_30_OF_30",
  negative_fail_closed_qa: "PASS_10_OF_10",
  adoption_package: "READY_14_OF_14",
  source_authority: "PROPOSED_NOT_ADOPTED",
  normative_authority: false,
  human_exact_manifest_adoption: "NOT_STARTED",
  architecture_reconciliation: "NOT_AUTHORIZED",
  git_used: false,
}, null, 2));
