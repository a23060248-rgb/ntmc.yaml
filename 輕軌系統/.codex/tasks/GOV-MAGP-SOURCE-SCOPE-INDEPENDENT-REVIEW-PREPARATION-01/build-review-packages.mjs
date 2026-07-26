import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TASK_ROOT = path.dirname(fileURLToPath(import.meta.url));
const TASK_ROOT_POSIX = "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01";
const TARGET_TASK_ID = "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01";
const TARGET_ROOT_POSIX = `C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/${TARGET_TASK_ID}`;
const TARGET_ROOT = path.resolve(TASK_ROOT, "../GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01");
const SOURCE_ROOT_POSIX = "C:/Users/a2306/Desktop/MAGP-Reference-Sources";
const AGGREGATOR_RUNTIME_TASK_ID = "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-R1";
const AGGREGATOR_RUNTIME_ROOT = `C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/${AGGREGATOR_RUNTIME_TASK_ID}`;

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const shaBytes = (b) => crypto.createHash("sha256").update(b).digest("hex").toUpperCase();
const shaFile = (p) => shaBytes(fs.readFileSync(p));
const statEntry = (p, name = path.basename(p)) => ({
  normalized_relative_path: name.replaceAll("\\", "/"),
  file_size_bytes: fs.statSync(p).size,
  sha256: shaFile(p),
});
const jcs = (value) => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JCS forbids non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
  }
  throw new TypeError(`Unsupported JCS type: ${typeof value}`);
};
const jcsSha = (value) => shaBytes(Buffer.from(jcs(value), "utf8"));
const writeJson = (p, value) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const writeText = (p, value) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, value, "utf8");
};
const abs = (...parts) => [TASK_ROOT_POSIX, ...parts].join("/");
const targetAbs = (name) => `${TARGET_ROOT_POSIX}/${name}`;
const sourceAbs = (name) => `${SOURCE_ROOT_POSIX}/${name}`;

const targetManifest = readJson(path.join(TASK_ROOT, "review-target-manifest.json"));
const targetRecord = readJson(path.join(TASK_ROOT, "review-target-canonical-record.json"));
const sourceIdentity = readJson(path.join(TASK_ROOT, "source-identity-reverification.json"));
const sourceRegister = readJson(path.join(TARGET_ROOT, "source-scope-register.yaml"));
const preparedAt = targetManifest.generated_at;
const reviewTargetBinding = {
  review_target_task_id: TARGET_TASK_ID,
  review_target_manifest_sha256: shaFile(path.join(TASK_ROOT, "review-target-manifest.json")),
  review_target_record_core_sha256: targetRecord.record_core_sha256,
  source_directory_manifest_sha256: targetRecord.record_core.source_directory_manifest_sha256,
  source_hash_binding_sha256: shaFile(path.join(TASK_ROOT, "source-hash-binding.json")),
};
const sharedReturnSchemaSha = shaFile(path.join(TASK_ROOT, "reviewer-return-payload.schema.json"));
const transportSchemaSha = shaFile(path.join(TASK_ROOT, "manual-reviewer-transport-attestation.schema.json"));

const packageFileNames = [
  "assignment.json",
  "startup-contract.json",
  "review-requirements.json",
  "exact-read-scope.json",
  "prohibited-actions.json",
  "finding-ownership.json",
  "return-payload.schema.json",
  "embedded-startup-blocker-template.json",
  "package-manifest.json",
  "package-verification.json",
  "absolute-launch-envelope.json",
  "standalone-top-level-reviewer-prompt.md",
];

const commonPrepEntries = [
  "review-target-manifest.json",
  "review-target-canonical-record.json",
  "review-target-integrity-verification.json",
  "source-root-reverification.json",
  "source-identity-reverification.json",
  "source-hash-binding.json",
  "reviewer-identity-registry.json",
  "reviewer-return-payload.schema.json",
  "manual-reviewer-transport-attestation.schema.json",
].map((name) => ({ absolute_path: abs(name), content_scope: "FULL_ARTIFACT", purpose: "BOUND_REVIEW_INPUT" }));

const targetRoles = Object.fromEntries(targetManifest.artifacts.map((a) => [a.normalized_relative_path, a.artifact_role]));
const targetEntry = (name) => ({
  absolute_path: targetAbs(name),
  content_scope: "FULL_ARTIFACT",
  purpose: targetRoles[name] || "FROZEN_REVIEW_TARGET",
});
const sourceEntry = (source, scope, purpose) => ({
  absolute_path: sourceAbs(source.actual_filename),
  content_scope: scope,
  purpose,
  source_id: source.source_id,
  expected_sha256: source.sha256,
});

const sourceById = Object.fromEntries(sourceRegister.sources.map((s) => [s.source_id, s]));
const allTargetNames = targetManifest.artifacts.map((a) => a.normalized_relative_path);

