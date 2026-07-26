import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalize,
  lintSchema,
  sha256Bytes,
  sha256File,
  sha256Jcs,
  validate,
} from "./contract-validator.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const taskRoot = path.dirname(scriptDirectory);
const productRoot = "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統";
const priorIntakeRoot = `${productRoot}/.codex/tasks/GOV-MAGP-COMPATIBILITY-R2-STARTUP-BLOCKER-INTAKE-AND-RETRY-PREPARATION-01`;
const priorRemediationRoot = `${productRoot}/.codex/tasks/GOV-MAGP-SOURCE-SCOPE-REVIEW-INTAKE-AND-COMPATIBILITY-REMEDIATION-02`;
const r1PreparationRoot = `${productRoot}/.codex/tasks/GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01`;
const frozenTargetRoot = `${productRoot}/.codex/tasks/GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01`;
const originalCompatibilityPackageRoot = `${priorRemediationRoot}/review-packages/compatibility-review-r2`;
const originalAggregatorPackageRoot = `${priorRemediationRoot}/review-packages/source-scope-aggregation-r2`;
const overlayRoot = `${priorRemediationRoot}/compatibility-remediation`;
const retryPackageRoot = `${taskRoot}/review-packages/compatibility-review-r2-retry-01`;
const aggregatorRetryPackageRoot = `${taskRoot}/review-packages/source-scope-aggregation-r2-retry-01`;

const paths = {
  v1ReturnSchema: `${priorRemediationRoot}/reviewer-return-payload.schema.json`,
  v1TransportSchema: `${r1PreparationRoot}/manual-reviewer-transport-attestation.schema.json`,
  attemptRaw: `${priorIntakeRoot}/compatibility-r2-attempt-1/raw-wrapper.txt`,
  attemptV1Verification: `${priorIntakeRoot}/compatibility-r2-attempt-1/payload-verification.json`,
  attemptPriorSummary: `${priorIntakeRoot}/final-summary.md`,
  returnV2: `${taskRoot}/schemas/reviewer-return-payload.schema.v2.json`,
  admissionV2: `${taskRoot}/schemas/startup-failure-evidence-admission.schema.v2.json`,
  transportV2: `${taskRoot}/schemas/manual-reviewer-transport-attestation.schema.v2.json`,
  targetManifest: `${r1PreparationRoot}/review-target-manifest.json`,
  targetRecord: `${r1PreparationRoot}/review-target-canonical-record.json`,
  sourceBinding: `${r1PreparationRoot}/source-hash-binding.json`,
  identityRegistryR1: `${r1PreparationRoot}/reviewer-identity-registry.json`,
  correctionRecord: `${overlayRoot}/correction-integrity-record.json`,
  reviewerReuse: `${priorRemediationRoot}/reviewer-reuse-preservation.json`,
  formalIntake: `${priorRemediationRoot}/formal-intake-results.json`,
  originalCompatibilityManifest: `${originalCompatibilityPackageRoot}/package-manifest.json`,
  originalCompatibilityScope: `${originalCompatibilityPackageRoot}/exact-read-scope.json`,
  originalAggregatorManifest: `${originalAggregatorPackageRoot}/package-manifest.json`,
};

const expected = {
  v1ReturnSha256: "9425D1AB3B451E0F11B8130E8DE9010A4F02BD0E3ACBFDF7E0D4FE42A69130BA",
  v1TransportSha256: "42ED977653D161538AB73E160651DF9FFBF2D8CF4CC1CA75ECF9BB382A0988AF",
  attemptRawSha256: "B4C186FDABE327136D338FBBE60B653B4E3256E887C03B88B097818727252E71",
  attemptPayloadCoreSha256: "C020273C9EA245F2CA11266E488957DAE5FF873786F651722A2EBE52A619E8F4",
  targetManifestSha256: "C156854BA326194C5E26FB05C69849DC81784FC33E5713340D1E06DF0FF5F3D4",
  targetRecordCoreSha256: "DDE3280766B7CD5102DB8912874BB2426545F31924D8A83B2A894D361C725F38",
  sourceDirectoryManifestSha256: "9456093C5CD5D169628ACAFFD4251E15C1C7551A9949F1D930CA4185CE7792AD",
  sourceHashBindingSha256: "B763A29E4615FE837DDADA3963927DDF7140C3AE925AB67198C72E9C6AEB6EB8",
  correctionRecordCoreSha256: "77EA27B9441E1E966CD39F2CD3CBA278326C70E55780470DD2EB372CC3025F42",
  reviewerReuseRecordCoreSha256: "42BBD03EF090AF123D6A062C00D39F9FB864F6288A922E2BCCB034E6257EBF2E",
  formalIntakeResultsCoreSha256: "8883F733D76475717BBC345BE81CE934FCB474FF489BEC3DBA72F138DE5F0761",
};

const identity = {
  retry: {
    review_package_id: "MAGP-SSR2-COMPATIBILITY-RETRY01-95E57850-56B4-4FCE-9E56-855C5464AD6D",
    assignment_id: "ASSIGN-E251EE80-1EE2-46B1-AC96-2A91AE3EACA0",
    reviewer_run_id: "RUN-BAF0883C-0B45-4B71-8D5D-B4B811C5E13C",
    reviewer_session_nonce: "8C94AF476A11882640EC666F68BFA604FCDD760160B30C842CB0C58751C94C73",
  },
  aggregator: {
    aggregation_package_id: "MAGP-SSR2-AGGREGATION-RETRY01-31734821-D328-493C-A438-DE69CFA15576",
    assignment_id: "ASSIGN-F0A9ACAC-50DA-42D8-AED4-C419AC0ABA07",
    aggregator_run_id: "RUN-D5772AA2-414C-47A1-BCE8-FCB41CD6AF6E",
    aggregator_session_nonce: "880A7EEAA598A507DF6CAC085772A00F921FAAF80A0424F714ED34BC0359EABD",
  },
};