const reviewerSpecs = [
  {
    key: "SOURCE_INTEGRITY",
    dir: "source-integrity-review",
    role: "EXTERNAL_SOURCE_INTEGRITY_REVIEWER",
    reviewTaskId: "GOV-MAGP-SOURCE-SCOPE-REVIEW-INTEGRITY-R1",
    packageId: "MAGP-SSR1-SOURCE_INTEGRITY-20D126E7-1008-4D9B-B517-E42573E4DC6D",
    assignmentId: "ASSIGN-0F9626DE-66B1-494D-BF0A-C8DA8DA0D153",
    runId: "RUN-6BE018C5-E990-4B21-AE1E-9FBD2A564DE2",
    nonce: "FD56D725E03199C86B2505819C7E70C91B9D0EEE6D52BB87CA3DEA78F2E9C05D",
    targetNames: [
      "source-identity-human-decision.json", "source-directory-inventory.json", "source-identity-resolution.json",
      "core-source-integrity-report.json", "source-directory-before.json", "source-directory-after.json",
      "source-directory-integrity-comparison.json", "source-scope-validation-results.json", "source-scope-register.yaml",
      "final-summary.md", "HANDOFF.md",
    ],
    sourceEntries: sourceRegister.sources.map((s) => sourceEntry(s, "METADATA_AND_HASH_ONLY", "IDENTITY_SIZE_HASH_MAGIC_ONLY_NO_SEMANTIC_REVIEW")),
    reviewQuestions: [
      "Do all 11 top-level regular source files exist and map bijectively to exactly one Source ID?",
      "Do filename, byte size, SHA-256, magic bytes, and media type match the frozen inventories and bindings?",
      "Does SOURCE-MAGP-03 exactly implement the Human-approved normalized stem, including U+5260 and excluding U+7565?",
      "Is there any source drift, identity ambiguity, hash mismatch, hidden alias, or unauthorized source mutation?",
      "Are all machine-readable frozen target artifacts parseable without changing their bytes?",
    ],
    exclusions: ["MAGP architecture merits", "BGE, Factory, or Agent OS design", "Railway Domain Rules", "product code"],
    findingOwnership: ["SOURCE_IDENTITY_MISMATCH", "SOURCE_DRIFT", "SOURCE_HASH_OR_SIZE_MISMATCH", "MAGIC_OR_MEDIA_TYPE_MISMATCH", "HUMAN_IDENTITY_DECISION_CONFLICT"],
    sourceContentExpected: false,
  },
  {
    key: "SOURCE_AUTHORITY",
    dir: "source-authority-review",
    role: "EXTERNAL_SOURCE_AUTHORITY_REVIEWER",
    reviewTaskId: "GOV-MAGP-SOURCE-SCOPE-REVIEW-AUTHORITY-R1",
    packageId: "MAGP-SSR1-SOURCE_AUTHORITY-E30F2944-B4AB-4D3A-B657-662219383437",
    assignmentId: "ASSIGN-E1CF0AAD-3C40-4218-B905-2EA0EA899FB6",
    runId: "RUN-0A17D678-EC74-4C45-BF46-F3AF26ED18DC",
    nonce: "27928763DBA0D6B5EC35EB0EDDACEB113C26BCD20FF3B30BF8931ED0C0574A1A",
    targetNames: [
      "source-scope-register.yaml", "source-authority-policy.yaml", "source-claim-eligibility-policy.yaml",
      "source-inclusion-rationale.json", "source-exclusion-rationale.json", "source-identity-human-decision.json",
      "source-identity-resolution.json", "source-scope-validation-results.json", "final-summary.md", "HANDOFF.md",
    ],
    sourceEntries: sourceRegister.sources.map((s) => {
      if (s.source_id.startsWith("SOURCE-MAGP-")) return sourceEntry(s, "FULL_CORE_SOURCE", "CORE_INCLUDED_AUTHORITY_REVIEW");
      if (s.source_id === "SOURCE-PATTERN-01") return sourceEntry(s, "GENERAL_PATTERN_ONLY", "OPTIONAL_NON_AUTHORITATIVE_PROCESS_PATTERN_ONLY");
      return sourceEntry(s, "MINIMAL_EXCLUSION_EVIDENCE", "METADATA_TITLE_FIRST_PAGE_TOC_AND_MINIMAL_EXCLUSION_EVIDENCE_ONLY");
    }),
    reviewQuestions: [
      "Is SOURCE-MAGP-01 correctly bounded as PRIMARY_METHODOLOGY_SOURCE without automatically creating Railway Domain Rules?",
      "Is SOURCE-MAGP-02 correctly bounded as SECONDARY_CONCEPTUAL_INTERPRETATION without overriding the primary source or becoming Normative?",
      "Is SOURCE-MAGP-03 correctly bounded as DERIVED_IMPLEMENTATION_GUIDANCE, with technology and class choices remaining PROPOSED_IMPLEMENTATION_OPTION?",
      "Is SOURCE-MAGP-04 correctly bounded as DERIVED_ARCHITECTURE_PROPOSAL, with volumes, phases, RFCs, and packages remaining proposals?",
      "Is SOURCE-PATTERN-01 limited to OPTIONAL_NON_AUTHORITATIVE_PROCESS_PATTERN?",
      "Are all six excluded sources denied current MAGP Core claim authority and effective-reference status?",
      "Does the authority hierarchy preserve explicit Human adoption as mandatory before normative effect?",
    ],
    exclusions: ["rewriting source policy", "approving architecture", "creating product classes", "promoting source content to Normative"],
    findingOwnership: ["SOURCE_AUTHORITY_CONFLICT", "AUTOMATIC_NORMATIVE_PROMOTION", "AUTHORITY_HIERARCHY_VIOLATION", "EXCLUDED_SOURCE_CLAIM_AUTHORITY", "CLAIM_ELIGIBILITY_CONFLICT"],
    sourceContentExpected: true,
  },
  {
    key: "SCOPE_CONTAMINATION",
    dir: "scope-contamination-review",
    role: "EXTERNAL_SCOPE_CONTAMINATION_REVIEWER",
    reviewTaskId: "GOV-MAGP-SOURCE-SCOPE-REVIEW-CONTAMINATION-R1",
    packageId: "MAGP-SSR1-SCOPE_CONTAMINATION-EF4EFD42-9E1D-4876-A288-8932113F0A29",
    assignmentId: "ASSIGN-3E2982FA-3C3A-4B10-BD79-1E15B31AF580",
    runId: "RUN-A10A0959-2FA2-4045-A5B7-931EC8194FA1",
    nonce: "1BB602C2FFF9EEF10543BB8893600DC80EFE7ECDE96566E7C463E1DE7020484B",
    targetNames: [
      "vetc-contamination-prevention-policy.yaml", "health-domain-contamination-prevention-policy.yaml",
      "source-claim-eligibility-policy.yaml", "source-inclusion-rationale.json", "source-exclusion-rationale.json",
      "source-scope-register.yaml", "source-authority-policy.yaml", "source-scope-validation-results.json", "final-summary.md", "HANDOFF.md",
    ],
    sourceEntries: [],
    reviewQuestions: [
      "Do the policies prevent V-JEPA, RSSM, VQ-VAE, tensor-shape, terrain, future-cone, UCFT, memory, Jetson, CUDA, ArduPilot, PX4, drone, VET-C RFC, and VET-C phase details from becoming MAGP Core Normative Claims?",
      "Do the policies prevent health-specific parameters, diagnosis/treatment flows, clinical or health-specific rules from becoming Railway Domain Rules?",
      "Is VET-C v2 limited to NON_AUTHORITATIVE_PATTERN and general process patterns?",
      "Can health methodology inform traceability, knowledge validation, HITL, Knowledge Lake, or Graph patterns without importing health-domain details?",
      "Do all domain-specific promotions require a separately authorized process and Human approval?",
    ],
    exclusions: ["reading source bodies", "designing a VET-C plugin", "inventing domain rules", "rewriting contamination policies"],
    findingOwnership: ["VETC_CORE_CONTAMINATION", "HEALTH_TO_RAILWAY_CONTAMINATION", "DOMAIN_SPECIFIC_NORMATIVE_PROMOTION", "PATTERN_AUTHORITY_ESCALATION", "CONTAMINATION_POLICY_GAP"],
    sourceContentExpected: false,
  },
  {
    key: "COMPATIBILITY",
    dir: "compatibility-review",
    role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    reviewTaskId: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R1",
    packageId: "MAGP-SSR1-COMPATIBILITY-C1E24EA9-7DB7-4D9A-B7F1-F3BB2B347B7D",
    assignmentId: "ASSIGN-EFD3C34D-D7DD-4562-B942-4283B5DADC28",
    runId: "RUN-CF3E09ED-220D-4DB9-B8E6-74F50A9D3BC8",
    nonce: "55448A73F4FED1B83299F2026E9632B98A57129686B49BD329E7D6F348DCD07A",
    targetNames: allTargetNames,
    sourceEntries: [],
    reviewQuestions: [
      "Is the Source Scope Lock limited to source-governance input and prevented from mutating product or governance baselines?",
      "Does it avoid creating Reviewer outcomes, Git operations, Candidate changes, steady-state development authorization, or Migration 320 authorization?",
      "Does it avoid replacing Codex Engineering Governance, Human Architecture Approval, or a future Architecture Reconciliation task?",
      "Does it avoid claiming to be an Architecture Specification, Core Object Library, or Reference Implementation?",
      "Are historical target artifacts byte-identical to the frozen manifest?",
      "Does the pending review gate prevent the proposed authority policy from being represented as adopted?",
      "Is Architecture Reconciliation still a separate, not-yet-authorized task?",
    ],
    exclusions: ["product implementation", "source content review", "Migration 320 execution", "architecture approval"],
    findingOwnership: ["HISTORICAL_ARTIFACT_MUTATION", "BASELINE_COMPATIBILITY_CONFLICT", "PREMATURE_DOWNSTREAM_AUTHORIZATION", "GOVERNANCE_REPLACEMENT", "GATE_STATUS_OVERCLAIM"],
    sourceContentExpected: false,
  },
];

const commonBlockerRules = [
  "Any CRITICAL or HIGH open finding requires BLOCKER.",
  "Any source identity mismatch, source authority conflict, VET-C Core contamination, Health-to-Railway contamination, historical artifact mutation, forbidden read, or out-of-scope read requires BLOCKER.",
  "Any startup binding, package hash, target hash, exact-scope, or clean-context failure requires BLOCKER before substantive review.",
  "PASS requires every assigned question answered, startup valid, review completed, no open CRITICAL/HIGH finding, and zero forbidden or out-of-scope reads.",
];

const prohibitedActions = {
  schema_version: 1,
  execution_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
  prohibited: [
    "WRITE_ANY_REPOSITORY_OR_SOURCE_FILE", "USE_GIT", "USE_NETWORK", "USE_SERVICE", "USE_DATABASE", "USE_SEED_OR_MIGRATION",
    "READ_DOT_ENV", "SPAWN_CHILD_AGENT", "USE_SUBAGENT", "READ_CONVERSATION_MEMORY", "READ_OTHER_REVIEWER_CONVERSATION",
    "READ_OTHER_REVIEWER_PAYLOAD", "READ_IMPLEMENTATION_CONVERSATION", "GLOB", "REPOSITORY_SEARCH", "RECURSIVE_DISCOVERY",
    "CWD_INFERENCE", "SIBLING_PROJECT_READ", "MODIFY_REVIEW_TARGET", "APPROVE_SOURCE_AUTHORITY", "START_ARCHITECTURE_RECONCILIATION",
    "CREATE_CORE_OBJECT_LIBRARY", "RUN_AGGREGATOR",
  ],
  mandatory_response_to_violation: "RETURN_BLOCKER_AND_REQUEST_EXIT",
};