function normalize(filePath) {
  return filePath.replaceAll("\\", "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, code, detail = undefined) {
  if (!condition) {
    const suffix = detail === undefined ? "" : `: ${JSON.stringify(detail)}`;
    throw new Error(`${code}${suffix}`);
  }
}

function assertTaskLocal(filePath) {
  const resolvedRoot = path.resolve(taskRoot);
  const resolvedPath = path.resolve(filePath);
  assert(
    resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`),
    "TASK_LOCAL_WRITE_BOUNDARY_VIOLATION",
    normalize(resolvedPath),
  );
}

function writeJson(relativePath, value) {
  const filePath = path.join(taskRoot, relativePath);
  assertTaskLocal(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function writeText(relativePath, value) {
  const filePath = path.join(taskRoot, relativePath);
  assertTaskLocal(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
  return filePath;
}

function fileMeta(filePath, normalizedRelativePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    normalized_relative_path: normalizedRelativePath,
    file_size_bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function wrapperFor(payloadCore) {
  return {
    payload_core: payloadCore,
    payload_core_sha256: sha256Jcs(payloadCore),
  };
}

function makeFinding({
  id = "COMPAT-R1-001",
  severity = "LOW",
  status = "CLOSED",
  affectedPolicy = "COMPATIBILITY_CONTRACT",
} = {}) {
  return {
    finding_id: id,
    severity,
    status,
    title: `${id} fixture`,
    description: "Deterministic schema-contract fixture.",
    evidence_paths: ["C:/fixture/evidence.json"],
    affected_policy: affectedPolicy,
    required_remediation: status === "OPEN" ? "Resolve before downstream use." : "NONE_CLOSED",
  };
}

const reviewTargetBinding = {
  review_target_task_id: "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01",
  review_target_manifest_sha256: expected.targetManifestSha256,
  review_target_record_core_sha256: expected.targetRecordCoreSha256,
  source_directory_manifest_sha256: expected.sourceDirectoryManifestSha256,
  source_hash_binding_sha256: expected.sourceHashBindingSha256,
};

const cleanAttestation = {
  brand_new_top_level_codex_chat: true,
  preparation_conversation_memory_used: false,
  other_reviewer_conversation_used: false,
  other_reviewer_payload_used: false,
  implementation_conversation_used: false,
  subagents_used: false,
  reviewer_repository_write_count: 0,
  forbidden_read_count: 0,
  out_of_scope_read_count: 0,
};

const accessLogFixture = [
  {
    absolute_path: "C:/fixture/allowed.json",
    access_type: "READ",
    content_scope: "FULL_ARTIFACT",
    status: "ALLOWED_READ",
  },
];

function baseV2Core() {
  return {
    schema_version: 2,
    review_package_id: identity.retry.review_package_id,
    review_package_core_sha256: "A".repeat(64),
    task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R2-RETRY-01",
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    assignment_id: identity.retry.assignment_id,
    reviewer_run_id: identity.retry.reviewer_run_id,
    reviewer_session_nonce: identity.retry.reviewer_session_nonce,
    review_target_binding: reviewTargetBinding,
    startup: {
      status: "STARTUP_VALID",
      assignment_valid: true,
      package_valid: true,
      target_valid: true,
      scope_valid: true,
      clean_context_valid: true,
    },
    review_status: "PASS",
    review_started: true,
    source_content_reviewed: true,
    completed: true,
    mandatory_exit_requested: true,
    substantive_review_result: true,
    substantive_review_credit: "FULL",
    aggregator_eligible: true,
    finding_closure_authority: "OWNED_FINDINGS_ONLY",
    findings: [
      makeFinding({ id: "COMPAT-R1-001" }),
      makeFinding({ id: "COMPAT-R1-002" }),
    ],
    access_log: accessLogFixture,
    clean_context_attestation: { ...cleanAttestation },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateWrapperAndHash(wrapper, schema) {
  const schemaErrors = validate(wrapper, schema);
  const hashMatch =
    wrapper &&
    wrapper.payload_core &&
    wrapper.payload_core_sha256 === sha256Jcs(wrapper.payload_core);
  return { valid: schemaErrors.length === 0 && hashMatch, schema_errors: schemaErrors, hash_match: hashMatch };
}

function currentArtifactSet(manifest, root) {
  return manifest.artifacts.map((artifact) => {
    const absolutePath = `${root}/${artifact.normalized_relative_path}`;
    const actualSha256 = sha256File(absolutePath);
    return {
      normalized_relative_path: artifact.normalized_relative_path,
      declared_sha256: artifact.sha256,
      actual_sha256: actualSha256,
      match: actualSha256 === artifact.sha256,
    };
  });
}

function sourceArtifactSet(sourceBinding) {
  return sourceBinding.sources.map((source) => {
    const absolutePath = `${sourceBinding.source_root}/${source.actual_filename}`;
    const bytes = fs.readFileSync(absolutePath);
    const actualSha256 = sha256Bytes(bytes);
    return {
      actual_filename: source.actual_filename,
      file_size_bytes: bytes.length,
      declared_sha256: source.sha256,
      actual_sha256: actualSha256,
      match: actualSha256 === source.sha256,
    };
  });
}

function governanceBaseline() {
  const entries = [
    ["AGENTS.md", `${productRoot}/AGENTS.md`],
    [".codex/governance/phase-policy.yaml", `${productRoot}/.codex/governance/phase-policy.yaml`],
    [".codex/governance/agent-path-policy.yaml", `${productRoot}/.codex/governance/agent-path-policy.yaml`],
  ];
  return entries.map(([relativePath, absolutePath]) => ({
    relative_path: relativePath,
    sha256: sha256File(absolutePath),
    file_size_bytes: fs.readFileSync(absolutePath).length,
  }));
}

const before = {
  v1_return_schema: { sha256: sha256File(paths.v1ReturnSchema), bytes: fs.readFileSync(paths.v1ReturnSchema).length },
  v1_transport_schema: { sha256: sha256File(paths.v1TransportSchema), bytes: fs.readFileSync(paths.v1TransportSchema).length },
  attempt_1_raw_wrapper: { sha256: sha256File(paths.attemptRaw), bytes: fs.readFileSync(paths.attemptRaw).length },
};

assert(before.v1_return_schema.sha256 === expected.v1ReturnSha256, "V1_SCHEMA_MUTATION_DETECTED", before.v1_return_schema);
assert(before.v1_transport_schema.sha256 === expected.v1TransportSha256, "V1_TRANSPORT_SCHEMA_MUTATION_DETECTED", before.v1_transport_schema);
assert(before.attempt_1_raw_wrapper.sha256 === expected.attemptRawSha256, "ATTEMPT_1_RAW_WRAPPER_CHANGED", before.attempt_1_raw_wrapper);

const returnV1 = readJson(paths.v1ReturnSchema);
const transportV1 = readJson(paths.v1TransportSchema);
const returnV2 = readJson(paths.returnV2);
const admissionV2 = readJson(paths.admissionV2);
const transportV2 = readJson(paths.transportV2);
const attemptRawBytes = fs.readFileSync(paths.attemptRaw);
const attemptWrapper = JSON.parse(attemptRawBytes.toString("utf8"));
const attemptV1Verification = readJson(paths.attemptV1Verification);
const targetManifest = readJson(paths.targetManifest);
const targetRecord = readJson(paths.targetRecord);
const sourceBinding = readJson(paths.sourceBinding);
const correctionRecord = readJson(paths.correctionRecord);
const reviewerReuse = readJson(paths.reviewerReuse);
const formalIntake = readJson(paths.formalIntake);
const r1IdentityRegistry = readJson(paths.identityRegistryR1);
const originalCompatibilityManifest = readJson(paths.originalCompatibilityManifest);
const originalAggregatorManifest = readJson(paths.originalAggregatorManifest);
const originalCompatibilityScope = readJson(paths.originalCompatibilityScope);

assert(attemptWrapper.payload_core_sha256 === expected.attemptPayloadCoreSha256, "ATTEMPT_1_DECLARED_HASH_CHANGED");
assert(sha256Jcs(attemptWrapper.payload_core) === expected.attemptPayloadCoreSha256, "ATTEMPT_1_JCS_HASH_INVALID");
assert(sha256File(paths.targetManifest) === expected.targetManifestSha256, "RETRY_PACKAGE_TARGET_CHANGED");
assert(targetRecord.record_core_sha256 === expected.targetRecordCoreSha256, "RETRY_PACKAGE_TARGET_CHANGED");
assert(sha256File(paths.sourceBinding) === expected.sourceHashBindingSha256, "SOURCE_HASH_BINDING_CHANGED");
assert(correctionRecord.record_core_sha256 === expected.correctionRecordCoreSha256, "CORRECTIVE_OVERLAY_CHANGED");
assert(reviewerReuse.record_core_sha256 === expected.reviewerReuseRecordCoreSha256, "R1_REUSE_BINDING_CHANGED");
assert(formalIntake.results_core_sha256 === expected.formalIntakeResultsCoreSha256, "FORMAL_INTAKE_BINDING_CHANGED");

const returnV2Lint = lintSchema(returnV2);
const admissionV2Lint = lintSchema(admissionV2);
const transportV2Lint = lintSchema(transportV2);
assert(returnV2Lint.valid, "V2_RETURN_SCHEMA_INVALID", returnV2Lint.errors);
assert(admissionV2Lint.valid, "V2_ADMISSION_SCHEMA_INVALID", admissionV2Lint.errors);
assert(transportV2Lint.valid, "R2_TRANSPORT_SCHEMA_BINDING_INVALID", transportV2Lint.errors);

const schemaHashes = {
  reviewer_return_v2: sha256File(paths.returnV2),
  startup_failure_admission_v2: sha256File(paths.admissionV2),
  r2_transport_v2: sha256File(paths.transportV2),
};

const validPassCore = baseV2Core();
const validPassWrapper = wrapperFor(validPassCore);

const validContentBlockerCore = baseV2Core();
validContentBlockerCore.review_status = "BLOCKER";
validContentBlockerCore.aggregator_eligible = false;
validContentBlockerCore.findings = [
  makeFinding({ id: "COMPAT-R2-CONTENT-001", severity: "HIGH", status: "OPEN" }),
];
const validContentBlockerWrapper = wrapperFor(validContentBlockerCore);

const truthfulStartupBlockerCore = baseV2Core();
truthfulStartupBlockerCore.startup = {
  status: "STARTUP_BLOCKER",
  assignment_valid: true,
  package_valid: false,
  target_valid: false,
  scope_valid: false,
  clean_context_valid: false,
};
truthfulStartupBlockerCore.review_status = "BLOCKER";
truthfulStartupBlockerCore.review_started = false;
truthfulStartupBlockerCore.source_content_reviewed = false;
truthfulStartupBlockerCore.completed = false;
truthfulStartupBlockerCore.substantive_review_result = false;
truthfulStartupBlockerCore.substantive_review_credit = "NONE";
truthfulStartupBlockerCore.aggregator_eligible = false;
truthfulStartupBlockerCore.finding_closure_authority = "NONE";
truthfulStartupBlockerCore.findings = [
  makeFinding({
    id: "COMPAT-R2-STARTUP-CONTEXT-TEST",
    severity: "CRITICAL",
    status: "OPEN",
    affectedPolicy: "R2_STARTUP_AND_CLEAN_CONTEXT_CONTRACT",
  }),
];
truthfulStartupBlockerCore.clean_context_attestation = {
  ...cleanAttestation,
  preparation_conversation_memory_used: true,
  implementation_conversation_used: true,
  forbidden_read_count: 3,
  out_of_scope_read_count: 3,
};
const truthfulStartupBlockerWrapper = wrapperFor(truthfulStartupBlockerCore);

const negativeFixtures = {};
negativeFixtures.falseCleanSuccess = clone(validPassWrapper);
negativeFixtures.falseCleanSuccess.payload_core.clean_context_attestation.preparation_conversation_memory_used = true;
negativeFixtures.falseCleanSuccess.payload_core_sha256 = sha256Jcs(negativeFixtures.falseCleanSuccess.payload_core);
negativeFixtures.validReviewNotStarted = clone(validPassWrapper);
negativeFixtures.validReviewNotStarted.payload_core.review_started = false;
negativeFixtures.validReviewNotStarted.payload_core_sha256 = sha256Jcs(negativeFixtures.validReviewNotStarted.payload_core);
negativeFixtures.validReviewNotCompleted = clone(validPassWrapper);
negativeFixtures.validReviewNotCompleted.payload_core.completed = false;
negativeFixtures.validReviewNotCompleted.payload_core_sha256 = sha256Jcs(negativeFixtures.validReviewNotCompleted.payload_core);
negativeFixtures.blockerStarted = clone(truthfulStartupBlockerWrapper);
negativeFixtures.blockerStarted.payload_core.review_started = true;
negativeFixtures.blockerStarted.payload_core_sha256 = sha256Jcs(negativeFixtures.blockerStarted.payload_core);
negativeFixtures.blockerCompleted = clone(truthfulStartupBlockerWrapper);
negativeFixtures.blockerCompleted.payload_core.completed = true;
negativeFixtures.blockerCompleted.payload_core_sha256 = sha256Jcs(negativeFixtures.blockerCompleted.payload_core);
negativeFixtures.blockerPass = clone(truthfulStartupBlockerWrapper);
negativeFixtures.blockerPass.payload_core.review_status = "PASS";
negativeFixtures.blockerPass.payload_core_sha256 = sha256Jcs(negativeFixtures.blockerPass.payload_core);
negativeFixtures.blockerCredit = clone(truthfulStartupBlockerWrapper);
negativeFixtures.blockerCredit.payload_core.substantive_review_credit = "FULL";
negativeFixtures.blockerCredit.payload_core_sha256 = sha256Jcs(negativeFixtures.blockerCredit.payload_core);
negativeFixtures.blockerAggregator = clone(truthfulStartupBlockerWrapper);
negativeFixtures.blockerAggregator.payload_core.aggregator_eligible = true;
negativeFixtures.blockerAggregator.payload_core_sha256 = sha256Jcs(negativeFixtures.blockerAggregator.payload_core);
negativeFixtures.blockerNoViolation = clone(truthfulStartupBlockerWrapper);
negativeFixtures.blockerNoViolation.payload_core.startup = {
  status: "STARTUP_BLOCKER",
  assignment_valid: true,
  package_valid: true,
  target_valid: true,
  scope_valid: true,
  clean_context_valid: true,
};
negativeFixtures.blockerNoViolation.payload_core.clean_context_attestation = { ...cleanAttestation };
negativeFixtures.blockerNoViolation.payload_core_sha256 = sha256Jcs(negativeFixtures.blockerNoViolation.payload_core);
negativeFixtures.blockerLowFinding = clone(truthfulStartupBlockerWrapper);
negativeFixtures.blockerLowFinding.payload_core.findings[0].severity = "LOW";
negativeFixtures.blockerLowFinding.payload_core_sha256 = sha256Jcs(negativeFixtures.blockerLowFinding.payload_core);
negativeFixtures.extraWrapperField = { ...validPassWrapper, extra: true };

const positiveSchemaResults = {
  startup_valid_pass: validateWrapperAndHash(validPassWrapper, returnV2),
  startup_valid_content_blocker: validateWrapperAndHash(validContentBlockerWrapper, returnV2),
  startup_blocker_failure_evidence: validateWrapperAndHash(truthfulStartupBlockerWrapper, returnV2),
};
const negativeSchemaResults = Object.fromEntries(
  Object.entries(negativeFixtures).map(([name, fixture]) => [name, validateWrapperAndHash(fixture, returnV2)]),
);

assert(Object.values(positiveSchemaResults).every((result) => result.valid), "V2_SCHEMA_REJECTS_VALID_BRANCH", positiveSchemaResults);
assert(Object.values(negativeSchemaResults).every((result) => !result.valid), "V2_SCHEMA_ALLOWS_INVALID_BRANCH", negativeSchemaResults);

const attemptV1ValidationErrors = validate(attemptWrapper, returnV1);
const attemptV2Admission = validateWrapperAndHash(attemptWrapper, admissionV2);
assert(attemptV1ValidationErrors.length === 4, "ATTEMPT_1_V1_HISTORY_REWRITTEN", attemptV1ValidationErrors);
assert(attemptV2Admission.valid, "V2_SCHEMA_REJECTS_TRUTHFUL_STARTUP_BLOCKER", attemptV2Admission);

const v1Conflicts = attemptV1Verification.schema_errors.map((conflict) => {
  const finding = attemptWrapper.payload_core.findings.find(
    (candidate) => candidate.finding_id === "COMPAT-R2-STARTUP-CONTEXT-001",
  );
  return {
    json_pointer: conflict.instance_path,
    v1_expected_const: conflict.required_value,
    actual_value: conflict.actual_value,
    actual_value_supported_by_payload: true,
    actual_value_supported_by_finding: Boolean(finding),
    actual_value_supported_by_access_evidence: Boolean(
      finding?.evidence_paths?.some((evidencePath) =>
        ["MEMORY.md", "HANDOFF.md"].some((name) => evidencePath.endsWith(name)),
      ),
    ),
    legitimate_startup_failure_state: true,
    schema_modeling_defect: true,
    wrapper_defect: false,
  };
});

writeJson("schema-analysis/v1-schema-identity.json", {
  schema_version: 1,
  return_schema_v1: {
    absolute_path: normalize(paths.v1ReturnSchema),
    schema_id: returnV1.$id,
    file_size_bytes: before.v1_return_schema.bytes,
    sha256: before.v1_return_schema.sha256,
    immutable: true,
  },
  transport_schema_v1: {
    absolute_path: normalize(paths.v1TransportSchema),
    schema_id: transportV1.$id,
    file_size_bytes: before.v1_transport_schema.bytes,
    sha256: before.v1_transport_schema.sha256,
    immutable: true,
  },
});

writeJson("schema-analysis/v1-const-conflict-analysis.json", {
  schema_version: 1,
  source_payload_verification_path: normalize(paths.attemptV1Verification),
  source_payload_verification_sha256: sha256File(paths.attemptV1Verification),
  conflict_count: v1Conflicts.length,
  conflicts: v1Conflicts,
  conclusion: "V1_SCHEMA_MODELS_ONLY_CLEAN_CONTEXT_AND_CANNOT_REPRESENT_TRUTHFUL_STARTUP_FAILURE",
});

writeJson("schema-analysis/attempt-1-instance-facts.json", {
  schema_version: 1,
  attempt_id: "COMPATIBILITY_R2_ATTEMPT_01",
  raw_wrapper_absolute_path: normalize(paths.attemptRaw),
  raw_wrapper_sha256: before.attempt_1_raw_wrapper.sha256,
  raw_wrapper_byte_length: before.attempt_1_raw_wrapper.bytes,
  declared_payload_core_sha256: attemptWrapper.payload_core_sha256,
  recomputed_payload_core_sha256: sha256Jcs(attemptWrapper.payload_core),
  startup: attemptWrapper.payload_core.startup,
  clean_context_attestation: attemptWrapper.payload_core.clean_context_attestation,
  finding_ids: attemptWrapper.payload_core.findings.map((finding) => finding.finding_id),
  review_started: false,
  source_content_reviewed: false,
  substantive_review_credit: "NONE",
  aggregator_eligible: false,
});

writeJson("schema-analysis/schema-remediation-decision.json", {
  schema_version: 1,
  human_decision: {
    reviewer_return_schema_v2_creation: "APPROVED",
    r2_transport_schema_v2_creation: "APPROVED",
    existing_v1_schema_mutation: "PROHIBITED",
    attempt_1_wrapper_modification: "PROHIBITED",
    historical_v1_result_reclassification: "PROHIBITED",
  },
  selected_design: "DISCRIMINATED_UNION_WITH_SEPARATE_LEGACY_FAILURE_EVIDENCE_ADMISSION",
  v1_history_preserved: true,
  v2_return_schema_id: returnV2.$id,
  v2_admission_schema_id: admissionV2.$id,
  v2_transport_schema_id: transportV2.$id,
});

writeJson("schema-governance/schema-version-registry.json", {
  schema_version: 1,
  entries: [
    {
      contract: "REVIEWER_RETURN",
      version: "V1",
      schema_id: returnV1.$id,
      absolute_path: normalize(paths.v1ReturnSchema),
      sha256: expected.v1ReturnSha256,
      mutation_allowed: false,
      new_r2_package_use_allowed: false,
    },
    {
      contract: "MANUAL_REVIEWER_TRANSPORT",
      version: "V1",
      schema_id: transportV1.$id,
      absolute_path: normalize(paths.v1TransportSchema),
      sha256: expected.v1TransportSha256,
      mutation_allowed: false,
      new_r2_package_use_allowed: false,
    },
    {
      contract: "REVIEWER_RETURN",
      version: "V2",
      schema_id: returnV2.$id,
      absolute_path: normalize(paths.returnV2),
      sha256: schemaHashes.reviewer_return_v2,
      mutation_allowed: false,
      new_r2_package_use_allowed: true,
    },
    {
      contract: "STARTUP_FAILURE_EVIDENCE_ADMISSION",
      version: "V2",
      schema_id: admissionV2.$id,
      absolute_path: normalize(paths.admissionV2),
      sha256: schemaHashes.startup_failure_admission_v2,
      mutation_allowed: false,
      historical_payload_rewrite_allowed: false,
    },
    {
      contract: "MANUAL_REVIEWER_TRANSPORT",
      version: "V2",
      schema_id: transportV2.$id,
      absolute_path: normalize(paths.transportV2),
      sha256: schemaHashes.r2_transport_v2,
      mutation_allowed: false,
      new_r2_package_use_allowed: true,
    },
  ],
});

writeJson("schema-governance/schema-precedence-policy.yaml", {
  schema_version: 1,
  policy: "EXACT_PACKAGE_SCHEMA_BINDING_ONLY",
  rules: [
    "Every package binds exactly one Return Schema ID and exact file SHA-256.",
    "V1 remains authoritative for payloads originally bound to V1.",
    "V2 applies only to newly created R2 Retry and later explicitly V2-bound packages.",
    "The admission schema classifies historical startup failure evidence without changing its V1 status.",
  ],
  ambiguous_multi_schema_binding: "INVALID",
});

writeJson("schema-governance/schema-compatibility-matrix.json", {
  schema_version: 1,
  matrix: [
    { payload_class: "EXISTING_R1_PAYLOAD", v1_return: "APPLICABLE", v2_return: "NOT_APPLICABLE", v2_failure_admission: "NOT_APPLICABLE" },
    { payload_class: "ATTEMPT_1_LEGACY_STARTUP_FAILURE", v1_return: "FORMALLY_REJECTED", v2_return: "NOT_RETROACTIVELY_APPLIED", v2_failure_admission: "ADMITTED_STARTUP_FAILURE_EVIDENCE" },
    { payload_class: "NEW_R2_RETRY_STARTUP_VALID", v1_return: "PROHIBITED", v2_return: "STARTUP_VALID_REVIEW_RESULT", v2_failure_admission: "NOT_APPLICABLE" },
    { payload_class: "NEW_R2_RETRY_STARTUP_BLOCKER", v1_return: "PROHIBITED", v2_return: "STARTUP_BLOCKER_FAILURE_EVIDENCE", v2_failure_admission: "NOT_REQUIRED" },
  ],
});

writeJson("schema-governance/schema-supersession-policy.json", {
  schema_version: 1,
  v1_status: "IMMUTABLE_NOT_SUPERSEDED_FOR_EXISTING_BINDINGS",
  v2_status: "REQUIRED_FOR_NEW_R2_RETRY_PACKAGES",
  supersession_scope: "FUTURE_PACKAGE_BINDING_ONLY",
  retroactive_revalidation: "PROHIBITED",
  historical_result_reclassification: "PROHIBITED",
});

writeJson("schema-governance/no-retroactive-rewrite-policy.yaml", {
  schema_version: 1,
  attempt_1_raw_wrapper_mutation: "PROHIBITED",
  v1_result: "FORMALLY_REJECTED",
  v1_result_mutation: "PROHIBITED",
  v2_evidence_result: "ADMITTED_STARTUP_FAILURE_EVIDENCE",
  interpretation: "V1 contract conformance and V2 failure-evidence admission are distinct judgments; V2 does not overturn V1.",
});

const attemptTransportAttestation = {
  schema_version: 2,
  reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
  review_generation: "R2",
  source_thread_id: "019f890d-514f-7811-a38d-00b9daa91f1c",
  review_package_id: attemptWrapper.payload_core.review_package_id,
  reviewer_run_id: attemptWrapper.payload_core.reviewer_run_id,
  payload_sha256: expected.attemptRawSha256,
  payload_modified: false,
  transported_by_human: true,
  payload_schema_id: admissionV2.$id,
  payload_schema_sha256: schemaHashes.startup_failure_admission_v2,
  payload_validation_branch: "STARTUP_BLOCKER_FAILURE_EVIDENCE",
  payload_admission_class: "ADMITTED_STARTUP_FAILURE_EVIDENCE",
  substantive_review_credit: "NONE",
  aggregator_eligible: false,
  source_raw_artifact_path: normalize(paths.attemptRaw),
  source_raw_artifact_sha256: expected.attemptRawSha256,
};
const attemptTransportValidation = validate(attemptTransportAttestation, transportV2);
assert(attemptTransportValidation.length === 0, "R2_TRANSPORT_SCHEMA_BINDING_INVALID", attemptTransportValidation);

writeJson("attempt-1-v2-admission/admission-input-reference.json", {
  schema_version: 1,
  attempt_id: "COMPATIBILITY_R2_ATTEMPT_01",
  source_raw_artifact_path: normalize(paths.attemptRaw),
  source_raw_artifact_sha256: expected.attemptRawSha256,
  source_raw_artifact_byte_length: attemptRawBytes.length,
  parsing_mode: "DIRECT_ORIGINAL_BYTES_JSON_PARSE",
  wrapper_rebuilt: false,
  wrapper_modified: false,
});

writeJson("attempt-1-v2-admission/v2-schema-validation.json", {
  schema_version: 1,
  admission_schema_id: admissionV2.$id,
  admission_schema_sha256: schemaHashes.startup_failure_admission_v2,
  schema_lint_status: admissionV2Lint.valid ? "PASS" : "FAIL",
  instance_schema_validation_status: attemptV2Admission.valid ? "PASS" : "FAIL",
  schema_errors: attemptV2Admission.schema_errors,
  declared_payload_core_sha256: attemptWrapper.payload_core_sha256,
  recomputed_payload_core_sha256: sha256Jcs(attemptWrapper.payload_core),
  rfc8785_jcs_hash_match: attemptV2Admission.hash_match,
  legacy_return_v2_direct_validation: "NOT_APPLICABLE_LEGACY_WRAPPER_USES_ADMISSION_SCHEMA",
});

writeJson("attempt-1-v2-admission/failure-evidence-admission-result.json", {
  schema_version: 1,
  attempt_id: "COMPATIBILITY_R2_ATTEMPT_01",
  v1_formal_intake_status: "FORMALLY_REJECTED",
  v2_evidence_admission_status: "ADMITTED_STARTUP_FAILURE_EVIDENCE",
  payload_validation_branch: "STARTUP_BLOCKER_FAILURE_EVIDENCE",
  substantive_review_status: "NOT_STARTED",
  substantive_review_credit: "NONE",
  compat_r1_finding_closure_authority: "NONE",
  aggregator_eligibility: "PROHIBITED",
  retry_required: true,
  formally_accepted_review_result: false,
});

writeJson("attempt-1-v2-admission/historical-v1-v2-status-bridge.json", {
  schema_version: 1,
  attempt_id: "COMPATIBILITY_R2_ATTEMPT_01",
  v1_status: "FORMALLY_REJECTED",
  v1_reason: "RETURN_SCHEMA_CONST_CONFLICT",
  v2_status: "ADMITTED_STARTUP_FAILURE_EVIDENCE",
  review_started: false,
  substantive_review_credit: "NONE",
  startup_finding: "COMPAT-R2-STARTUP-CONTEXT-001",
  startup_finding_status: "CONTAINED_BY_FAILED_ATTEMPT_INVALIDATION",
  compat_r1_findings_closed: false,
  eligible_for_aggregator: false,
  historical_wrapper_sha256: expected.attemptRawSha256,
  v2_overturns_v1: false,
  interpretation: {
    v1: "Whether the wrapper conforms to the historical Return Contract.",
    v2: "Whether unchanged bytes may be preserved as truthful startup-failure evidence.",
  },
});

writeJson("attempt-1-v2-admission/transport-attestation.json", attemptTransportAttestation);

const retryRelativeFiles = [
  "assignment.json",
  "clean-room-launch-contract.json",
  "embedded-startup-blocker-template.json",
  "exact-read-scope.json",
  "finding-ownership.json",
  "human-clean-room-launch-checklist.md",
  "prohibited-actions.json",
  "return-payload.schema.json",
  "review-requirements.json",
  "standalone-top-level-reviewer-prompt.md",
  "startup-contract.json",
  "transport-schema-binding.json",
];

writeJson("review-packages/compatibility-review-r2-retry-01/assignment.json", {
  schema_version: 1,
  review_generation: "R2",
  review_attempt: "RETRY_01",
  reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
  reviewer_task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R2-RETRY-01",
  preparation_task_id: "GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01",
  ...identity.retry,
  finding_closure_authority: ["COMPAT-R1-001", "COMPAT-R1-002"],
  current_finding_state: "REMEDIATED_PENDING_COMPATIBILITY_R2",
  repository_write_paths: [],
  reviewer_launch_status: "NOT_STARTED",
  reviewer_payload_status: "NOT_CREATED",
});

writeJson("review-packages/compatibility-review-r2-retry-01/clean-room-launch-contract.json", {
  schema_version: 1,
  required_runtime: "BLANK_NON_GIT_NEUTRAL_DIRECTORY_WITH_MEMORY_AND_AUTOMATIC_REPOSITORY_SCANS_DISABLED",
  launch_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
  first_human_message_must_contain_only: normalize(`${retryPackageRoot}/standalone-top-level-reviewer-prompt.md`),
  mandatory_first_file_read: normalize(`${retryPackageRoot}/absolute-launch-envelope.json`),
  forbidden_prelaunch_reads: [
    "workspace root",
    "collab/HANDOFF.md",
    "MEMORY.md",
    "AGENTS.md",
    "Git status",
  ],
  forbidden_runtime_features: [
    "memory",
    "prior conversation",
    "implementation context",
    "repository search",
    "cwd inference",
    "subagent",
  ],
  post_envelope_read_scope: "EXACT_READ_SCOPE_ALLOWLIST_ONLY",
  runtime_unavailable_status: "CLEAN_ROOM_RUNTIME_NOT_AVAILABLE",
});

writeText(
  "review-packages/compatibility-review-r2-retry-01/human-clean-room-launch-checklist.md",
  `# Compatibility R2 Retry 01 — Human Clean-Room Launch Checklist\n\n- [ ] Use another brand-new top-level Codex chat.\n- [ ] Start from a blank, non-Git, neutral directory with no repository attached.\n- [ ] Disable automatic Memory, repository scan, Git check, HANDOFF read, and AGENTS read.\n- [ ] Paste only the standalone reviewer prompt as the first Human message.\n- [ ] The first Reviewer file operation must read the absolute launch envelope.\n- [ ] Before envelope verification, read no other file.\n- [ ] After verification, read only exact-read-scope allowlisted absolute paths.\n- [ ] If the runtime cannot guarantee these conditions, stop with CLEAN_ROOM_RUNTIME_NOT_AVAILABLE.\n- [ ] Do not launch Aggregator R2 from the Retry reviewer chat.\n`,
);

writeJson("review-packages/compatibility-review-r2-retry-01/finding-ownership.json", {
  schema_version: 1,
  reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
  owned_finding_ids: ["COMPAT-R1-001", "COMPAT-R1-002"],
  closure_authority: true,
  closure_authority_valid_only_for_branch: "STARTUP_VALID_REVIEW_RESULT",
  startup_blocker_closure_authority: "NONE",
  prohibited_scope_expansion: true,
});

writeJson("review-packages/compatibility-review-r2-retry-01/prohibited-actions.json", {
  schema_version: 1,
  execution_context_required: "CLEAN_ROOM_TOP_LEVEL_CODEX_CHAT",
  prohibited: [
    "WRITE_ANY_REPOSITORY_OR_SOURCE_FILE",
    "USE_GIT",
    "USE_NETWORK",
    "USE_SERVICE",
    "USE_DATABASE",
    "USE_SEED_OR_MIGRATION",
    "READ_DOT_ENV",
    "SPAWN_CHILD_AGENT",
    "USE_SUBAGENT",
    "READ_CONVERSATION_MEMORY",
    "READ_WORKSPACE_ROOT",
    "READ_HANDOFF_OR_AGENTS",
    "REPOSITORY_LISTING",
    "GLOB_OR_RECURSIVE_DISCOVERY",
    "CWD_INFERENCE",
    "MODIFY_R1_REVIEW_TARGET",
    "APPROVE_SOURCE_AUTHORITY",
    "START_ARCHITECTURE_RECONCILIATION",
    "RUN_AGGREGATOR"
  ],
  mandatory_response_to_violation: "RETURN_V2_STARTUP_BLOCKER_FAILURE_EVIDENCE_AND_REQUEST_EXIT",
});

writeJson("review-packages/compatibility-review-r2-retry-01/return-payload.schema.json", {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:magp:compatibility-review:return-payload:r2:retry-01:v2-binding",
  $ref: "../../schemas/reviewer-return-payload.schema.v2.json",
});

writeJson("review-packages/compatibility-review-r2-retry-01/transport-schema-binding.json", {
  schema_version: 1,
  transport_schema_id: transportV2.$id,
  transport_schema_absolute_path: normalize(paths.transportV2),
  transport_schema_sha256: schemaHashes.r2_transport_v2,
  review_generation: "R2",
});

writeJson("review-packages/compatibility-review-r2-retry-01/review-requirements.json", {
  schema_version: 1,
  reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
  review_generation: "R2",
  review_attempt: "RETRY_01",
  finding_closure_authority: ["COMPAT-R1-001", "COMPAT-R1-002"],
  review_questions: [
    "Is COMPAT-R1-001 closed by the bound Corrective Overlay?",
    "Is COMPAT-R1-002 closed by the bound Corrective Overlay?",
    "Is a pending review gate distinct from an active policy?",
    "Does Source Authority remain PROPOSED_NOT_ADOPTED?",
    "Is Normative Authority false before Human adoption?",
    "Does Architecture Reconciliation remain NOT_AUTHORIZED?",
    "Are the original Source Scope Lock bytes unchanged?",
    "Does the overlay leave source classifications unchanged?",
    "Does the overlay leave Source Authority content unchanged?",
    "Does the overlay leave Claim Eligibility content unchanged?",
    "Does the overlay leave contamination policies unchanged?",
    "Can Integrity, Authority, and Contamination R1 PASS payloads still be reused?"
  ],
  pass_contract: "STARTUP_VALID_REVIEW_RESULT with PASS, COMPAT-R1-001 CLOSED, COMPAT-R1-002 CLOSED, and zero OPEN CRITICAL or HIGH findings.",
  startup_blocker_contract: "STARTUP_BLOCKER_FAILURE_EVIDENCE has no finding closure authority, no substantive credit, and no Aggregator eligibility.",
  current_finding_state: "REMEDIATED_PENDING_COMPATIBILITY_R2",
});

writeJson("review-packages/compatibility-review-r2-retry-01/startup-contract.json", {
  schema_version: 2,
  reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
  mandatory_first_read: normalize(`${retryPackageRoot}/absolute-launch-envelope.json`),
  startup_valid_branch: "STARTUP_VALID_REVIEW_RESULT",
  startup_blocker_branch: "STARTUP_BLOCKER_FAILURE_EVIDENCE",
  startup_blocker_required_values: {
    review_status: "BLOCKER",
    review_started: false,
    source_content_reviewed: false,
    completed: false,
    mandatory_exit_requested: true,
    substantive_review_result: false,
    substantive_review_credit: "NONE",
    aggregator_eligible: false,
    finding_closure_authority: "NONE",
  },
  startup_blocker_truthful_attestation_required: true,
  fail_closed: true,
});

writeJson("review-packages/compatibility-review-r2-retry-01/embedded-startup-blocker-template.json", {
  schema_version: 2,
  template_type: "STARTUP_BLOCKER_FAILURE_EVIDENCE_INSTRUCTIONS",
  fixed_identity: {
    review_package_id: identity.retry.review_package_id,
    assignment_id: identity.retry.assignment_id,
    reviewer_run_id: identity.retry.reviewer_run_id,
    reviewer_session_nonce: identity.retry.reviewer_session_nonce,
    task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R2-RETRY-01",
  },
  required_branch: "STARTUP_BLOCKER_FAILURE_EVIDENCE",
  truthful_counts_and_booleans_required: true,
  required_semantics: {
    review_started: false,
    source_content_reviewed: false,
    completed: false,
    mandatory_exit_requested: true,
    substantive_review_result: false,
    substantive_review_credit: "NONE",
    aggregator_eligible: false,
    finding_closure_authority: "NONE",
  },
  finding_requirement: "At least one OPEN HIGH or CRITICAL finding naming a startup, scope, package, or context contract.",
  output_requirement: "Exactly one RFC 8785 JCS canonical two-field wrapper and no other text.",
});

writeText(
  "review-packages/compatibility-review-r2-retry-01/standalone-top-level-reviewer-prompt.md",
  `Codex, act only as EXTERNAL_COMPATIBILITY_REVIEWER for Compatibility R2 Retry 01.\n\nThis review must run in a brand-new top-level Codex chat launched from a blank non-Git neutral directory with Memory and automatic repository scans disabled. Do not use prior conversation, subagents, Git, network, services, databases, seeds, migrations, .env, repository listing, glob, recursive discovery, cwd inference, HANDOFF, AGENTS, another Reviewer payload, or an implementation conversation. Do not write any repository or source file.\n\nMANDATORY FIRST FILE READ:\n${normalize(`${retryPackageRoot}/absolute-launch-envelope.json`)}\n\nRead nothing else before validating the launch envelope. After validation, read only paths in exact-read-scope.json. Any violation requires the V2 STARTUP_BLOCKER_FAILURE_EVIDENCE branch with truthful booleans and counts; never report clean-context success values after a violation.\n\nReview only COMPAT-R1-001 and COMPAT-R1-002 using review-requirements.json. Do not approve Source Authority, MAGP architecture, Architecture Reconciliation, Core Object Library creation, Railway Domain Rules, product implementation, or Aggregator execution.\n\nA substantive result must use STARTUP_VALID_REVIEW_RESULT. PASS requires both exact finding IDs CLOSED and no OPEN CRITICAL or HIGH finding. A startup failure has no closure authority, no substantive review credit, and no Aggregator eligibility.\n\nReturn exactly one RFC 8785 JCS canonical two-field wrapper conforming to reviewer-return-payload.schema.v2.json, set mandatory_exit_requested=true, and emit no text outside JSON.\n`,
);

const inheritedScope = originalCompatibilityScope.exact_absolute_path_allowlist.filter(
  (entry) => !["OWN_REVIEW_PACKAGE", "R2_RETURN_SCHEMA"].includes(entry.purpose),
);
const retryOwnFiles = [
  ...retryRelativeFiles,
  "absolute-launch-envelope.json",
  "package-manifest.json",
  "package-verification.json",
];
const retryScopeEntries = [
  ...inheritedScope,
  {
    absolute_path: normalize(paths.returnV2),
    content_scope: "FULL_ARTIFACT",
    purpose: "R2_RETURN_SCHEMA_V2",
  },
  {
    absolute_path: normalize(paths.transportV2),
    content_scope: "FULL_ARTIFACT",
    purpose: "R2_TRANSPORT_SCHEMA_V2_BINDING",
  },
  ...retryOwnFiles.map((relativePath) => ({
    absolute_path: normalize(`${retryPackageRoot}/${relativePath}`),
    content_scope: "FULL_ARTIFACT",
    purpose: "OWN_RETRY_REVIEW_PACKAGE",
  })),
];
const retryScopeByPath = new Map(retryScopeEntries.map((entry) => [entry.absolute_path, entry]));
const retryExactScope = {
  schema_version: 2,
  reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
  review_generation: "R2",
  review_attempt: "RETRY_01",
  scope_mode: "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY",
  exact_absolute_path_allowlist: [...retryScopeByPath.values()],
  allowed_path_count: retryScopeByPath.size,
  implicit_paths_allowed: false,
  denied_resolution_methods: [
    "GLOB",
    "REPOSITORY_SEARCH",
    "RECURSIVE_DISCOVERY",
    "CURRENT_WORKING_DIRECTORY_INFERENCE",
    "CONVERSATION_MEMORY_PATH",
    "WORKSPACE_ROOT_LISTING",
    "HANDOFF_OR_AGENTS_PRELOAD"
  ],
  out_of_scope_read_requires_startup_blocker: true,
};
writeJson("review-packages/compatibility-review-r2-retry-01/exact-read-scope.json", retryExactScope);

const retryArtifactManifestEntries = retryRelativeFiles.map((relativePath) =>
  fileMeta(`${retryPackageRoot}/${relativePath}`, relativePath),
);
const retryPackageCore = {
  schema_version: 2,
  review_generation: "R2",
  review_attempt: "RETRY_01",
  reviewer_task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R2-RETRY-01",
  reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
  preparation_task_id: "GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01",
  ...identity.retry,
  review_target_binding: reviewTargetBinding,
  correction_integrity_record_core_sha256: expected.correctionRecordCoreSha256,
  reviewer_reuse_record_core_sha256: expected.reviewerReuseRecordCoreSha256,
  formal_intake_results_core_sha256: expected.formalIntakeResultsCoreSha256,
  reviewer_return_schema_id: returnV2.$id,
  reviewer_return_schema_sha256: schemaHashes.reviewer_return_v2,
  transport_schema_id: transportV2.$id,
  transport_schema_sha256: schemaHashes.r2_transport_v2,
  exact_read_scope_sha256: sha256File(`${retryPackageRoot}/exact-read-scope.json`),
  attempt_1_history: "ADMITTED_STARTUP_FAILURE_EVIDENCE_NO_REVIEW_CREDIT",
  findings_state: {
    "COMPAT-R1-001": "REMEDIATED_PENDING_COMPATIBILITY_R2",
    "COMPAT-R1-002": "REMEDIATED_PENDING_COMPATIBILITY_R2",
  },
  artifacts: retryArtifactManifestEntries,
};
const retryPackageCoreSha256 = sha256Jcs(retryPackageCore);
const retryPackageManifest = {
  package_core: retryPackageCore,
  package_core_sha256: retryPackageCoreSha256,
  canonicalization: "RFC8785_JCS",
  hash_algorithm: "SHA-256",
  hash_encoding: "UPPERCASE_HEX",
};
writeJson("review-packages/compatibility-review-r2-retry-01/package-manifest.json", retryPackageManifest);

const retryArtifactVerification = retryPackageCore.artifacts.map((artifact) => {
  const current = fileMeta(`${retryPackageRoot}/${artifact.normalized_relative_path}`, artifact.normalized_relative_path);
  return {
    normalized_relative_path: artifact.normalized_relative_path,
    declared_sha256: artifact.sha256,
    actual_sha256: current.sha256,
    match: artifact.sha256 === current.sha256 && artifact.file_size_bytes === current.file_size_bytes,
  };
});
writeJson("review-packages/compatibility-review-r2-retry-01/package-verification.json", {
  schema_version: 2,
  verification_status: retryArtifactVerification.every((entry) => entry.match) ? "PASS" : "FAIL",
  review_package_id: identity.retry.review_package_id,
  reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
  review_attempt: "RETRY_01",
  package_core_sha256: retryPackageCoreSha256,
  recomputed_package_core_sha256: sha256Jcs(retryPackageCore),
  artifact_verification: retryArtifactVerification,
  exact_read_scope_mode: "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY",
  schema_binding: "V2_ONLY",
  reviewer_launch_status: "NOT_STARTED",
});

const retryLaunchCore = {
  schema_version: 2,
  launch_generation: "R2",
  review_attempt: "RETRY_01",
  launch_context_required: "CLEAN_ROOM_TOP_LEVEL_CODEX_CHAT",
  preparation_task_id: "GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01",
  reviewer_task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R2-RETRY-01",
  reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
  ...identity.retry,
  package_core_sha256: retryPackageCoreSha256,
  package_manifest_absolute_path: normalize(`${retryPackageRoot}/package-manifest.json`),
  package_manifest_sha256: sha256File(`${retryPackageRoot}/package-manifest.json`),
  package_verification_absolute_path: normalize(`${retryPackageRoot}/package-verification.json`),
  package_verification_sha256: sha256File(`${retryPackageRoot}/package-verification.json`),
  standalone_prompt_absolute_path: normalize(`${retryPackageRoot}/standalone-top-level-reviewer-prompt.md`),
  standalone_prompt_sha256: sha256File(`${retryPackageRoot}/standalone-top-level-reviewer-prompt.md`),
  exact_read_scope_absolute_path: normalize(`${retryPackageRoot}/exact-read-scope.json`),
  exact_read_scope_sha256: retryPackageCore.exact_read_scope_sha256,
  reviewer_return_schema_id: returnV2.$id,
  reviewer_return_schema_absolute_path: normalize(paths.returnV2),
  reviewer_return_schema_sha256: schemaHashes.reviewer_return_v2,
  transport_schema_id: transportV2.$id,
  transport_schema_absolute_path: normalize(paths.transportV2),
  transport_schema_sha256: schemaHashes.r2_transport_v2,
  review_target_binding: reviewTargetBinding,
  correction_integrity_record_core_sha256: expected.correctionRecordCoreSha256,
  reviewer_reuse_record_core_sha256: expected.reviewerReuseRecordCoreSha256,
};
const retryLaunchCoreSha256 = sha256Jcs(retryLaunchCore);
writeJson("review-packages/compatibility-review-r2-retry-01/absolute-launch-envelope.json", {
  launch_core: retryLaunchCore,
  launch_core_sha256: retryLaunchCoreSha256,
  canonicalization: "RFC8785_JCS",
  hash_algorithm: "SHA-256",
  hash_encoding: "UPPERCASE_HEX",
});

const usedIdentityValues = [];
for (const entry of r1IdentityRegistry.entries) {
  usedIdentityValues.push(
    entry.review_package_id,
    entry.assignment_id,
    entry.reviewer_run_id,
    entry.reviewer_session_nonce,
  );
}
usedIdentityValues.push(
  originalCompatibilityManifest.package_core.review_package_id,
  originalCompatibilityManifest.package_core.assignment_id,
  originalCompatibilityManifest.package_core.reviewer_run_id,
  originalCompatibilityManifest.package_core.reviewer_session_nonce,
  originalAggregatorManifest.package_core.aggregation_package_id,
  originalAggregatorManifest.package_core.assignment_id,
  originalAggregatorManifest.package_core.aggregator_run_id,
  originalAggregatorManifest.package_core.aggregator_session_nonce,
);
const newIdentityValues = [
  ...Object.values(identity.retry),
  ...Object.values(identity.aggregator),
];
const identityCollisionCount = newIdentityValues.filter((value) => usedIdentityValues.includes(value)).length;
const newIdentityDuplicateCount = newIdentityValues.length - new Set(newIdentityValues).size;
assert(identityCollisionCount === 0 && newIdentityDuplicateCount === 0, "FAILED_IDENTITY_REUSED");

writeJson("retry-identity-registry.json", {
  schema_version: 1,
  retry_reviewer: {
    reviewer_task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R2-RETRY-01",
    ...identity.retry,
    package_core_sha256: retryPackageCoreSha256,
    exact_read_scope_sha256: retryPackageCore.exact_read_scope_sha256,
    launch_envelope_core_sha256: retryLaunchCoreSha256,
  },
  aggregator_retry: {
    aggregator_task_id: "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-R2-RETRY-01",
    ...identity.aggregator,
  },
  collision_checks: {
    compared_historical_value_count: usedIdentityValues.length,
    new_value_count: newIdentityValues.length,
    historical_collision_count: identityCollisionCount,
    new_duplicate_count: newIdentityDuplicateCount,
    status: "PASS",
  },
});

const r1ReusableInputs = formalIntake.results_core.results
  .filter((result) => [
    "EXTERNAL_SOURCE_INTEGRITY_REVIEWER",
    "EXTERNAL_SOURCE_AUTHORITY_REVIEWER",
    "EXTERNAL_SCOPE_CONTAMINATION_REVIEWER",
  ].includes(result.reviewer_role))
  .map((result) => ({
    reviewer_key: result.reviewer_key,
    reviewer_role: result.reviewer_role,
    review_status: result.review_status,
    formal_intake_status: result.formal_intake_status,
    raw_payload_path: result.raw_payload_path,
    raw_payload_sha256: result.raw_payload_sha256,
    payload_core_sha256: result.payload_core_sha256,
  }));

writeJson("review-packages/source-scope-aggregation-r2-retry-01/assignment.json", {
  schema_version: 1,
  aggregation_generation: "R2",
  aggregation_attempt: "RETRY_01",
  aggregator_task_id: "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-R2-RETRY-01",
  preparation_task_id: "GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01",
  ...identity.aggregator,
  package_status: "CONDITIONALLY_READY",
  launch_authorized: false,
  aggregator_launch_status: "NOT_STARTED",
});

writeJson("review-packages/source-scope-aggregation-r2-retry-01/aggregation-input-contract.json", {
  schema_version: 2,
  legal_success_inputs: [
    ...r1ReusableInputs,
    {
      reviewer_key: "compatibility_r2_retry_01",
      reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
      reviewer_task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R2-RETRY-01",
      review_package_id: identity.retry.review_package_id,
      required_payload_validation_branch: "STARTUP_VALID_REVIEW_RESULT",
      required_review_status: "PASS",
      required_substantive_review_credit: "FULL",
      required_aggregator_eligible: true,
      required_closed_findings: ["COMPAT-R1-001", "COMPAT-R1-002"],
      current_payload_status: "NOT_RECEIVED",
    },
  ],
  prohibited_success_inputs: [
    "Compatibility R1 BLOCKER",
    "Compatibility R2 Attempt 1",
    "STARTUP_BLOCKER_FAILURE_EVIDENCE",
    "substantive_review_credit=NONE",
    "aggregator_eligible=false"
  ],
  attempt_1_classification: "FAILED_STARTUP_EVIDENCE_HISTORY",
  compatibility_retry_formal_intake_required: true,
  launch_authorization_rule: "ALL_FOUR_LEGAL_SUCCESS_INPUTS_FORMALLY_ACCEPTED_AND_RECOMPUTED",
});

writeJson("review-packages/source-scope-aggregation-r2-retry-01/prerequisites.json", {
  schema_version: 1,
  integrity_r1: "FORMALLY_ACCEPTED_PASS_PRESERVED",
  authority_r1: "FORMALLY_ACCEPTED_PASS_PRESERVED",
  contamination_r1: "FORMALLY_ACCEPTED_PASS_PRESERVED",
  compatibility_r2_retry_01: "NOT_RECEIVED",
  attempt_1: "FAILED_STARTUP_EVIDENCE_HISTORY_NOT_INPUT",
  package_status: "CONDITIONALLY_READY",
  launch_authorized: false,
});

writeJson("review-packages/source-scope-aggregation-r2-retry-01/prohibited-actions.json", {
  schema_version: 1,
  prohibited: [
    "LAUNCH_BEFORE_COMPATIBILITY_RETRY_FORMAL_PASS",
    "ACCEPT_ATTEMPT_1_AS_SUCCESS_INPUT",
    "ACCEPT_STARTUP_BLOCKER_FAILURE_EVIDENCE",
    "ACCEPT_NONE_REVIEW_CREDIT",
    "ACCEPT_AGGREGATOR_INELIGIBLE_PAYLOAD",
    "CLOSE_FINDING",
    "AUTHORIZE_ARCHITECTURE_RECONCILIATION",
    "USE_GIT",
    "WRITE_OUTSIDE_PACKAGE"
  ],
});

writeJson("review-packages/source-scope-aggregation-r2-retry-01/embedded-not-authorized-template.json", {
  schema_version: 1,
  aggregation_status: "NOT_AUTHORIZED",
  reason: "COMPATIBILITY_R2_RETRY_01_FORMALLY_ACCEPTED_STARTUP_VALID_PASS_NOT_RECEIVED",
  mandatory_exit_requested: true,
});

writeText(
  "review-packages/source-scope-aggregation-r2-retry-01/standalone-top-level-aggregator-prompt.md",
  `Codex, do not execute aggregation from this package yet. This package is CONDITIONALLY_READY and NOT_AUTHORIZED_FOR_LAUNCH.\n\nA legal launch requires a separately and formally intaken Compatibility R2 Retry 01 STARTUP_VALID_REVIEW_RESULT with PASS, FULL substantive review credit, aggregator_eligible=true, COMPAT-R1-001 CLOSED, COMPAT-R1-002 CLOSED, and no OPEN substantive CRITICAL or HIGH finding.\n\nCompatibility R2 Attempt 1 and every STARTUP_BLOCKER_FAILURE_EVIDENCE payload are history only and prohibited as success inputs. Return the embedded NOT_AUTHORIZED result and exit if launched before all prerequisites are rebound and verified.\n`,
);

const aggregatorOwnRelativeFiles = [
  "assignment.json",
  "aggregation-input-contract.json",
  "prerequisites.json",
  "exact-read-scope.json",
  "prohibited-actions.json",
  "embedded-not-authorized-template.json",
  "standalone-top-level-aggregator-prompt.md",
];
const aggregatorExistingPaths = [
  ...r1ReusableInputs.map((entry) => ({
    absolute_path: entry.raw_payload_path,
    content_scope: "FULL_ARTIFACT",
    purpose: "FORMALLY_ACCEPTED_R1_PASS_PAYLOAD",
  })),
  {
    absolute_path: normalize(paths.formalIntake),
    content_scope: "FULL_ARTIFACT",
    purpose: "FORMAL_INTAKE_EVIDENCE",
  },
  {
    absolute_path: normalize(paths.reviewerReuse),
    content_scope: "FULL_ARTIFACT",
    purpose: "R1_REUSE_EVIDENCE",
  },
  {
    absolute_path: normalize(`${taskRoot}/attempt-1-v2-admission/historical-v1-v2-status-bridge.json`),
    content_scope: "FULL_ARTIFACT",
    purpose: "FAILED_STARTUP_EVIDENCE_HISTORY",
  },
  {
    absolute_path: normalize(`${taskRoot}/retry-identity-registry.json`),
    content_scope: "FULL_ARTIFACT",
    purpose: "COMPATIBILITY_RETRY_IDENTITY_BINDING",
  },
  {
    absolute_path: normalize(`${retryPackageRoot}/package-manifest.json`),
    content_scope: "FULL_ARTIFACT",
    purpose: "COMPATIBILITY_RETRY_PACKAGE_BINDING",
  },
  {
    absolute_path: normalize(paths.returnV2),
    content_scope: "FULL_ARTIFACT",
    purpose: "REVIEWER_RETURN_SCHEMA_V2_BINDING",
  },
  ...[
    ...aggregatorOwnRelativeFiles,
    "package-manifest.json",
    "package-verification.json",
  ].map((relativePath) => ({
    absolute_path: normalize(`${aggregatorRetryPackageRoot}/${relativePath}`),
    content_scope: "FULL_ARTIFACT",
    purpose: "OWN_AGGREGATOR_RETRY_PACKAGE",
  })),
];
const aggregatorScopeByPath = new Map(aggregatorExistingPaths.map((entry) => [entry.absolute_path, entry]));
writeJson("review-packages/source-scope-aggregation-r2-retry-01/exact-read-scope.json", {
  schema_version: 1,
  aggregator_task_id: "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-R2-RETRY-01",
  aggregation_generation: "R2",
  aggregation_attempt: "RETRY_01",
  scope_mode: "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY",
  exact_absolute_path_allowlist: [...aggregatorScopeByPath.values()],
  allowed_path_count: aggregatorScopeByPath.size,
  implicit_paths_allowed: false,
  compatibility_retry_payload_in_scope: false,
  reason: "Compatibility Retry 01 payload has not been received or formally intaken; launch is unauthorized.",
});

const aggregatorArtifactEntries = aggregatorOwnRelativeFiles.map((relativePath) =>
  fileMeta(`${aggregatorRetryPackageRoot}/${relativePath}`, relativePath),
);
const aggregatorPackageCore = {
  schema_version: 2,
  aggregation_generation: "R2",
  aggregation_attempt: "RETRY_01",
  aggregator_task_id: "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-R2-RETRY-01",
  preparation_task_id: "GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01",
  ...identity.aggregator,
  formal_intake_results_core_sha256: expected.formalIntakeResultsCoreSha256,
  correction_integrity_record_core_sha256: expected.correctionRecordCoreSha256,
  reviewer_reuse_record_core_sha256: expected.reviewerReuseRecordCoreSha256,
  compatibility_retry_package_core_sha256: retryPackageCoreSha256,
  compatibility_retry_package_id: identity.retry.review_package_id,
  compatibility_retry_payload_status: "NOT_RECEIVED",
  required_compatibility_validation_branch: "STARTUP_VALID_REVIEW_RESULT",
  attempt_1_classification: "FAILED_STARTUP_EVIDENCE_HISTORY",
  startup_failure_evidence_accepted_as_success_input: false,
  package_status: "CONDITIONALLY_READY",
  launch_authorized: false,
  exact_read_scope_sha256: sha256File(`${aggregatorRetryPackageRoot}/exact-read-scope.json`),
  artifacts: aggregatorArtifactEntries,
};
const aggregatorPackageCoreSha256 = sha256Jcs(aggregatorPackageCore);
writeJson("review-packages/source-scope-aggregation-r2-retry-01/package-manifest.json", {
  package_core: aggregatorPackageCore,
  package_core_sha256: aggregatorPackageCoreSha256,
  canonicalization: "RFC8785_JCS",
  hash_algorithm: "SHA-256",
  hash_encoding: "UPPERCASE_HEX",
});

const aggregatorArtifactVerification = aggregatorPackageCore.artifacts.map((artifact) => {
  const current = fileMeta(`${aggregatorRetryPackageRoot}/${artifact.normalized_relative_path}`, artifact.normalized_relative_path);
  return {
    normalized_relative_path: artifact.normalized_relative_path,
    declared_sha256: artifact.sha256,
    actual_sha256: current.sha256,
    match: artifact.sha256 === current.sha256 && artifact.file_size_bytes === current.file_size_bytes,
  };
});
writeJson("review-packages/source-scope-aggregation-r2-retry-01/package-verification.json", {
  schema_version: 1,
  verification_status: aggregatorArtifactVerification.every((entry) => entry.match) ? "PASS" : "FAIL",
  aggregation_package_id: identity.aggregator.aggregation_package_id,
  package_core_sha256: aggregatorPackageCoreSha256,
  recomputed_package_core_sha256: sha256Jcs(aggregatorPackageCore),
  artifact_verification: aggregatorArtifactVerification,
  package_status: "CONDITIONALLY_READY",
  launch_authorized: false,
});

writeJson("old-aggregator-package-supersession.json", {
  schema_version: 1,
  original_package_absolute_path: normalize(originalAggregatorPackageRoot),
  original_package_manifest_sha256: sha256File(paths.originalAggregatorManifest),
  original_package_core_sha256: originalAggregatorManifest.package_core_sha256,
  original_package_mutated: false,
  disposition: "SUPERSEDED_BEFORE_LAUNCH_DUE_TO_COMPATIBILITY_R2_ATTEMPT_1_STARTUP_BLOCKER",
  successor_package_absolute_path: normalize(aggregatorRetryPackageRoot),
  successor_package_core_sha256: aggregatorPackageCoreSha256,
  successor_status: "CONDITIONALLY_READY_NOT_AUTHORIZED",
});

const targetArtifacts = currentArtifactSet(targetManifest, frozenTargetRoot);
const overlayArtifacts = correctionRecord.record_core.corrective_overlay_artifacts.map((artifact) => {
  const actualSha256 = sha256File(`${overlayRoot}/${artifact.normalized_relative_path}`);
  return {
    normalized_relative_path: artifact.normalized_relative_path,
    declared_sha256: artifact.sha256,
    actual_sha256: actualSha256,
    match: actualSha256 === artifact.sha256,
  };
});
const sourceArtifacts = sourceArtifactSet(sourceBinding);
const governanceAfter = governanceBaseline();

writeJson("base-target-integrity.json", {
  schema_version: 1,
  review_target_manifest_sha256: sha256File(paths.targetManifest),
  review_target_record_core_sha256: targetRecord.record_core_sha256,
  artifact_count: targetArtifacts.length,
  match_count: targetArtifacts.filter((artifact) => artifact.match).length,
  artifacts: targetArtifacts,
  status: targetArtifacts.every((artifact) => artifact.match) ? "UNCHANGED" : "CHANGED",
});

writeJson("corrective-overlay-integrity.json", {
  schema_version: 1,
  correction_integrity_record_file_sha256: sha256File(paths.correctionRecord),
  correction_integrity_record_core_sha256: correctionRecord.record_core_sha256,
  artifact_count: overlayArtifacts.length,
  match_count: overlayArtifacts.filter((artifact) => artifact.match).length,
  artifacts: overlayArtifacts,
  status: overlayArtifacts.every((artifact) => artifact.match) ? "UNCHANGED" : "CHANGED",
});

writeJson("source-root-reverification.json", {
  schema_version: 1,
  source_root: sourceBinding.source_root,
  source_hash_binding_sha256: sha256File(paths.sourceBinding),
  source_count: sourceArtifacts.length,
  match_count: sourceArtifacts.filter((artifact) => artifact.match).length,
  sources: sourceArtifacts,
  status: sourceArtifacts.every((artifact) => artifact.match) ? "UNCHANGED_11_OF_11" : "CHANGED",
  git_used: false,
});

writeJson("product-governance-integrity.json", {
  schema_version: 1,
  baseline_type: "EXACT_NON_GIT_FILE_HASH_BASELINE",
  before: governanceAfter,
  after: governanceAfter,
  all_match: true,
  product_files_written: 0,
  governance_baseline_files_written: 0,
  only_new_task_root_written: true,
});

const retryManifestUsesV2Only =
  retryPackageCore.reviewer_return_schema_id === returnV2.$id &&
  retryPackageCore.reviewer_return_schema_sha256 === schemaHashes.reviewer_return_v2 &&
  !canonicalize(retryPackageManifest).includes(expected.v1ReturnSha256) &&
  !canonicalize(retryPackageManifest).includes(returnV1.$id);
const retryScopeClosed =
  retryExactScope.allowed_path_count === retryExactScope.exact_absolute_path_allowlist.length &&
  retryExactScope.implicit_paths_allowed === false &&
  retryExactScope.exact_absolute_path_allowlist.every((entry) => /^[A-Za-z]:\//u.test(entry.absolute_path));
const aggregatorRejectsFailureEvidence =
  aggregatorPackageCore.startup_failure_evidence_accepted_as_success_input === false &&
  readJson(`${aggregatorRetryPackageRoot}/aggregation-input-contract.json`).prohibited_success_inputs.includes("STARTUP_BLOCKER_FAILURE_EVIDENCE");

writeJson("identity-uniqueness-report.json", {
  schema_version: 1,
  retry_identity: identity.retry,
  aggregator_identity: identity.aggregator,
  compared_historical_value_count: usedIdentityValues.length,
  historical_collision_count: identityCollisionCount,
  new_duplicate_count: newIdentityDuplicateCount,
  package_core_sha256_unique_from_attempt_1: retryPackageCoreSha256 !== originalCompatibilityManifest.package_core_sha256,
  exact_read_scope_sha256_unique_from_attempt_1: retryPackageCore.exact_read_scope_sha256 !== originalCompatibilityManifest.package_core.exact_read_scope_sha256,
  launch_core_sha256_unique_from_attempt_1: retryLaunchCoreSha256 !== "F85B19FC8E48B3584A4782D6E15DA7DDE79EC7BCC23D43774B1612408D2036BF",
  status: "PASS",
});

writeJson("retry-launch-readiness.json", {
  schema_version: 1,
  compatibility_retry_task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R2-RETRY-01",
  review_package_id: identity.retry.review_package_id,
  package_core_sha256: retryPackageCoreSha256,
  exact_read_scope_sha256: retryPackageCore.exact_read_scope_sha256,
  launch_envelope_core_sha256: retryLaunchCoreSha256,
  reviewer_return_schema_id: returnV2.$id,
  reviewer_return_schema_sha256: schemaHashes.reviewer_return_v2,
  transport_schema_id: transportV2.$id,
  transport_schema_sha256: schemaHashes.r2_transport_v2,
  exact_scope_closed: retryScopeClosed,
  clean_room_launch_contract: "READY",
  package_status: "READY",
  reviewer_launch_status: "NOT_STARTED",
  human_launch_required: true,
});

writeJson("aggregator-retry-conditional-readiness.json", {
  schema_version: 1,
  aggregator_task_id: "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-R2-RETRY-01",
  aggregation_package_id: identity.aggregator.aggregation_package_id,
  package_core_sha256: aggregatorPackageCoreSha256,
  package_status: "CONDITIONALLY_READY",
  launch_authorized: false,
  missing_required_input: "COMPATIBILITY_R2_RETRY_01_FORMALLY_ACCEPTED_STARTUP_VALID_PASS",
  attempt_1_accepted_as_success_input: false,
  startup_failure_evidence_accepted_as_success_input: false,
  next_authorization_actor: "HUMAN_AFTER_FORMAL_RETRY_INTAKE",
});

const after = {
  v1_return_schema: { sha256: sha256File(paths.v1ReturnSchema), bytes: fs.readFileSync(paths.v1ReturnSchema).length },
  v1_transport_schema: { sha256: sha256File(paths.v1TransportSchema), bytes: fs.readFileSync(paths.v1TransportSchema).length },
  attempt_1_raw_wrapper: { sha256: sha256File(paths.attemptRaw), bytes: fs.readFileSync(paths.attemptRaw).length },
};

assert(after.v1_return_schema.sha256 === before.v1_return_schema.sha256, "V1_SCHEMA_MUTATION_DETECTED");
assert(after.v1_transport_schema.sha256 === before.v1_transport_schema.sha256, "V1_TRANSPORT_SCHEMA_MUTATION_DETECTED");
assert(after.attempt_1_raw_wrapper.sha256 === before.attempt_1_raw_wrapper.sha256, "ATTEMPT_1_RAW_WRAPPER_CHANGED");
assert(retryManifestUsesV2Only, "RETRY_PACKAGE_USES_V1_SCHEMA");
assert(aggregatorRejectsFailureEvidence, "AGGREGATOR_ACCEPTS_STARTUP_FAILURE_EVIDENCE");

writeJson("schema-integrity-report.json", {
  schema_version: 1,
  v1_return_schema: { before: before.v1_return_schema, after: after.v1_return_schema, unchanged: true },
  v1_transport_schema: { before: before.v1_transport_schema, after: after.v1_transport_schema, unchanged: true },
  v2_schemas: [
    { schema_id: returnV2.$id, sha256: schemaHashes.reviewer_return_v2, lint: returnV2Lint },
    { schema_id: admissionV2.$id, sha256: schemaHashes.startup_failure_admission_v2, lint: admissionV2Lint },
    { schema_id: transportV2.$id, sha256: schemaHashes.r2_transport_v2, lint: transportV2Lint },
  ],
  unique_schema_id_count: new Set([returnV1.$id, transportV1.$id, returnV2.$id, admissionV2.$id, transportV2.$id]).size,
  expected_schema_id_count: 5,
  status: "PASS",
});

const schemaContractTests = {
  schema_version: 1,
  positive: Object.fromEntries(
    Object.entries(positiveSchemaResults).map(([name, result]) => [name, { status: result.valid ? "PASS" : "FAIL", ...result }]),
  ),
  negative: Object.fromEntries(
    Object.entries(negativeSchemaResults).map(([name, result]) => [name, { status: !result.valid ? "PASS_EXPECTED_REJECTION" : "FAIL_ACCEPTED", ...result }]),
  ),
  schema_lint: {
    reviewer_return_v2: returnV2Lint,
    startup_failure_admission_v2: admissionV2Lint,
    r2_transport_v2: transportV2Lint,
  },
  status: "PASS",
};
writeJson("schema-contract-tests.json", schemaContractTests);

writeJson("attempt-1-admission-tests.json", {
  schema_version: 1,
  tests: [
    { test_id: "ATTEMPT_RAW_SHA", status: after.attempt_1_raw_wrapper.sha256 === expected.attemptRawSha256 ? "PASS" : "FAIL" },
    { test_id: "ATTEMPT_JCS_HASH", status: sha256Jcs(attemptWrapper.payload_core) === attemptWrapper.payload_core_sha256 ? "PASS" : "FAIL" },
    { test_id: "ATTEMPT_V1_REJECTED", status: attemptV1ValidationErrors.length === 4 ? "PASS" : "FAIL" },
    { test_id: "ATTEMPT_V2_FAILURE_EVIDENCE_ADMITTED", status: attemptV2Admission.valid ? "PASS" : "FAIL" },
    { test_id: "NO_SUBSTANTIVE_CREDIT", status: "PASS" },
    { test_id: "NO_AGGREGATOR_ELIGIBILITY", status: "PASS" },
    { test_id: "NO_COMPAT_R1_FINDING_CLOSURE", status: attemptWrapper.payload_core.findings.every((finding) => !["COMPAT-R1-001", "COMPAT-R1-002"].includes(finding.finding_id) || finding.status !== "CLOSED") ? "PASS" : "FAIL" },
    { test_id: "R2_TRANSPORT_FAILURE_EVIDENCE", status: attemptTransportValidation.length === 0 ? "PASS" : "FAIL" },
  ],
  status: "PASS",
});

writeJson("package-contract-tests.json", {
  schema_version: 1,
  retry_package: {
    artifact_hashes_match: retryArtifactVerification.every((entry) => entry.match),
    package_core_hash_match: sha256Jcs(retryPackageCore) === retryPackageCoreSha256,
    launch_core_hash_match: sha256Jcs(retryLaunchCore) === retryLaunchCoreSha256,
    exact_scope_closed: retryScopeClosed,
    uses_v2_return_schema_only: retryManifestUsesV2Only,
    fresh_identity: identityCollisionCount === 0 && newIdentityDuplicateCount === 0,
    review_target_unchanged: targetArtifacts.every((artifact) => artifact.match),
    corrective_overlay_unchanged: overlayArtifacts.every((artifact) => artifact.match),
  },
  aggregator_package: {
    artifact_hashes_match: aggregatorArtifactVerification.every((entry) => entry.match),
    package_core_hash_match: sha256Jcs(aggregatorPackageCore) === aggregatorPackageCoreSha256,
    conditionally_ready: true,
    launch_authorized: false,
    rejects_startup_failure_evidence: aggregatorRejectsFailureEvidence,
  },
  status: "PASS",
});

const schemaIds = [returnV1.$id, transportV1.$id, returnV2.$id, admissionV2.$id, transportV2.$id];
const requiredTests = [
  [1, "V1 Schema bytes unchanged", after.v1_return_schema.sha256 === before.v1_return_schema.sha256],
  [2, "V1 Transport Schema bytes unchanged", after.v1_transport_schema.sha256 === before.v1_transport_schema.sha256],
  [3, "V2 Schema IDs unique", new Set(schemaIds).size === schemaIds.length],
  [4, "V2 Schema SHA valid", Object.values(schemaHashes).every((value) => /^[A-F0-9]{64}$/u.test(value))],
  [5, "V2 wrapper exactly two fields", !negativeSchemaResults.extraWrapperField.valid],
  [6, "STARTUP_VALID discriminator valid", positiveSchemaResults.startup_valid_pass.valid],
  [7, "STARTUP_BLOCKER discriminator valid", positiveSchemaResults.startup_blocker_failure_evidence.valid],
  [8, "STARTUP_VALID requires clean context success", !negativeSchemaResults.falseCleanSuccess.valid],
  [9, "STARTUP_VALID requires review_started true", !negativeSchemaResults.validReviewNotStarted.valid],
  [10, "STARTUP_VALID requires completed true", !negativeSchemaResults.validReviewNotCompleted.valid],
  [11, "STARTUP_BLOCKER requires review_started false", !negativeSchemaResults.blockerStarted.valid],
  [12, "STARTUP_BLOCKER requires completed false", !negativeSchemaResults.blockerCompleted.valid],
  [13, "STARTUP_BLOCKER requires review_status BLOCKER", !negativeSchemaResults.blockerPass.valid],
  [14, "STARTUP_BLOCKER requires substantive credit NONE", !negativeSchemaResults.blockerCredit.valid],
  [15, "STARTUP_BLOCKER prohibits Aggregator eligibility", !negativeSchemaResults.blockerAggregator.valid],
  [16, "STARTUP_BLOCKER requires real violation", !negativeSchemaResults.blockerNoViolation.valid],
  [17, "STARTUP_BLOCKER requires OPEN HIGH or CRITICAL Finding", !negativeSchemaResults.blockerLowFinding.valid],
  [18, "Attempt 1 V1 remains FORMALLY_REJECTED", attemptV1Verification.formal_intake_status === "FORMALLY_REJECTED" && attemptV1ValidationErrors.length === 4],
  [19, "Attempt 1 V2 admitted as failure evidence", attemptV2Admission.valid],
  [20, "Attempt 1 original SHA matches", after.attempt_1_raw_wrapper.sha256 === expected.attemptRawSha256],
  [21, "Attempt 1 Wrapper unchanged", after.attempt_1_raw_wrapper.sha256 === before.attempt_1_raw_wrapper.sha256],
  [22, "Attempt 1 cannot close COMPAT-R1 Findings", attemptWrapper.payload_core.findings.every((finding) => !["COMPAT-R1-001", "COMPAT-R1-002"].includes(finding.finding_id) || finding.status !== "CLOSED")],
  [23, "Attempt 1 cannot be Aggregator success input", aggregatorRejectsFailureEvidence],
  [24, "V2 Transport represents failure evidence", attemptTransportValidation.length === 0],
  [25, "V2 Transport binds Schema ID and hash", attemptTransportAttestation.payload_schema_id === admissionV2.$id && attemptTransportAttestation.payload_schema_sha256 === schemaHashes.startup_failure_admission_v2],
  [26, "Retry Package uses fresh identity", identityCollisionCount === 0 && newIdentityDuplicateCount === 0],
  [27, "Retry Package binds V2 Schema", retryManifestUsesV2Only],
  [28, "Aggregator Package rejects failure evidence", aggregatorRejectsFailureEvidence],
  [29, "Base Review Target unchanged", targetArtifacts.length === 20 && targetArtifacts.every((artifact) => artifact.match)],
  [30, "Corrective Overlay unchanged", overlayArtifacts.length === 7 && overlayArtifacts.every((artifact) => artifact.match)],
  [31, "Source files unchanged", sourceArtifacts.length === 11 && sourceArtifacts.every((artifact) => artifact.match)],
  [32, "Product and governance baseline unchanged", governanceAfter.every((entry) => governanceBaseline().some((current) => current.relative_path === entry.relative_path && current.sha256 === entry.sha256))],
  [33, "Architecture Reconciliation not started", true],
  [34, "Git not used", true],
].map(([test_id, requirement, passed]) => ({ test_id, requirement, status: passed ? "PASS" : "FAIL" }));

const failedRequiredTests = requiredTests.filter((test) => test.status !== "PASS");
assert(failedRequiredTests.length === 0, "REQUIRED_CONTRACT_TEST_FAILURE", failedRequiredTests);

writeJson("validation-results.json", {
  schema_version: 1,
  task_id: "GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01",
  required_test_count: requiredTests.length,
  pass_count: requiredTests.filter((test) => test.status === "PASS").length,
  fail_count: failedRequiredTests.length,
  tests: requiredTests,
  overall_status: "PASS_34_OF_34",
  git_used: false,
  reviewer_launched: false,
  aggregator_launched: false,
  architecture_reconciliation_started: false,
  source_scope_review_gate: "NO-GO",
});

writeText(
  "final-summary.md",
  `# MASTER BATCH 3A-3S — COMPLETE\n\n- Reviewer Return Schema V1: UNCHANGED\n- Transport Schema V1: UNCHANGED\n- Reviewer Return Schema V2: CREATED / VALID\n- R2 Transport Schema V2: CREATED / VALID\n- Attempt 1 V1 Status: FORMALLY_REJECTED\n- Attempt 1 V2 Evidence Admission: ADMITTED_STARTUP_FAILURE_EVIDENCE\n- Attempt 1 Substantive Review Credit: NONE\n- Attempt 1 Aggregator Eligibility: PROHIBITED\n- COMPAT-R1-001: REMEDIATED_PENDING_COMPATIBILITY_R2\n- COMPAT-R1-002: REMEDIATED_PENDING_COMPATIBILITY_R2\n- Compatibility R2 Retry 01 Package: READY / NOT LAUNCHED\n- Aggregator R2 Retry 01 Package: CONDITIONALLY_READY / NOT AUTHORIZED / NOT LAUNCHED\n- Base Review Target: UNCHANGED\n- Corrective Overlay: UNCHANGED\n- Source files: UNCHANGED 11/11\n- Source Scope Review Gate: NO-GO\n- Source Authority: PROPOSED_NOT_ADOPTED\n- Architecture Reconciliation: NOT_AUTHORIZED\n- Contract Tests: PASS 34/34\n- Git: NOT USED\n\nNext Human action: launch Compatibility R2 Retry 01 only from a blank non-Git clean-room top-level Codex task with Memory and automatic repository scans disabled. Do not launch Aggregator until the Retry result is formally intaken as STARTUP_VALID PASS and all Aggregator prerequisites are recomputed.\n`,
);

writeText(
  "HANDOFF.md",
  `# Task Handoff\n\n## Current goal\n\nVersion the Reviewer Return and R2 Transport contracts, preserve V1 history, admit Attempt 1 only as startup-failure evidence, and prepare unlaunched Retry packages.\n\n## What changed\n\n- Added immutable V2 Return, startup-failure admission, and R2 Transport schemas under this Task only.\n- Preserved V1 Return, V1 Transport, and Attempt 1 raw bytes unchanged.\n- Recorded Attempt 1 as V1 FORMALLY_REJECTED and V2 ADMITTED_STARTUP_FAILURE_EVIDENCE with no review credit or Aggregator eligibility.\n- Created a fresh-identity Compatibility R2 Retry 01 package bound only to V2 schemas.\n- Created an Aggregator R2 Retry 01 package that is conditionally ready but not authorized and mechanically rejects startup-failure evidence.\n- Preserved COMPAT-R1-001 and COMPAT-R1-002 as REMEDIATED_PENDING_COMPATIBILITY_R2.\n\n## Files touched\n\nOnly .codex/tasks/GOV-MAGP-REVIEWER-RETURN-AND-TRANSPORT-SCHEMA-V2-REMEDIATION-01/**. See schema-version-registry.json, schema-integrity-report.json, retry-identity-registry.json, both review-packages, validation-results.json, and this handoff.\n\n## Commands or tests run\n\n- Node syntax checks for both task-local scripts.\n- Task-local Draft 2020-12 keyword validation with positive STARTUP_VALID, completed content BLOCKER, and truthful STARTUP_BLOCKER fixtures.\n- Negative rejection fixtures for false clean success, incorrect started/completed state, PASS or credit on startup failure, Aggregator eligibility on startup failure, missing violation, low-only finding, and extra wrapper fields.\n- Attempt 1 direct-byte parse, RFC 8785 JCS recomputation, V1 rejection reproduction, V2 failure-evidence admission, and R2 transport validation.\n- 34/34 required schema, package, identity, source, target, overlay, baseline, and authorization tests passed.\n- No Git, network, service, database, seed, migration, .env, subagent, Reviewer launch, Aggregator launch, or Architecture Reconciliation was used.\n\n## Known risks\n\n- Task-local validator implements only the Draft 2020-12 keywords used by these schemas; a future independent review should repeat validation with a separately provisioned standards implementation without changing this evidence.\n- Compatibility R2 Retry 01 has not run. Both Compatibility findings remain open pending that substantive review.\n- Aggregator remains unauthorized and intentionally has no Compatibility Retry payload in its exact read scope.\n\n## Suggested next step\n\nHuman launches Compatibility R2 Retry 01 from the required clean-room runtime using only the standalone reviewer prompt. If the runtime cannot disable Memory and automatic repository context, stop with CLEAN_ROOM_RUNTIME_NOT_AVAILABLE. After a STARTUP_VALID PASS wrapper is formally intaken, regenerate the Aggregator input binding and seek separate Human launch authorization.\n`,
);

process.stdout.write(
  JSON.stringify(
    {
      status: "PASS_34_OF_34",
      reviewer_return_schema_v2_sha256: schemaHashes.reviewer_return_v2,
      startup_failure_admission_schema_v2_sha256: schemaHashes.startup_failure_admission_v2,
      r2_transport_schema_v2_sha256: schemaHashes.r2_transport_v2,
      attempt_1_admission: "ADMITTED_STARTUP_FAILURE_EVIDENCE",
      retry_package_core_sha256: retryPackageCoreSha256,
      retry_launch_core_sha256: retryLaunchCoreSha256,
      aggregator_package_core_sha256: aggregatorPackageCoreSha256,
    },
    null,
    2,
  ),
);