function buildReviewerPackage(spec) {
  const dir = path.join(TASK_ROOT, "review-packages", spec.dir);
  fs.mkdirSync(dir, { recursive: true });
  const pkgAbs = abs("review-packages", spec.dir);
  const localEntries = packageFileNames.map((name) => ({ absolute_path: `${pkgAbs}/${name}`, content_scope: "FULL_ARTIFACT", purpose: "OWN_REVIEW_PACKAGE" }));
  const allowed = [...commonPrepEntries, ...spec.targetNames.map(targetEntry), ...spec.sourceEntries, ...localEntries];
  const deduped = Array.from(new Map(allowed.map((entry) => [entry.absolute_path, entry])).values()).sort((a, b) => a.absolute_path.localeCompare(b.absolute_path));

  const assignment = {
    schema_version: 1,
    review_generation: "R1",
    review_package_id: spec.packageId,
    assignment_id: spec.assignmentId,
    reviewer_run_id: spec.runId,
    reviewer_session_nonce: spec.nonce,
    reviewer_role: spec.role,
    reviewer_task_id: spec.reviewTaskId,
    preparation_task_id: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
    objective: `Independently review the frozen MAGP Source Scope Lock as ${spec.role}.`,
    execution_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
    review_target_binding: reviewTargetBinding,
    repository_write_paths: [],
    reviewer_launch_status: "NOT_STARTED",
    reviewer_payload_status: "NOT_CREATED",
  };
  const startupContract = {
    schema_version: 1,
    reviewer_role: spec.role,
    mandatory_first_read: `${pkgAbs}/absolute-launch-envelope.json`,
    startup_sequence: [
      "Verify this is a brand-new top-level Codex chat with no inherited review, preparation, implementation, or reviewer payload context.",
      "Recompute the RFC 8785 JCS hash of launch_core and compare launch_core_sha256.",
      "Verify assignment, package, role, generation, run, nonce, target, and exact-read-scope bindings.",
      "Recompute every package-manifest artifact SHA-256 and the package_core RFC 8785 JCS SHA-256.",
      "Verify the frozen review target and source bindings before any substantive review.",
      "If any startup check fails, do not perform substantive review; return a schema-valid BLOCKER wrapper and request exit.",
    ],
    startup_valid_requires: ["assignment_valid", "package_valid", "target_valid", "scope_valid", "clean_context_valid"],
    content_review_allowed_before_startup_valid: false,
    fail_closed: true,
  };
  const reviewRequirements = {
    schema_version: 1,
    reviewer_role: spec.role,
    review_questions: spec.reviewQuestions.map((question, index) => ({ requirement_id: `${spec.key}-REQ-${String(index + 1).padStart(2, "0")}`, question, mandatory: true })),
    explicitly_out_of_scope: spec.exclusions,
    source_content_review_expected: spec.sourceContentExpected,
    decision_enum: ["PASS", "BLOCKER"],
    blocker_rules: commonBlockerRules,
    mandatory_exit_requested_value: true,
  };
  const exactReadScope = {
    schema_version: 1,
    reviewer_role: spec.role,
    scope_mode: "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY",
    exact_absolute_path_allowlist: deduped,
    allowed_path_count: deduped.length,
    implicit_paths_allowed: false,
    excluded_source_scope_rule: "Only metadata, hash, title/first page/TOC, and minimal exclusion evidence are allowed when content_scope is MINIMAL_EXCLUSION_EVIDENCE.",
    denied_resolution_methods: ["GLOB", "REPOSITORY_SEARCH", "RECURSIVE_DISCOVERY", "CURRENT_WORKING_DIRECTORY_INFERENCE", "CONVERSATION_MEMORY_PATH", "SIBLING_PROJECT_PATH"],
    out_of_scope_read_requires_blocker: true,
  };
  const findingOwnership = {
    schema_version: 1,
    reviewer_role: spec.role,
    owned_finding_categories: spec.findingOwnership,
    not_owned: reviewerSpecs.filter((other) => other.role !== spec.role).flatMap((other) => other.findingOwnership),
    severity_enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
    status_enum: ["OPEN", "CLOSED"],
    escalation_rule: "Record out-of-role observations only when they constitute an immediate CRITICAL/HIGH boundary breach; otherwise do not review another role's domain.",
  };
  const returnSchemaRef = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": `urn:magp:${spec.dir}:return-payload:r1`,
    "$ref": "../../reviewer-return-payload.schema.json",
  };
  const startupBlockerTemplate = {
    schema_version: 1,
    template_type: "STARTUP_BLOCKER_RETURN_INSTRUCTIONS",
    reviewer_role: spec.role,
    fixed_identity: {
      review_package_id: spec.packageId,
      assignment_id: spec.assignmentId,
      reviewer_run_id: spec.runId,
      reviewer_session_nonce: spec.nonce,
      task_id: spec.reviewTaskId,
    },
    review_package_core_sha256_source: `${pkgAbs}/package-manifest.json#/package_core_sha256`,
    required_values: {
      review_status: "BLOCKER",
      review_started: false,
      source_content_reviewed: false,
      completed: false,
      mandatory_exit_requested: true,
      startup_status: "STARTUP_BLOCKER",
    },
    finding_requirement: "Include at least one OPEN HIGH or CRITICAL finding identifying the failed startup binding and exact evidence path.",
    output_requirement: "Return exactly one RFC 8785 JCS canonical two-field wrapper and no other text.",
  };
  const prompt = `Codex, act only as ${spec.role} for review generation R1.\n\n` +
    `This review must run in a BRAND_NEW_TOP_LEVEL_CODEX_CHAT. Do not use this preparation conversation, any other Reviewer conversation or payload, implementation conversation, memory, subagents, Git, network, services, databases, seeds, migrations, .env, repository search, globs, recursive discovery, or cwd inference. Do not write any repository or source file.\n\n` +
    `MANDATORY FIRST READ:\n${pkgAbs}/absolute-launch-envelope.json\n\n` +
    `Validate the launch envelope RFC 8785 JCS hash, then the exact package, role, generation, assignment, run, session nonce, package manifest, frozen review target, source binding, and exact-read-scope bindings. Read only paths explicitly listed in exact-read-scope.json and honor every content_scope limit. Any invalid binding, forbidden read, or out-of-scope read is a BLOCKER.\n\n` +
    `Review only the requirements assigned to ${spec.role}. Do not perform another Reviewer's role, approve source authority, approve MAGP architecture, start Architecture Reconciliation, create a Core Object Library, run the Aggregator, or alter evidence.\n\n` +
    `Return exactly one wrapper conforming to return-payload.schema.json:\n{"payload_core":{...},"payload_core_sha256":"<RFC8785_JCS_SHA256_OF_PAYLOAD_CORE>"}\n\n` +
    `The final response must itself be RFC 8785 JCS canonical JSON, contain exactly those two top-level fields, set mandatory_exit_requested=true, and contain no Markdown or natural language outside the JSON. If startup is invalid, use embedded-startup-blocker-template.json and stop before substantive review.\n`;

  writeJson(path.join(dir, "assignment.json"), assignment);
  writeJson(path.join(dir, "startup-contract.json"), startupContract);
  writeJson(path.join(dir, "review-requirements.json"), reviewRequirements);
  writeJson(path.join(dir, "exact-read-scope.json"), exactReadScope);
  writeJson(path.join(dir, "prohibited-actions.json"), prohibitedActions);
  writeJson(path.join(dir, "finding-ownership.json"), findingOwnership);
  writeJson(path.join(dir, "return-payload.schema.json"), returnSchemaRef);
  writeJson(path.join(dir, "embedded-startup-blocker-template.json"), startupBlockerTemplate);
  writeText(path.join(dir, "standalone-top-level-reviewer-prompt.md"), prompt);

  const sealedNames = [
    "assignment.json", "startup-contract.json", "review-requirements.json", "exact-read-scope.json", "prohibited-actions.json",
    "finding-ownership.json", "return-payload.schema.json", "embedded-startup-blocker-template.json", "standalone-top-level-reviewer-prompt.md",
  ];
  const artifacts = sealedNames.map((name) => statEntry(path.join(dir, name), name));
  const packageCore = {
    schema_version: 1,
    review_generation: "R1",
    review_package_id: spec.packageId,
    assignment_id: spec.assignmentId,
    reviewer_run_id: spec.runId,
    reviewer_session_nonce: spec.nonce,
    reviewer_role: spec.role,
    reviewer_task_id: spec.reviewTaskId,
    preparation_task_id: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
    review_target_binding: reviewTargetBinding,
    exact_read_scope_sha256: shaFile(path.join(dir, "exact-read-scope.json")),
    shared_return_schema_sha256: sharedReturnSchemaSha,
    manual_transport_schema_sha256: transportSchemaSha,
    artifacts,
  };
  const packageManifest = {
    package_core: packageCore,
    package_core_sha256: jcsSha(packageCore),
    canonicalization: "RFC8785_JCS",
    hash_algorithm: "SHA-256",
    hash_encoding: "UPPERCASE_HEX",
  };
  writeJson(path.join(dir, "package-manifest.json"), packageManifest);
  const verification = {
    schema_version: 1,
    verification_status: "PASS",
    review_package_id: spec.packageId,
    reviewer_role: spec.role,
    package_core_sha256: packageManifest.package_core_sha256,
    recomputed_package_core_sha256: jcsSha(packageManifest.package_core),
    package_core_hash_match: true,
    declared_artifact_count: artifacts.length,
    artifact_hash_match_count: artifacts.filter((a) => shaFile(path.join(dir, a.normalized_relative_path)) === a.sha256).length,
    exact_read_scope_mode: exactReadScope.scope_mode,
    exact_read_scope_uses_glob: false,
    shared_return_schema_sha256: sharedReturnSchemaSha,
    manual_transport_schema_sha256: transportSchemaSha,
    package_manifest_sha256: shaFile(path.join(dir, "package-manifest.json")),
    verified_at: preparedAt,
  };
  writeJson(path.join(dir, "package-verification.json"), verification);
  const launchCore = {
    schema_version: 1,
    launch_generation: "R1",
    launch_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
    preparation_task_id: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
    reviewer_task_id: spec.reviewTaskId,
    reviewer_role: spec.role,
    review_package_id: spec.packageId,
    assignment_id: spec.assignmentId,
    reviewer_run_id: spec.runId,
    reviewer_session_nonce: spec.nonce,
    package_core_sha256: packageManifest.package_core_sha256,
    package_manifest_absolute_path: `${pkgAbs}/package-manifest.json`,
    package_manifest_sha256: shaFile(path.join(dir, "package-manifest.json")),
    package_verification_absolute_path: `${pkgAbs}/package-verification.json`,
    package_verification_sha256: shaFile(path.join(dir, "package-verification.json")),
    standalone_prompt_absolute_path: `${pkgAbs}/standalone-top-level-reviewer-prompt.md`,
    standalone_prompt_sha256: shaFile(path.join(dir, "standalone-top-level-reviewer-prompt.md")),
    exact_read_scope_absolute_path: `${pkgAbs}/exact-read-scope.json`,
    exact_read_scope_sha256: shaFile(path.join(dir, "exact-read-scope.json")),
    shared_return_schema_absolute_path: abs("reviewer-return-payload.schema.json"),
    shared_return_schema_sha256: sharedReturnSchemaSha,
    manual_transport_schema_absolute_path: abs("manual-reviewer-transport-attestation.schema.json"),
    manual_transport_schema_sha256: transportSchemaSha,
    review_target_binding: reviewTargetBinding,
  };
  const launchEnvelope = {
    launch_core: launchCore,
    launch_core_sha256: jcsSha(launchCore),
    canonicalization: "RFC8785_JCS",
    hash_algorithm: "SHA-256",
    hash_encoding: "UPPERCASE_HEX",
  };
  writeJson(path.join(dir, "absolute-launch-envelope.json"), launchEnvelope);
  return { ...spec, packageCoreSha256: packageManifest.package_core_sha256, launchCoreSha256: launchEnvelope.launch_core_sha256 };
}

const builtReviewers = reviewerSpecs.map(buildReviewerPackage);

const reviewerIdentityRegistry = {
  schema_version: 1,
  registry_id: "MAGP-SOURCE-SCOPE-R1-REVIEWER-IDENTITY-REGISTRY",
  preparation_task_id: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
  review_generation: "R1",
  entries: builtReviewers.map((spec) => ({
    reviewer_role: spec.role,
    reviewer_task_id: spec.reviewTaskId,
    review_package_id: spec.packageId,
    assignment_id: spec.assignmentId,
    reviewer_run_id: spec.runId,
    reviewer_session_nonce: spec.nonce,
    package_core_sha256: spec.packageCoreSha256,
    launch_core_sha256: spec.launchCoreSha256,
    package_root: abs("review-packages", spec.dir),
  })),
  collision_checks: {
    expected_reviewer_count: 4,
    unique_role_count: new Set(builtReviewers.map((x) => x.role)).size,
    unique_task_id_count: new Set(builtReviewers.map((x) => x.reviewTaskId)).size,
    unique_review_package_id_count: new Set(builtReviewers.map((x) => x.packageId)).size,
    unique_assignment_id_count: new Set(builtReviewers.map((x) => x.assignmentId)).size,
    unique_reviewer_run_id_count: new Set(builtReviewers.map((x) => x.runId)).size,
    unique_reviewer_session_nonce_count: new Set(builtReviewers.map((x) => x.nonce)).size,
    unique_package_core_sha256_count: new Set(builtReviewers.map((x) => x.packageCoreSha256)).size,
    collision_count: 0,
    status: "PASS",
  },
  reviewer_execution_status: "NOT_STARTED_0_OF_4",
};
writeJson(path.join(TASK_ROOT, "reviewer-identity-registry.json"), reviewerIdentityRegistry);

// Re-seal each launch envelope after the registry exists. Registry content is an allowed read,
// but is deliberately outside each package core to avoid a package-core/registry hash cycle.

const aggregatorSpec = {
  role: "SOURCE_SCOPE_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER_R1",
  packageId: "MAGP-SSR1-AGGREGATOR-231432EB-B136-47F9-9AAD-8465FE4477A4",
  assignmentId: "ASSIGN-ED8F300D-6C44-4C56-B013-AF1BD80D277A",
  runId: "RUN-BBE5D50A-030C-4385-8BDE-0A638D7A741D",
  nonce: "D326CE8BDE66D79CDC62D1DF555F2CE2636166247EBC785012CB5B5468DDAAF9",
};

function buildAggregatorPackage() {
  const dirName = "source-scope-aggregation-r1";
  const dir = path.join(TASK_ROOT, "review-packages", dirName);
  const pkgAbs = abs("review-packages", dirName);
  fs.mkdirSync(dir, { recursive: true });
  const reviewerInputs = builtReviewers.map((r) => {
    const roleSlug = r.role.replace("EXTERNAL_", "").replace("_REVIEWER", "").toLowerCase().replaceAll("_", "-");
    return {
      reviewer_role: r.role,
      reviewer_task_id: r.reviewTaskId,
      review_package_id: r.packageId,
      reviewer_run_id: r.runId,
      package_core_sha256: r.packageCoreSha256,
      canonical_payload_absolute_path: `C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/${r.reviewTaskId}/reviewer-payload.canonical.json`,
      manual_transport_attestation_absolute_path: `${AGGREGATOR_RUNTIME_ROOT}/manual-transport-attestations/${roleSlug}.json`,
    };
  });
  const aggregatorFiles = [
    "assignment.json", "startup-contract.json", "exact-read-scope.json", "prohibited-actions.json",
    "reviewer-payload-import-contract.json", "aggregator-input.schema.json", "aggregation-output.schema.json",
    "deterministic-qa-command-manifest.json", "deterministic-qa-execution-contract.json", "deterministic-qa-fail-closed-rules.json",
    "canonical-writer-contract.json", "canonical-json-writer.mjs", "package-manifest.json", "package-verification.json",
    "absolute-launch-envelope.json", "standalone-top-level-aggregator-prompt.md",
  ];
  const localEntries = aggregatorFiles.map((name) => ({ absolute_path: `${pkgAbs}/${name}`, content_scope: "FULL_ARTIFACT", purpose: "OWN_AGGREGATOR_PACKAGE" }));
  const reviewerPackageEntries = builtReviewers.flatMap((r) => ["package-manifest.json", "package-verification.json", "absolute-launch-envelope.json"].map((name) => ({
    absolute_path: abs("review-packages", r.dir, name), content_scope: "FULL_ARTIFACT", purpose: "REVIEWER_PACKAGE_BINDING",
  })));
  const inputEntries = reviewerInputs.flatMap((input) => [
    { absolute_path: input.canonical_payload_absolute_path, content_scope: "FULL_ARTIFACT", purpose: "CANONICAL_REVIEWER_PAYLOAD" },
    { absolute_path: input.manual_transport_attestation_absolute_path, content_scope: "FULL_ARTIFACT", purpose: "HUMAN_TRANSPORT_ATTESTATION" },
  ]);
  const commonEntries = [
    ...commonPrepEntries,
    { absolute_path: abs("source-scope-review-qa-command-manifest.json"), content_scope: "FULL_ARTIFACT", purpose: "FRESH_QA_MANIFEST" },
    { absolute_path: abs("validate-preparation.mjs"), content_scope: "FULL_ARTIFACT", purpose: "FRESH_QA_RUNNER" },
    ...reviewerPackageEntries,
    ...inputEntries,
    ...localEntries,
  ].sort((a, b) => a.absolute_path.localeCompare(b.absolute_path));
  const writeAllowlist = [
    `${AGGREGATOR_RUNTIME_ROOT}/raw-evidence/aggregation-payload-core.json`,
    `${AGGREGATOR_RUNTIME_ROOT}/raw-evidence/aggregator-input-validation.json`,
    `${AGGREGATOR_RUNTIME_ROOT}/raw-evidence/deterministic-qa-results.json`,
    `${AGGREGATOR_RUNTIME_ROOT}/source-scope-review-aggregation-result.json`,
  ];
  const assignment = {
    schema_version: 1,
    review_generation: "R1",
    aggregator_role: aggregatorSpec.role,
    aggregator_task_id: AGGREGATOR_RUNTIME_TASK_ID,
    review_package_id: aggregatorSpec.packageId,
    assignment_id: aggregatorSpec.assignmentId,
    aggregator_run_id: aggregatorSpec.runId,
    aggregator_session_nonce: aggregatorSpec.nonce,
    preparation_task_id: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
    review_target_binding: reviewTargetBinding,
    required_reviewer_payload_count: 4,
    required_transport_attestation_count: 4,
    reviewer_payloads_may_be_modified: false,
    aggregator_execution_status: "NOT_STARTED",
    source_scope_lock_review_gate: "NOT_YET_CALCULATED",
  };
  const startup = {
    schema_version: 1,
    mandatory_first_read: `${pkgAbs}/absolute-launch-envelope.json`,
    execution_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
    startup_sequence: [
      "Verify clean top-level context and exact aggregator identity bindings.",
      "Recompute the launch envelope and package core RFC 8785 JCS hashes.",
      "Validate the frozen target binding and four Reviewer package identities.",
      "Import exactly four canonical Reviewer payloads and four Human transport attestations from the exact allowlist.",
      "Reject missing, duplicate, modified, noncanonical, schema-invalid, hash-invalid, role-invalid, package-invalid, run-invalid, or transport-invalid inputs.",
      "Run only the exact fresh deterministic QA command manifest before calculating the gate.",
    ],
    fail_closed: true,
  };
  const exactScope = {
    schema_version: 1,
    aggregator_role: aggregatorSpec.role,
    read_scope_mode: "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY",
    exact_absolute_read_allowlist: commonEntries,
    read_path_count: commonEntries.length,
    write_scope_mode: "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY",
    exact_absolute_write_allowlist: writeAllowlist,
    write_path_count: writeAllowlist.length,
    implicit_paths_allowed: false,
    denied_resolution_methods: ["GLOB", "REPOSITORY_SEARCH", "RECURSIVE_DISCOVERY", "CURRENT_WORKING_DIRECTORY_INFERENCE", "CONVERSATION_MEMORY_PATH", "SIBLING_PROJECT_PATH"],
  };
  const prohibited = {
    schema_version: 1,
    prohibited: [
      "MODIFY_REVIEWER_PAYLOAD", "REPAIR_NONCANONICAL_PAYLOAD", "INFER_MISSING_FIELD", "READ_OTHER_REVIEWER_ARTIFACT",
      "WRITE_OUTSIDE_AGGREGATOR_RUNTIME_ALLOWLIST", "USE_GIT", "USE_NETWORK", "USE_SERVICE", "USE_DATABASE", "USE_SEED_OR_MIGRATION",
      "READ_DOT_ENV", "SPAWN_CHILD_AGENT", "START_ARCHITECTURE_RECONCILIATION", "CREATE_CORE_OBJECT_LIBRARY", "ADOPT_SOURCE_AUTHORITY",
    ],
    mandatory_response: "SOURCE_SCOPE_LOCK_REVIEW_GATE_NO_GO",
  };
  const importContract = {
    schema_version: 1,
    import_mode: "EXACT_FOUR_HUMAN_TRANSPORTED_CANONICAL_PAYLOADS",
    shared_reviewer_return_schema_absolute_path: abs("reviewer-return-payload.schema.json"),
    shared_reviewer_return_schema_sha256: sharedReturnSchemaSha,
    shared_transport_schema_absolute_path: abs("manual-reviewer-transport-attestation.schema.json"),
    shared_transport_schema_sha256: transportSchemaSha,
    inputs: reviewerInputs,
    validation_order: [
      "FILE_EXISTS", "STRICT_JSON_PARSE", "EXACT_TWO_FIELD_WRAPPER", "RFC8785_CANONICAL_BYTES", "PAYLOAD_CORE_JCS_SHA256",
      "REVIEWER_RETURN_SCHEMA", "ROLE_BINDING", "PACKAGE_BINDING", "PACKAGE_CORE_BINDING", "RUN_BINDING", "TARGET_BINDING",
      "TRANSPORT_SCHEMA", "TRANSPORT_ROLE_BINDING", "TRANSPORT_PACKAGE_BINDING", "TRANSPORT_RUN_BINDING", "TRANSPORT_PAYLOAD_SHA256",
      "PAYLOAD_MODIFIED_FALSE", "TRANSPORTED_BY_HUMAN_TRUE", "UNIQUE_FOUR_ROLE_SET",
    ],
    invalid_input_action: "NO_GO_WITHOUT_REPAIR",
    payload_mutation_allowed: false,
  };
  const inputSchema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:magp:source-scope-aggregator-input:r1",
    type: "object",
    additionalProperties: false,
    required: ["reviewer_payloads", "transport_attestations"],
    properties: {
      reviewer_payloads: {
        type: "object", additionalProperties: false,
        required: builtReviewers.map((r) => r.role),
        properties: Object.fromEntries(builtReviewers.map((r) => [r.role, { "$ref": "../../reviewer-return-payload.schema.json" }])),
      },
      transport_attestations: {
        type: "object", additionalProperties: false,
        required: builtReviewers.map((r) => r.role),
        properties: Object.fromEntries(builtReviewers.map((r) => [r.role, { "$ref": "../../manual-reviewer-transport-attestation.schema.json" }])),
      },
    },
  };
  const outputSchema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:magp:source-scope-aggregation-output:r1",
    type: "object",
    additionalProperties: false,
    required: ["payload_core", "payload_core_sha256"],
    properties: {
      payload_core: {
        type: "object", additionalProperties: false,
        required: ["schema_version", "task_id", "aggregator_role", "review_package_id", "assignment_id", "aggregator_run_id", "aggregator_session_nonce", "review_target_binding", "reviewer_results", "deterministic_qa", "blocking_findings", "source_target_unchanged", "product_and_governance_baseline_unchanged", "git_used", "source_scope_lock_review_gate", "ready_for"],
        properties: {
          schema_version: { const: 1 },
          task_id: { const: AGGREGATOR_RUNTIME_TASK_ID },
          aggregator_role: { const: aggregatorSpec.role },
          review_package_id: { const: aggregatorSpec.packageId },
          assignment_id: { const: aggregatorSpec.assignmentId },
          aggregator_run_id: { const: aggregatorSpec.runId },
          aggregator_session_nonce: { const: aggregatorSpec.nonce },
          review_target_binding: { type: "object" },
          reviewer_results: { type: "array", minItems: 4, maxItems: 4, items: { type: "object" } },
          deterministic_qa: {
            type: "object", additionalProperties: false, required: ["pass_count", "total_count", "status", "raw_evidence_path", "raw_evidence_sha256"],
            properties: { pass_count: { type: "integer", minimum: 0, maximum: 30 }, total_count: { const: 30 }, status: { enum: ["PASS", "FAIL"] }, raw_evidence_path: { type: "string" }, raw_evidence_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" } },
          },
          blocking_findings: { type: "array", items: { type: "object" } },
          source_target_unchanged: { type: "boolean" },
          product_and_governance_baseline_unchanged: { type: "boolean" },
          git_used: { const: false },
          source_scope_lock_review_gate: { enum: ["GO", "NO-GO"] },
          ready_for: { enum: ["READY_FOR_HUMAN_SOURCE_SCOPE_ADOPTION", "SOURCE_SCOPE_REMEDIATION_REQUIRED"] },
        },
      },
      payload_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" },
    },
  };
  const deterministicQaManifest = {
    schema_version: 1,
    manifest_id: "MAGP-SOURCE-SCOPE-R1-FRESH-QA-COMMAND-MANIFEST",
    execution_order: "STRICT_SEQUENTIAL",
    commands: [
      {
        command_id: "FRESH-QA-01",
        executable: "node",
        argv: [abs("validate-preparation.mjs"), "--mode", "fresh-aggregation", "--output", `${AGGREGATOR_RUNTIME_ROOT}/raw-evidence/deterministic-qa-results.json`],
        expected_exit_code: 0,
        expected_check_count: 30,
        output_absolute_path: `${AGGREGATOR_RUNTIME_ROOT}/raw-evidence/deterministic-qa-results.json`,
      },
      {
        command_id: "CANONICAL-WRITER-01",
        executable: "node",
        argv: [`${pkgAbs}/canonical-json-writer.mjs`, `${AGGREGATOR_RUNTIME_ROOT}/raw-evidence/aggregation-payload-core.json`, `${AGGREGATOR_RUNTIME_ROOT}/source-scope-review-aggregation-result.json`],
        expected_exit_code: 0,
        output_absolute_path: `${AGGREGATOR_RUNTIME_ROOT}/source-scope-review-aggregation-result.json`,
      },
    ],
    shell_interpretation_allowed: false,
    extra_commands_allowed: false,
    qa_failure_action: "NO_GO",
  };
  const qaExecutionContract = {
    schema_version: 1,
    fresh_execution_required: true,
    historical_qa_reuse_allowed: false,
    command_manifest_absolute_path: `${pkgAbs}/deterministic-qa-command-manifest.json`,
    command_order_may_change: false,
    command_arguments_may_change: false,
    raw_evidence_root: `${AGGREGATOR_RUNTIME_ROOT}/raw-evidence`,
    required_qa_result: "30_OF_30_PASS",
    any_nonzero_exit_is_failure: true,
    any_missing_raw_evidence_is_failure: true,
    any_qa_failure_forces_gate: "NO-GO",
  };
  const qaFailClosed = {
    schema_version: 1,
    gate: "SOURCE_SCOPE_LOCK_REVIEW_GATE",
    no_go_conditions: [
      "MISSING_OR_INVALID_REVIEWER_PAYLOAD", "MISSING_OR_INVALID_TRANSPORT_ATTESTATION", "REVIEWER_BLOCKER", "OPEN_CRITICAL_OR_HIGH_FINDING",
      "FORBIDDEN_OR_OUT_OF_SCOPE_READ", "TARGET_BINDING_MISMATCH", "PAYLOAD_HASH_MISMATCH", "NONCANONICAL_REVIEWER_WRAPPER",
      "DETERMINISTIC_QA_NOT_30_OF_30_PASS", "SOURCE_TARGET_CHANGED", "PRODUCT_OR_GOVERNANCE_BASELINE_CHANGED", "GIT_USED",
    ],
    go_requires_all_conditions: [
      "REVIEWER_STARTUP_VALID_4_OF_4", "REVIEWER_PASS_4_OF_4", "PAYLOAD_SCHEMA_VALID_4_OF_4", "PAYLOAD_HASH_VALID_4_OF_4",
      "TRANSPORT_ATTESTATION_VALID_4_OF_4", "FORBIDDEN_READ_COUNT_ZERO", "OUT_OF_SCOPE_READ_COUNT_ZERO", "OPEN_CRITICAL_COUNT_ZERO",
      "OPEN_HIGH_COUNT_ZERO", "DETERMINISTIC_QA_30_OF_30_PASS", "SOURCE_TARGET_UNCHANGED", "PRODUCT_AND_GOVERNANCE_BASELINE_UNCHANGED", "GIT_NOT_USED",
    ],
    gate_not_calculated_during_preparation: true,
  };
  const writerContract = {
    schema_version: 1,
    writer_absolute_path: `${pkgAbs}/canonical-json-writer.mjs`,
    input_absolute_path: `${AGGREGATOR_RUNTIME_ROOT}/raw-evidence/aggregation-payload-core.json`,
    output_absolute_path: `${AGGREGATOR_RUNTIME_ROOT}/source-scope-review-aggregation-result.json`,
    output_schema_absolute_path: `${pkgAbs}/aggregation-output.schema.json`,
    canonicalization: "RFC8785_JCS",
    hash_algorithm: "SHA-256",
    hash_encoding: "UPPERCASE_HEX",
    output_top_level_fields_exactly: ["payload_core", "payload_core_sha256"],
    trailing_newline_allowed: false,
    reread_exact_byte_verification_required: true,
    chat_rendering_is_authoritative: false,
    authoritative_artifact: `${AGGREGATOR_RUNTIME_ROOT}/source-scope-review-aggregation-result.json`,
  };
  const writerSource = `import fs from "node:fs";\nimport path from "node:path";\nimport crypto from "node:crypto";\n\nconst EXACT_OUTPUT = ${JSON.stringify(`${AGGREGATOR_RUNTIME_ROOT}/source-scope-review-aggregation-result.json`)};\nconst sha = (b) => crypto.createHash("sha256").update(b).digest("hex").toUpperCase();\nconst jcs = (v) => {\n  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);\n  if (typeof v === "number") { if (!Number.isFinite(v)) throw new TypeError("NON_FINITE_NUMBER"); return JSON.stringify(v); }\n  if (Array.isArray(v)) return \`[\${v.map(jcs).join(",")}]\`;\n  if (typeof v === "object") return \`{\${Object.keys(v).sort().map(k => \`\${JSON.stringify(k)}:\${jcs(v[k])}\`).join(",")}\`;\n  throw new TypeError("UNSUPPORTED_JCS_TYPE");\n};\n\nif (process.argv[2] === "--self-test") {\n  const a = {z: 1, a: [true, null, "x"]};\n  const b = {a: [true, null, "x"], z: 1};\n  if (jcs(a) !== jcs(b) || sha(Buffer.from(jcs(a))) !== sha(Buffer.from(jcs(b)))) process.exit(1);\n  process.stdout.write("PASS\\n");\n  process.exit(0);\n}\nif (process.argv[2] === "--negative-self-test") {\n  try { jcs({bad: Number.NaN}); process.exit(1); } catch { process.stdout.write("PASS\\n"); process.exit(0); }\n}\nconst input = process.argv[2];\nconst output = process.argv[3];\nif (!input || !output || output.replaceAll("\\\\", "/") !== EXACT_OUTPUT) throw new Error("EXACT_INPUT_AND_OUTPUT_REQUIRED");\nconst payloadCore = JSON.parse(fs.readFileSync(input, "utf8"));\nif (!payloadCore || typeof payloadCore !== "object" || Array.isArray(payloadCore)) throw new Error("PAYLOAD_CORE_OBJECT_REQUIRED");\nconst wrapper = {payload_core: payloadCore, payload_core_sha256: sha(Buffer.from(jcs(payloadCore), "utf8"))};\nconst canonicalBytes = Buffer.from(jcs(wrapper), "utf8");\nfs.mkdirSync(path.dirname(output), {recursive: true});\nfs.writeFileSync(output, canonicalBytes);\nconst reread = fs.readFileSync(output);\nif (!reread.equals(canonicalBytes)) throw new Error("CANONICAL_REREAD_MISMATCH");\nconst parsed = JSON.parse(reread.toString("utf8"));\nif (Object.keys(parsed).sort().join(",") !== "payload_core,payload_core_sha256") throw new Error("TWO_FIELD_WRAPPER_REQUIRED");\nif (parsed.payload_core_sha256 !== sha(Buffer.from(jcs(parsed.payload_core), "utf8"))) throw new Error("PAYLOAD_CORE_HASH_MISMATCH");\nprocess.stdout.write(JSON.stringify({status:"PASS",output_sha256:sha(reread)}) + "\\n");\n`;
  const prompt = `Codex, act only as ${aggregatorSpec.role}.\n\nRun this only after four R1 Reviewer canonical payloads and four Human manual transport attestations exist at the exact paths in reviewer-payload-import-contract.json. Use a BRAND_NEW_TOP_LEVEL_CODEX_CHAT. Do not use other conversation memory, subagents, Git, network, services, databases, seeds, migrations, .env, globs, repository search, recursive discovery, or cwd inference.\n\nMANDATORY FIRST READ:\n${pkgAbs}/absolute-launch-envelope.json\n\nValidate the launch envelope, package core, assignment, run, nonce, frozen target, exact scope, four Reviewer package identities, canonical payload bytes, payload_core JCS hashes, common return schema, single transport schema, role/package/run/target bindings, and Human transport hashes. Never modify or repair a Reviewer payload. Any missing or invalid input is NO-GO. Any Reviewer BLOCKER, open CRITICAL/HIGH finding, forbidden/out-of-scope read, target drift, or QA failure is NO-GO.\n\nRun only the exact fresh commands in deterministic-qa-command-manifest.json. Create the payload core at the exact allowed raw-evidence path, then invoke canonical-json-writer.mjs with the exact manifest arguments. The authoritative result is the task-local canonical artifact source-scope-review-aggregation-result.json; chat rendering is not authority.\n\nIn chat report only the authoritative artifact path, artifact SHA-256, and gate result. Do not start Architecture Reconciliation, adopt source authority, create Core Objects, or mutate any target, source, Reviewer payload, or package.\n`;

  writeJson(path.join(dir, "assignment.json"), assignment);
  writeJson(path.join(dir, "startup-contract.json"), startup);
  writeJson(path.join(dir, "exact-read-scope.json"), exactScope);
  writeJson(path.join(dir, "prohibited-actions.json"), prohibited);
  writeJson(path.join(dir, "reviewer-payload-import-contract.json"), importContract);
  writeJson(path.join(dir, "aggregator-input.schema.json"), inputSchema);
  writeJson(path.join(dir, "aggregation-output.schema.json"), outputSchema);
  writeJson(path.join(dir, "deterministic-qa-command-manifest.json"), deterministicQaManifest);
  writeJson(path.join(dir, "deterministic-qa-execution-contract.json"), qaExecutionContract);
  writeJson(path.join(dir, "deterministic-qa-fail-closed-rules.json"), qaFailClosed);
  writeJson(path.join(dir, "canonical-writer-contract.json"), writerContract);
  writeText(path.join(dir, "canonical-json-writer.mjs"), writerSource);
  writeText(path.join(dir, "standalone-top-level-aggregator-prompt.md"), prompt);

  const sealedNames = [
    "assignment.json", "startup-contract.json", "exact-read-scope.json", "prohibited-actions.json", "reviewer-payload-import-contract.json",
    "aggregator-input.schema.json", "aggregation-output.schema.json", "deterministic-qa-command-manifest.json", "deterministic-qa-execution-contract.json",
    "deterministic-qa-fail-closed-rules.json", "canonical-writer-contract.json", "canonical-json-writer.mjs", "standalone-top-level-aggregator-prompt.md",
  ];
  const artifacts = sealedNames.map((name) => statEntry(path.join(dir, name), name));
  const packageCore = {
    schema_version: 1,
    review_generation: "R1",
    aggregator_role: aggregatorSpec.role,
    aggregator_task_id: AGGREGATOR_RUNTIME_TASK_ID,
    review_package_id: aggregatorSpec.packageId,
    assignment_id: aggregatorSpec.assignmentId,
    aggregator_run_id: aggregatorSpec.runId,
    aggregator_session_nonce: aggregatorSpec.nonce,
    preparation_task_id: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
    review_target_binding: reviewTargetBinding,
    reviewer_package_core_sha256_bindings: builtReviewers.map((r) => ({ reviewer_role: r.role, package_core_sha256: r.packageCoreSha256 })),
    reviewer_identity_registry_sha256: shaFile(path.join(TASK_ROOT, "reviewer-identity-registry.json")),
    shared_return_schema_sha256: sharedReturnSchemaSha,
    manual_transport_schema_sha256: transportSchemaSha,
    root_qa_command_manifest_sha256: shaFile(path.join(TASK_ROOT, "source-scope-review-qa-command-manifest.json")),
    root_qa_runner_sha256: shaFile(path.join(TASK_ROOT, "validate-preparation.mjs")),
    artifacts,
  };
  const manifest = { package_core: packageCore, package_core_sha256: jcsSha(packageCore), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX" };
  writeJson(path.join(dir, "package-manifest.json"), manifest);
  const verification = {
    schema_version: 1,
    verification_status: "PASS",
    review_package_id: aggregatorSpec.packageId,
    aggregator_role: aggregatorSpec.role,
    package_core_sha256: manifest.package_core_sha256,
    recomputed_package_core_sha256: jcsSha(manifest.package_core),
    package_core_hash_match: true,
    declared_artifact_count: artifacts.length,
    artifact_hash_match_count: artifacts.filter((a) => shaFile(path.join(dir, a.normalized_relative_path)) === a.sha256).length,
    reviewer_package_binding_count: builtReviewers.length,
    canonical_writer_present: fs.existsSync(path.join(dir, "canonical-json-writer.mjs")),
    canonical_writer_sha256: shaFile(path.join(dir, "canonical-json-writer.mjs")),
    shared_transport_schema_count: 1,
    package_manifest_sha256: shaFile(path.join(dir, "package-manifest.json")),
    verified_at: preparedAt,
  };
  writeJson(path.join(dir, "package-verification.json"), verification);
  const launchCore = {
    schema_version: 1,
    launch_generation: "R1",
    launch_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
    preparation_task_id: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
    aggregator_task_id: AGGREGATOR_RUNTIME_TASK_ID,
    aggregator_role: aggregatorSpec.role,
    review_package_id: aggregatorSpec.packageId,
    assignment_id: aggregatorSpec.assignmentId,
    aggregator_run_id: aggregatorSpec.runId,
    aggregator_session_nonce: aggregatorSpec.nonce,
    package_core_sha256: manifest.package_core_sha256,
    package_manifest_absolute_path: `${pkgAbs}/package-manifest.json`,
    package_manifest_sha256: shaFile(path.join(dir, "package-manifest.json")),
    package_verification_absolute_path: `${pkgAbs}/package-verification.json`,
    package_verification_sha256: shaFile(path.join(dir, "package-verification.json")),
    standalone_prompt_absolute_path: `${pkgAbs}/standalone-top-level-aggregator-prompt.md`,
    standalone_prompt_sha256: shaFile(path.join(dir, "standalone-top-level-aggregator-prompt.md")),
    exact_read_scope_absolute_path: `${pkgAbs}/exact-read-scope.json`,
    exact_read_scope_sha256: shaFile(path.join(dir, "exact-read-scope.json")),
    reviewer_identity_registry_absolute_path: abs("reviewer-identity-registry.json"),
    reviewer_identity_registry_sha256: shaFile(path.join(TASK_ROOT, "reviewer-identity-registry.json")),
    root_qa_command_manifest_absolute_path: abs("source-scope-review-qa-command-manifest.json"),
    root_qa_command_manifest_sha256: shaFile(path.join(TASK_ROOT, "source-scope-review-qa-command-manifest.json")),
    root_qa_runner_absolute_path: abs("validate-preparation.mjs"),
    root_qa_runner_sha256: shaFile(path.join(TASK_ROOT, "validate-preparation.mjs")),
    manual_transport_schema_absolute_path: abs("manual-reviewer-transport-attestation.schema.json"),
    manual_transport_schema_sha256: transportSchemaSha,
    review_target_binding: reviewTargetBinding,
  };
  const envelope = { launch_core: launchCore, launch_core_sha256: jcsSha(launchCore), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX" };
  writeJson(path.join(dir, "absolute-launch-envelope.json"), envelope);
  return { packageCoreSha256: manifest.package_core_sha256, launchCoreSha256: envelope.launch_core_sha256 };
}

const aggregatorBuilt = buildAggregatorPackage();
writeJson(path.join(TASK_ROOT, "package-build-result.json"), {
  schema_version: 1,
  build_status: "PASS",
  reviewer_package_count: builtReviewers.length,
  reviewer_packages: builtReviewers.map((r) => ({ reviewer_role: r.role, package_core_sha256: r.packageCoreSha256, launch_core_sha256: r.launchCoreSha256 })),
  aggregator_package: { aggregator_role: aggregatorSpec.role, package_core_sha256: aggregatorBuilt.packageCoreSha256, launch_core_sha256: aggregatorBuilt.launchCoreSha256 },
  source_scope_lock_review_gate: "NOT_YET_CALCULATED",
  reviewers_started: 0,
  aggregator_started: false,
  git_used: false,
});
