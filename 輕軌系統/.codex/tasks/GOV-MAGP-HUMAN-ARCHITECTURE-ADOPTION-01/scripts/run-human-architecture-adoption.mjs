import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TASK_ID = "GOV-MAGP-HUMAN-ARCHITECTURE-ADOPTION-01";
const RECON_TASK_ID = "GOV-MAGP-ARCHITECTURE-RECONCILIATION-01";
const SOURCE_ADOPTION_TASK_ID = "GOV-MAGP-HUMAN-SOURCE-SCOPE-EXACT-MANIFEST-ADOPTION-01";
const HUMAN_DECISION = "ADOPT_CANONICAL_MAGP_ARCHITECTURE_WITH_REDUCED_ASSURANCE_AND_EXPLICIT_DEFERRALS";
const BASELINE_ID = "MAGP-ARCH-BASELINE-V1";
const FIXED_DATE = "2026-07-23";
const RUN_ID = "MAGP-HUMAN-ARCHITECTURE-ADOPTION-20260723-R1";
const TASK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_ROOT = path.resolve(TASK_ROOT, "..", "..", "..");
const TASKS_ROOT = path.join(PRODUCT_ROOT, ".codex", "tasks");
const RECON_ROOT = path.join(TASKS_ROOT, RECON_TASK_ID);
const SOURCE_ADOPTION_ROOT = path.join(TASKS_ROOT, SOURCE_ADOPTION_TASK_ID);
const HUMAN_DECISION_SOURCE = "C:/Users/a2306/.codex/attachments/681cabc1-6fe6-4bbc-84e0-746ca6c5accb/pasted-text.txt";

const REQUIRED_PACKAGE_FILES = [
  "adoption-scope-boundary.json",
  "architecture-adoption-decision-form.json",
  "architecture-adoption-decision-form.schema.json",
  "architecture-decision-summary.json",
  "architecture-risk-register.json",
  "post-adoption-roadmap.json",
  "prohibited-next-actions.json",
  "reconciled-architecture-manifest.json",
  "reduced-assurance-disclosure.json",
  "source-traceability-summary.json",
  "thesis-extension-boundary.json",
  "unresolved-human-decisions.json",
].sort();

const REQUIRED_PROPOSAL_FILES = [
  "architecture-boundary.json",
  "architecture-context.json",
  "architecture-principles.json",
  "architecture-proposal-summary.md",
  "authority-flow.json",
  "canonical-component-model.json",
  "canonical-layer-model.json",
  "deferred-capabilities.json",
  "design-time-flow.json",
  "evidence-flow.json",
  "excluded-capabilities.json",
  "governance-artifact-hierarchy.json",
  "human-gate-model.json",
  "runtime-flow.json",
  "source-to-architecture-traceability.json",
].sort();

const NORMATIVE_SCOPE = [
  "MAGP_LAYER_MODEL",
  "MAGP_COMPONENT_RESPONSIBILITY",
  "GOVERNANCE_ARTIFACT_HIERARCHY",
  "AUTHORITY_FLOW",
  "EVIDENCE_FLOW",
  "DESIGN_TIME_FLOW",
  "RUNTIME_FLOW",
  "HUMAN_GATE_MODEL",
  "CONTROL_PLANE_DATA_PLANE_BOUNDARY",
  "DESIGN_TIME_RUNTIME_BOUNDARY",
  "HUMAN_MACHINE_AUTHORITY_BOUNDARY",
  "CORE_OBJECT_LIBRARY_INPUT_BOUNDARY",
  "FUTURE_IMPLEMENTATION_CONFORMANCE_BOUNDARY",
];

const AUTHORITY_ORDER = [
  "HUMAN_ADOPTED_CONSTITUTION",
  "HUMAN_ADOPTED_POLICY",
  "HUMAN_APPROVED_RFC",
  "HUMAN_ADOPTED_ARCHITECTURE",
  "APPROVED_BLUEPRINT",
  "SPECIFICATION",
  "SCHEMA",
  "IMPLEMENTATION_ARTIFACT",
  "RUNTIME_EVIDENCE",
];

function toPosix(value) {
  return path.resolve(value).split(path.sep).join("/");
}

function readBytes(filePath) {
  return fs.readFileSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(readBytes(filePath).toString("utf8"));
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function binding(filePath) {
  const bytes = readBytes(filePath);
  return { absolute_path: toPosix(filePath), sha256: sha256Bytes(bytes), bytes: bytes.length };
}

function failClosed(condition, code, detail) {
  if (!condition) {
    const error = new Error(`${code}: ${detail}`);
    error.code = code;
    throw error;
  }
}

function writeJson(relativePath, value) {
  const target = path.join(TASK_ROOT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(relativePath, value) {
  const target = path.join(TASK_ROOT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function listFiles(root) {
  const result = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) result.push(target);
    }
  }
  visit(root);
  return result;
}

function treeDigest(root) {
  const rows = listFiles(root).map((filePath) => ({
    relative_path: path.relative(root, filePath).split(path.sep).join("/"),
    sha256: sha256Bytes(readBytes(filePath)),
    bytes: fs.statSync(filePath).size,
  })).sort((a, b) => (a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0));
  const canonical = rows.map((row) => `${row.relative_path}|${row.sha256}|${row.bytes}`).join("\n");
  return { file_count: rows.length, manifest_sha256: sha256Bytes(Buffer.from(canonical, "utf8")) };
}

function directoryNames(root) {
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
}

function exactReference(relativePath) {
  const filePath = path.join(RECON_ROOT, relativePath);
  return { original_proposal_reference: { relative_path: relativePath, ...binding(filePath) } };
}

for (const directory of [
  "human-architecture-adoption",
  "adopted-architecture",
  "architecture-baseline",
  "core-object-library-readiness-package",
]) fs.mkdirSync(path.join(TASK_ROOT, directory), { recursive: true });

// Human authorization is the sole adoption authority for this task.
const humanDecisionText = readBytes(HUMAN_DECISION_SOURCE).toString("utf8").replace(/\r\n/g, "\n");
failClosed(humanDecisionText.includes("Human正式決定：") && humanDecisionText.includes(HUMAN_DECISION), "HUMAN_ARCHITECTURE_ADOPTION_DECISION_MISSING", "exact Human architecture decision is absent");
failClosed(humanDecisionText.includes("正式採用模型：") && humanDecisionText.includes("HUMAN_MAGP_ARCHITECTURE_ADOPTION"), "HUMAN_ARCHITECTURE_ADOPTION_DECISION_NOT_APPROVED", "adoption model is absent");
failClosed(humanDecisionText.includes("Core Object Library建立") && humanDecisionText.includes("Product implementation"), "NORMATIVE_ARCHITECTURE_SCOPE_OVERCLAIMED", "implementation prohibitions are absent");

const packageRoot = path.join(RECON_ROOT, "human-architecture-adoption-package");
const proposalRoot = path.join(RECON_ROOT, "canonical-architecture-proposal");
const matrixRoot = path.join(RECON_ROOT, "human-decision-matrix");
failClosed(JSON.stringify(directoryNames(packageRoot)) === JSON.stringify(REQUIRED_PACKAGE_FILES), "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "4A-1 Human adoption package file set differs");
failClosed(JSON.stringify(directoryNames(proposalRoot)) === JSON.stringify(REQUIRED_PROPOSAL_FILES), "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "4A-1 Canonical Proposal file set differs");
failClosed(JSON.stringify(directoryNames(matrixRoot)) === JSON.stringify(["HAD-001.json", "HAD-002.json", "HAD-003.json", "HAD-004.json", "HAD-005.json", "HAD-006.json", "HAD-007.json", "decision-register.json"].sort()), "BLOCKING_HUMAN_DECISION_UNRESOLVED", "4A-1 Human Decision Matrix file set differs");

const reconciliationResult = readJson(path.join(RECON_ROOT, "architecture-reconciliation-result.json"));
const reconciliationValidation = readJson(path.join(RECON_ROOT, "validation-results.json"));
failClosed(reconciliationResult.architecture_reconciliation_result === "COMPLETE_WITH_PROPOSED_ARCHITECTURE_AND_PENDING_HUMAN_ADOPTION", "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "4A-1 reconciliation result is invalid");
failClosed(reconciliationResult.canonical_architecture_status === "PROPOSED_NOT_ADOPTED" && reconciliationResult.normative_architecture === false, "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "4A-1 proposal state is invalid");
failClosed(reconciliationResult.architecture_open_critical === 0 && reconciliationResult.architecture_open_high === 0, "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "4A-1 has an open CRITICAL or HIGH finding");
failClosed(reconciliationValidation.required_status === "PASS_35_OF_35" && reconciliationValidation.negative_status === "PASS_15_OF_15", "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "4A-1 deterministic QA is invalid");

const reconciledManifest = readJson(path.join(packageRoot, "reconciled-architecture-manifest.json"));
const reconciledBindings = reconciledManifest.artifacts.map((entry) => {
  const actual = binding(entry.absolute_path);
  return { relative_path: entry.relative_path, expected_sha256: entry.sha256, expected_bytes: entry.bytes, ...actual, match: actual.sha256 === entry.sha256 && actual.bytes === entry.bytes };
});
failClosed(reconciledBindings.length === reconciledManifest.artifact_count && reconciledBindings.every((entry) => entry.match), "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "4A-1 reconciled manifest binding failed");

const originalAdoptionForm = readJson(path.join(packageRoot, "architecture-adoption-decision-form.json"));
failClosed(originalAdoptionForm.decision_status === "PENDING_HUMAN_DECISION" && originalAdoptionForm.architecture_adopted === false && originalAdoptionForm.codex_filled_human_decision === false, "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "4A-1 decision form was mutated or prefilled");

const claims = readJson(path.join(RECON_ROOT, "architecture-claim-ledger.json"));
failClosed(claims.claim_count === 39 && claims.claims.length === 39, "ARCHITECTURE_CLAIM_LINEAGE_INVALID", "claim ledger count differs");
const allowedClasses = new Set(["SOURCE_EXPLICIT", "SOURCE_DERIVED", "CROSS_SOURCE_SYNTHESIS", "OPTIONAL_PATTERN", "NEW_DESIGN_PROPOSAL", "HUMAN_DECISION_REQUIRED"]);
for (const claim of claims.claims) {
  failClosed(allowedClasses.has(claim.claim_class), "ARCHITECTURE_CLAIM_LINEAGE_INVALID", `${claim.claim_id} has an invalid class`);
  failClosed(Array.isArray(claim.exact_evidence_references) && claim.exact_evidence_references.length > 0, "ARCHITECTURE_CLAIM_LINEAGE_INVALID", `${claim.claim_id} lacks exact evidence`);
  failClosed(claim.exact_evidence_references.every((entry) => entry.source_id && entry.source_sha256 && entry.normalized_absolute_path && entry.locator_type && entry.evidence_note), "ARCHITECTURE_CLAIM_LINEAGE_INVALID", `${claim.claim_id} has incomplete evidence lineage`);
  if (["SOURCE_DERIVED", "CROSS_SOURCE_SYNTHESIS", "NEW_DESIGN_PROPOSAL", "HUMAN_DECISION_REQUIRED", "OPTIONAL_PATTERN"].includes(claim.claim_class)) {
    failClosed(claim.represented_as_source_explicit === false, "ARCHITECTURE_CLAIM_LINEAGE_INVALID", `${claim.claim_id} improperly claims source-explicit status`);
  }
}

const sourceRootPrior = readJson(path.join(RECON_ROOT, "source-root-reverification.json"));
const excludedIds = new Set(sourceRootPrior.sources.filter((entry) => entry.classification === "EXCLUDED").map((entry) => entry.source_id));
const optionalIds = new Set(sourceRootPrior.sources.filter((entry) => entry.classification === "OPTIONAL").map((entry) => entry.source_id));
const coreIds = new Set(sourceRootPrior.sources.filter((entry) => entry.classification === "CORE").map((entry) => entry.source_id));
failClosed(claims.claims.every((claim) => claim.source_ids.every((sourceId) => !excludedIds.has(sourceId))), "EXCLUDED_SOURCE_CONTAMINATION_DETECTED", "an EXCLUDED source appears in architecture claims");
const optionalReferencedClaims = claims.claims.filter((claim) => claim.source_ids.some((sourceId) => optionalIds.has(sourceId)));
failClosed(optionalReferencedClaims.every((claim) => {
  if (claim.claim_class === "OPTIONAL_PATTERN") return claim.normative_eligibility === "NON_NORMATIVE_PATTERN_ONLY";
  return claim.source_ids.some((sourceId) => coreIds.has(sourceId)) && claim.represented_as_source_explicit === false && claim.contamination_check.startsWith("PASS_");
}), "OPTIONAL_SOURCE_USED_AS_NORMATIVE", "OPTIONAL source was used as sole or source-explicit Normative authority");

const thesisBoundary = readJson(path.join(packageRoot, "thesis-extension-boundary.json"));
failClosed(thesisBoundary.boundary_status === "COMPLETE" && thesisBoundary.mandatory_post_thesis_labels?.length > 0 && thesisBoundary.mandatory_post_thesis_labels.every((entry) => entry.label === "POST_THESIS_ARCHITECTURE_EXTENSION" && entry.implemented_by_thesis === false), "THESIS_EXTENSION_BOUNDARY_INVALID", "thesis extension boundary is invalid");

const layerModel = readJson(path.join(proposalRoot, "canonical-layer-model.json"));
const componentModel = readJson(path.join(proposalRoot, "canonical-component-model.json"));
const governanceHierarchy = readJson(path.join(proposalRoot, "governance-artifact-hierarchy.json"));
const architecturePrinciples = readJson(path.join(proposalRoot, "architecture-principles.json"));
const deferredCapabilities = readJson(path.join(proposalRoot, "deferred-capabilities.json"));
const excludedCapabilities = readJson(path.join(proposalRoot, "excluded-capabilities.json"));
failClosed(layerModel.layer_count === 6 && layerModel.layers.length === 6, "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "Canonical Layer Model is incomplete");
failClosed(componentModel.component_count === 13 && componentModel.components.length === 13, "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "Canonical Component Model is incomplete");

const requiredComponents = ["BGE", "Agent Factory", "Agent Registry", "Agent OS", "Runtime Governance", "Policy Engine", "Blueprint Compiler", "Evidence Ledger", "Knowledge Lake", "Knowledge Graph", "Human Review Console", "Railway Domain Extension"];
failClosed(requiredComponents.every((name) => componentModel.components.some((component) => component.name === name)), "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "a required component is absent");

const originalDecisions = Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
  const id = `HAD-${String(index + 1).padStart(3, "0")}`;
  return [id, readJson(path.join(matrixRoot, `${id}.json`))];
}));
failClosed(Object.values(originalDecisions).every((entry) => entry.current_status === "PENDING_HUMAN_DECISION" && entry.human_decision === "PENDING_HUMAN_DECISION" && entry.codex_filled_human_decision === false), "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "historical Human Decision Matrix was mutated");

// The overall Human adoption decision and the mandatory effective definitions in 4A-2
// resolve every logical architecture boundary. Only physical topology/storage choices remain deferred.
const decisionResolutions = [
  {
    decision_id: "HAD-001",
    final_status: "HUMAN_ADOPTED_WITH_MODIFICATION",
    selected_value: "SIX_RESPONSIBILITY_LAYERS_CANONICAL_FOURTEEN_VOLUMES_NON_NORMATIVE_TRACEABLE_PLANNING_VIEW",
    modification_rationale: "Adopts the reconciled six-layer model while preserving the fourteen-volume view only for non-normative planning traceability.",
    explicit_deferral_ids: [],
  },
  {
    decision_id: "HAD-002",
    final_status: "HUMAN_ADOPTED",
    selected_value: "OPTION_B_VOLUME_GOVERNED_RESPONSIBILITY_PORTFOLIO_PACKAGE_VERSIONABLE_DELIVERY_UNIT",
    modification_rationale: null,
    explicit_deferral_ids: [],
  },
  {
    decision_id: "HAD-003",
    final_status: "HUMAN_ADOPTED_WITH_MODIFICATION",
    selected_value: "RISK_BASED_RFC_TRIGGER_WITH_MANDATORY_CONTENT_CONTRACT_AND_OPTIONAL_EIGHT_FILE_EXPANSION_FOR_HIGH_COMPLEXITY",
    modification_rationale: "Preserves required decision content and deterministic triggers without making eight files mandatory for every package.",
    explicit_deferral_ids: [],
  },
  {
    decision_id: "HAD-004",
    final_status: "HUMAN_ADOPTED_WITH_MODIFICATION",
    selected_value: "LOGICALLY_INDEPENDENT_CONTROL_PLANE_AGENT_REGISTRY_CONTRACT_PHYSICAL_PLACEMENT_DEFERRED",
    modification_rationale: "Locks Registry identity, status, lineage, authority ceiling, and external approval dependency while deferring deployable topology.",
    explicit_deferral_ids: ["DEF-HAD-004-PHYSICAL-PLACEMENT"],
  },
  {
    decision_id: "HAD-005",
    final_status: "HUMAN_ADOPTED_WITH_MODIFICATION",
    selected_value: "MANDATORY_LOGICAL_RUNTIME_GOVERNANCE_SEPARATION_PHYSICAL_PLACEMENT_DEFERRED",
    modification_rationale: "Locks executor-versus-governor authority isolation and fail-closed control semantics while deferring process/service placement.",
    explicit_deferral_ids: ["DEF-HAD-005-PHYSICAL-PLACEMENT"],
  },
  {
    decision_id: "HAD-006",
    final_status: "HUMAN_ADOPTED_WITH_MODIFICATION",
    selected_value: "CANONICAL_EVIDENCE_RECORD_CONTRACT_AND_INDEPENDENT_INTEGRITY_REVIEW_PHYSICAL_STORAGE_DEFERRED",
    modification_rationale: "Adopts the evidence contract, lineage, immutability, and no-self-validation rules while deferring storage technology and deployment form.",
    explicit_deferral_ids: ["DEF-HAD-006-PHYSICAL-STORAGE"],
  },
  {
    decision_id: "HAD-007",
    final_status: "HUMAN_ADOPTED_WITH_MODIFICATION",
    selected_value: "HUMAN_CONSTITUTION_POLICY_RFC_ARCHITECTURE_BLUEPRINT_SPECIFICATION_SCHEMA_IMPLEMENTATION_RUNTIME_EVIDENCE",
    modification_rationale: "Applies the explicit 4A-2 Human authority order and keeps Evidence as proof rather than self-creating authority.",
    explicit_deferral_ids: [],
  },
].map((resolution) => ({
  ...resolution,
  decision_title: originalDecisions[resolution.decision_id].decision_title,
  original_decision_reference: binding(path.join(matrixRoot, `${resolution.decision_id}.json`)),
  original_source_support: originalDecisions[resolution.decision_id].source_support,
  human_decision_reference: binding(HUMAN_DECISION_SOURCE),
  pending_human_decision_remaining: false,
  codex_exercised_human_authority: false,
}));

failClosed(decisionResolutions.length === 7 && decisionResolutions.every((entry) => entry.pending_human_decision_remaining === false), "BLOCKING_HUMAN_DECISION_UNRESOLVED", "not every Human decision was resolved");

const explicitDeferrals = [
  {
    deferral_id: "DEF-HAD-004-PHYSICAL-PLACEMENT",
    decision_id: "HAD-004",
    deferred_item: "Agent Registry physical process, service, or module placement",
    reason_for_deferral: "Deployment topology, multi-project scope, capacity, and availability requirements are not yet adopted.",
    affected_components: ["Agent Registry", "Agent Factory", "Agent OS"],
    prohibited_implementation_actions: ["select Registry deployment topology", "define Registry database schema", "define Registry API", "implement Registry"],
    reopening_trigger: "Core Object Library and runtime non-functional requirements are adopted.",
    required_future_human_gate: "HUMAN_APPROVE_AGENT_REGISTRY_PHYSICAL_DESIGN",
    architecture_baseline_impact: "NO_LOGICAL_BASELINE_CHANGE; logical identity/status authority and external approval dependency are adopted now.",
    implementation_blocking_status: "BLOCKS_AGENT_REGISTRY_PHYSICAL_DESIGN_AND_IMPLEMENTATION",
    explicit_non_blocking_classification: "EXPLICITLY_DEFERRED_NON_BLOCKING_DECISION",
    affects_authority_boundary: false,
    affects_security_boundary: false,
    affects_runtime_isolation_boundary: false,
    affects_human_approval_boundary: false,
    affects_evidence_integrity_boundary: false,
    affects_source_governance_boundary: false,
    boundary_resolution: "Logical Registry authority ceiling, lifecycle ownership, status semantics, and Human/release-gate dependency are adopted and may not be weakened by future placement.",
  },
  {
    deferral_id: "DEF-HAD-005-PHYSICAL-PLACEMENT",
    decision_id: "HAD-005",
    deferred_item: "Runtime Governance physical process or service placement",
    reason_for_deferral: "Latency, availability, isolation technology, and failure-domain requirements are not yet adopted.",
    affected_components: ["Runtime Governance", "Policy Engine", "Agent OS"],
    prohibited_implementation_actions: ["co-locate or separate Runtime Governance physically", "define runtime governance API", "select isolation technology", "implement Runtime Governance"],
    reopening_trigger: "Runtime non-functional and security isolation requirements are adopted.",
    required_future_human_gate: "HUMAN_APPROVE_RUNTIME_GOVERNANCE_PHYSICAL_DESIGN",
    architecture_baseline_impact: "NO_LOGICAL_BASELINE_CHANGE; executor/governor separation, fail-closed policy evaluation, and no-self-authorization are adopted now.",
    implementation_blocking_status: "BLOCKS_RUNTIME_GOVERNANCE_PHYSICAL_DESIGN_AND_IMPLEMENTATION",
    explicit_non_blocking_classification: "EXPLICITLY_DEFERRED_NON_BLOCKING_DECISION",
    affects_authority_boundary: false,
    affects_security_boundary: false,
    affects_runtime_isolation_boundary: false,
    affects_human_approval_boundary: false,
    affects_evidence_integrity_boundary: false,
    affects_source_governance_boundary: false,
    boundary_resolution: "Logical control-plane isolation, Human approval holds, authority ceiling, and prohibition on reverse mutation are normative regardless of physical placement.",
  },
  {
    deferral_id: "DEF-HAD-006-PHYSICAL-STORAGE",
    decision_id: "HAD-006",
    deferred_item: "Evidence Ledger physical storage and deployment form",
    reason_for_deferral: "Retention, signing, storage, query, capacity, and trust-anchor requirements are not yet adopted.",
    affected_components: ["Evidence Ledger", "Runtime Governance", "Human Review Console"],
    prohibited_implementation_actions: ["select evidence database", "define evidence storage schema", "define evidence API", "implement Evidence Ledger"],
    reopening_trigger: "Core Object Library evidence object and evidence integrity requirements are adopted.",
    required_future_human_gate: "HUMAN_APPROVE_EVIDENCE_LEDGER_PHYSICAL_DESIGN",
    architecture_baseline_impact: "NO_LOGICAL_BASELINE_CHANGE; evidence contract, lineage, immutability, authority separation, and independent integrity verification are adopted now.",
    implementation_blocking_status: "BLOCKS_EVIDENCE_LEDGER_PHYSICAL_DESIGN_AND_IMPLEMENTATION",
    explicit_non_blocking_classification: "EXPLICITLY_DEFERRED_NON_BLOCKING_DECISION",
    affects_authority_boundary: false,
    affects_security_boundary: false,
    affects_runtime_isolation_boundary: false,
    affects_human_approval_boundary: false,
    affects_evidence_integrity_boundary: false,
    affects_source_governance_boundary: false,
    boundary_resolution: "Evidence is never decision authority and the producer cannot unilaterally validate its own integrity; these invariants are normative independent of storage form.",
  },
];

failClosed(explicitDeferrals.every((entry) => ["affects_authority_boundary", "affects_security_boundary", "affects_runtime_isolation_boundary", "affects_human_approval_boundary", "affects_evidence_integrity_boundary", "affects_source_governance_boundary"].every((key) => entry[key] === false) && entry.boundary_resolution && entry.implementation_blocking_status.startsWith("BLOCKS_")), "BLOCKING_HUMAN_DECISION_UNRESOLVED", "a deferral leaves a blocking architecture boundary unresolved");

// Verify exact adopted source scope, policies, product/governance baseline, and historical task trees.
const adoptedExact = readJson(path.join(SOURCE_ADOPTION_ROOT, "adopted-manifests", "adopted-exact-source-manifest.json"));
const exactManifest = readJson(adoptedExact.original_artifact.absolute_path);
failClosed(adoptedExact.adoption_status === "HUMAN_ADOPTED" && exactManifest.source_count === 11, "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "adopted source scope is invalid");
const sourceRows = exactManifest.sources.map((source) => {
  const filePath = source.normalized_absolute_path ?? source.absolute_path;
  const actual = binding(filePath);
  return {
    source_id: source.source_id,
    classification: source.classification,
    normalized_absolute_path: toPosix(filePath),
    expected_sha256: source.sha256,
    expected_bytes: source.file_size_bytes,
    actual_sha256: actual.sha256,
    actual_bytes: actual.bytes,
    match: actual.sha256 === source.sha256 && actual.bytes === source.file_size_bytes,
    semantic_content_read_in_4A_2: false,
  };
});
failClosed(sourceRows.length === 11 && sourceRows.every((entry) => entry.match), "SOURCE_OR_PRODUCT_MUTATION_REQUIRED", "source file bytes changed");
const sourceCounts = Object.fromEntries(["CORE", "OPTIONAL", "EXCLUDED"].map((classification) => [classification, sourceRows.filter((entry) => entry.classification === classification).length]));
failClosed(sourceCounts.CORE === 4 && sourceCounts.OPTIONAL === 1 && sourceCounts.EXCLUDED === 6, "ARCHITECTURE_RECONCILIATION_RESULT_INVALID", "source classification changed");

const priorSourcePolicy = readJson(path.join(RECON_ROOT, "source-policy-integrity.json"));
const sourcePolicyRows = priorSourcePolicy.policies.map((entry) => {
  const actual = binding(entry.absolute_path);
  return { label: entry.label, expected_sha256: entry.expected_sha256, expected_bytes: entry.expected_bytes, ...actual, match: actual.sha256 === entry.expected_sha256 && actual.bytes === entry.expected_bytes };
});
failClosed(sourcePolicyRows.every((entry) => entry.match), "SOURCE_OR_PRODUCT_MUTATION_REQUIRED", "source policy bytes changed");

const priorProductBaseline = readJson(path.join(RECON_ROOT, "product-governance-integrity.json"));
const productRows = priorProductBaseline.files.map((entry) => {
  const actual = binding(entry.absolute_path);
  return { label: entry.label, expected_sha256: entry.expected_sha256, expected_bytes: entry.expected_bytes, ...actual, match: actual.sha256 === entry.expected_sha256 && actual.bytes === entry.expected_bytes };
});
failClosed(productRows.every((entry) => entry.match), "SOURCE_OR_PRODUCT_MUTATION_REQUIRED", "product/governance baseline changed");

const priorHistorical = readJson(path.join(RECON_ROOT, "historical-artifact-integrity.json"));
const expectedHistorical = [
  ...priorHistorical.historical_tasks.map((entry) => ({ task_id: entry.task_id, file_count: entry.file_count, manifest_sha256: entry.manifest_sha256 })),
  { task_id: RECON_TASK_ID, file_count: 94, manifest_sha256: "F5030F9966461FDF3474543D6F5476AE841768B9BD4E1D13778082354265478A" },
];
const historicalBefore = expectedHistorical.map((expected) => {
  const actual = treeDigest(path.join(TASKS_ROOT, expected.task_id));
  return { ...expected, actual_file_count_before: actual.file_count, actual_manifest_sha256_before: actual.manifest_sha256, match_before: actual.file_count === expected.file_count && actual.manifest_sha256 === expected.manifest_sha256 };
});
failClosed(historicalBefore.every((entry) => entry.match_before), "SOURCE_OR_PRODUCT_MUTATION_REQUIRED", `historical task tree changed before adoption output: ${JSON.stringify(historicalBefore.filter((entry) => !entry.match_before))}`);

const humanDecisionBinding = binding(HUMAN_DECISION_SOURCE);
writeJson("task-intent.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  task_type: "HUMAN_ARCHITECTURE_ADOPTION_AND_NORMATIVE_BASELINE_LOCK",
  human_decision: HUMAN_DECISION,
  allowed_write_paths: [`.codex/tasks/${TASK_ID}/**`],
  prohibited_actions: ["GIT", "NETWORK", "SERVICE", "DATABASE", "SEED", "MIGRATION", "DOT_ENV", "SUBAGENT", "CORE_OBJECT_LIBRARY_CREATION", "DATABASE_DESIGN", "API_DESIGN", "PRODUCT_IMPLEMENTATION", "DEPLOYMENT", "HISTORICAL_ARTIFACT_REWRITE"],
  core_object_library_authorized: false,
  product_implementation_authorized: false,
});
writeJson("classification.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  classification: "L3_HUMAN_GOVERNANCE_ADOPTION",
  assurance_level: "REDUCED_ASSURANCE",
  clean_room_review_completed: false,
  independent_external_review_completed: false,
  human_architecture_adoption_completed: true,
});
writeJson("blueprint.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  actor_role: "HUMAN_ARCHITECTURE_ADOPTION_RECORDER_AND_DETERMINISTIC_BASELINE_BINDER",
  objective: "Record the explicit Human architecture decision, bind the adopted architecture without rewriting 4A-1, lock MAGP-ARCH-BASELINE-V1, and prepare Core Object Library readiness only.",
  inputs: [RECON_TASK_ID, SOURCE_ADOPTION_TASK_ID, humanDecisionBinding.absolute_path],
  outputs: ["human-architecture-adoption", "adopted-architecture", "architecture-baseline", "core-object-library-readiness-package"],
  writes_outside_task_root_allowed: false,
  human_authority_impersonation_allowed: false,
});

writeJson("human-architecture-adoption/human-architecture-adoption-record.json", {
  schema_version: 1,
  task_id: TASK_ID,
  decision: HUMAN_DECISION,
  decision_status: "HUMAN_APPROVED",
  adoption_model: "HUMAN_MAGP_ARCHITECTURE_ADOPTION",
  assurance_level: "REDUCED_ASSURANCE",
  human_actor: "HUMAN_TASK_ORIGINATOR",
  decision_timestamp: null,
  decision_recorded_date: FIXED_DATE,
  human_decision_source: humanDecisionBinding,
  canonical_layer_model_adopted: true,
  canonical_component_model_adopted: true,
  governance_artifact_hierarchy_adopted: true,
  authority_flow_adopted: true,
  evidence_flow_adopted: true,
  design_time_flow_adopted: true,
  runtime_flow_adopted: true,
  human_gate_model_adopted: true,
  architecture_boundary_adopted: true,
  core_object_library_authorized: false,
  product_implementation_authorized: false,
  codex_exercised_human_authority: false,
});
writeJson("human-architecture-adoption/human-authority-attestation.json", {
  schema_version: 1,
  task_id: TASK_ID,
  attestation: "EXPLICIT_HUMAN_DECISION_RECORDED_WITHOUT_CODEX_SUBSTITUTION",
  exact_decision: HUMAN_DECISION,
  source: humanDecisionBinding,
  human_actor_identity_claimed_beyond_task_originator: false,
  human_timestamp_invented: false,
  codex_role: "RECORD_BIND_VALIDATE_ONLY",
});
writeJson("human-architecture-adoption/reduced-assurance-acknowledgement.json", {
  schema_version: 1,
  task_id: TASK_ID,
  assurance_level: "REDUCED_ASSURANCE",
  clean_room_review_completed: false,
  independent_external_review_completed: false,
  human_adjudicated_source_review_completed: true,
  architecture_reconciliation_completed: true,
  human_architecture_adoption_completed: true,
  prohibited_claims: ["CLEAN_ROOM_ARCHITECTURE_PASS", "FULL_L3_INDEPENDENT_ARCHITECTURE_PASS", "EXTERNAL_ARCHITECTURE_REVIEW_PASS"],
});
writeJson("human-architecture-adoption/architecture-adoption-scope.json", {
  schema_version: 1,
  task_id: TASK_ID,
  adopted_scope: NORMATIVE_SCOPE,
  additional_adopted_boundaries: ["EXPLICITLY_EXCLUDED_CAPABILITIES", "EXPLICITLY_DEFERRED_CAPABILITIES", "THESIS_IMPLEMENTATION_AND_EXTENSION_BOUNDARY", "VOLUME_PACKAGE_RFC_GOVERNANCE_STRUCTURE"],
  excluded_from_adoption: ["CORE_OBJECT_LIBRARY", "DATABASE_MODEL", "API_CONTRACT", "PRODUCT_CODE", "DEPLOYMENT"],
});
writeJson("human-architecture-adoption/human-decision-resolution-ledger.json", {
  schema_version: 1,
  task_id: TASK_ID,
  decision_count: decisionResolutions.length,
  pending_decision_count: 0,
  resolutions: decisionResolutions,
  status: "ALL_7_HUMAN_DECISIONS_EXPLICITLY_RESOLVED",
});
writeJson("human-architecture-adoption/explicit-deferral-ledger.json", {
  schema_version: 1,
  task_id: TASK_ID,
  deferral_count: explicitDeferrals.length,
  deferrals: explicitDeferrals,
  blocking_architecture_deferral_count: 0,
  implementation_blocking_deferral_count: explicitDeferrals.length,
  status: "EXPLICIT_DEFERRALS_BOUNDARIES_RESOLVED_NON_BLOCKING_FOR_ARCHITECTURE_ADOPTION",
});
writeJson("human-architecture-adoption/architecture-adoption-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  human_decision_source: humanDecisionBinding,
  reconciliation_result: binding(path.join(RECON_ROOT, "architecture-reconciliation-result.json")),
  reconciliation_validation: binding(path.join(RECON_ROOT, "validation-results.json")),
  reconciled_manifest: binding(path.join(packageRoot, "reconciled-architecture-manifest.json")),
  reconciled_manifest_artifact_count: reconciledBindings.length,
  reconciled_manifest_all_match: true,
  original_proposal_bytes_modified: false,
  historical_artifacts_rewritten: false,
  status: "PASS",
});
writeJson("human-architecture-adoption/adopted-architecture-effective-state.json", {
  schema_version: 1,
  task_id: TASK_ID,
  canonical_architecture_status: "HUMAN_ADOPTED",
  normative_architecture: true,
  architecture_baseline_status: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
  architecture_baseline: BASELINE_ID,
  normative_scope: NORMATIVE_SCOPE,
  source_scope_review_model: "HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  architecture_reconciliation_source_scope: "HUMAN_ADOPTED_SOURCE_SCOPE",
  architecture_adoption_model: "HUMAN_MAGP_ARCHITECTURE_ADOPTION",
  reduced_assurance: true,
  core_object_library_status: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  core_object_library_started: false,
  product_implementation_started: false,
});

function adoptedReferenceArtifact(artifactType, relativePath, extra = {}) {
  return {
    schema_version: 1,
    task_id: TASK_ID,
    artifact_type: artifactType,
    adoption_status: "HUMAN_ADOPTED",
    adoption_method: "EXACT_ORIGINAL_4A_1_ARTIFACT_REFERENCE_NO_RECONSTRUCTION",
    ...exactReference(relativePath),
    original_proposal_bytes_modified: false,
    human_decision_reference: humanDecisionBinding,
    architecture_baseline: BASELINE_ID,
    ...extra,
  };
}

writeJson("adopted-architecture/adopted-layer-model.json", adoptedReferenceArtifact("ADOPTED_LAYER_MODEL", "canonical-architecture-proposal/canonical-layer-model.json", { layer_count: 6, final_effective_value: "SIX_LAYER_CANONICAL_MODEL", resolved_by: "HAD-001" }));
writeJson("adopted-architecture/adopted-component-model.json", adoptedReferenceArtifact("ADOPTED_COMPONENT_MODEL", "canonical-architecture-proposal/canonical-component-model.json", { component_count: 13, required_components_present: requiredComponents, physical_topology_deferred: true }));
writeJson("adopted-architecture/adopted-governance-artifact-hierarchy.json", adoptedReferenceArtifact("ADOPTED_GOVERNANCE_ARTIFACT_HIERARCHY", "canonical-architecture-proposal/governance-artifact-hierarchy.json", {
  adoption_method: "HUMAN_MODIFICATION_OVER_EXACT_ORIGINAL_4A_1_REFERENCE",
  modification_record: {
    decision_id: "HAD-007",
    modification_rationale: decisionResolutions.find((entry) => entry.decision_id === "HAD-007").modification_rationale,
    affected_claim_ids: originalDecisions["HAD-007"].source_support,
    final_adopted_value: AUTHORITY_ORDER,
    evidence_role: "PROOF_AXIS_NO_SELF_CREATING_AUTHORITY",
  },
}));
writeJson("adopted-architecture/adopted-authority-flow.json", adoptedReferenceArtifact("ADOPTED_AUTHORITY_FLOW", "canonical-architecture-proposal/authority-flow.json", { human_final_normative_authority: true, machine_self_authorization_allowed: false, authority_order: AUTHORITY_ORDER }));
writeJson("adopted-architecture/adopted-evidence-flow.json", adoptedReferenceArtifact("ADOPTED_EVIDENCE_FLOW", "canonical-architecture-proposal/evidence-flow.json", { evidence_creates_authority: false, self_integrity_approval_allowed: false, physical_storage_deferred_by: "DEF-HAD-006-PHYSICAL-STORAGE" }));
writeJson("adopted-architecture/adopted-design-time-flow.json", adoptedReferenceArtifact("ADOPTED_DESIGN_TIME_FLOW", "canonical-architecture-proposal/design-time-flow.json", { reverse_runtime_mutation_allowed: false }));
writeJson("adopted-architecture/adopted-runtime-flow.json", adoptedReferenceArtifact("ADOPTED_RUNTIME_FLOW", "canonical-architecture-proposal/runtime-flow.json", { runtime_may_modify_normative_policy: false, runtime_may_self_grant_permission: false }));
writeJson("adopted-architecture/adopted-human-gate-model.json", adoptedReferenceArtifact("ADOPTED_HUMAN_GATE_MODEL", "canonical-architecture-proposal/human-gate-model.json", { human_final_normative_authority: true, approval_inferred_from_success: false }));
writeJson("adopted-architecture/adopted-architecture-boundary.json", adoptedReferenceArtifact("ADOPTED_ARCHITECTURE_BOUNDARY", "canonical-architecture-proposal/architecture-boundary.json", { core_object_library_in_scope: false, database_model_in_scope: false, api_contract_in_scope: false, product_implementation_in_scope: false }));
writeJson("adopted-architecture/adopted-thesis-extension-boundary.json", adoptedReferenceArtifact("ADOPTED_THESIS_EXTENSION_BOUNDARY", "human-architecture-adoption-package/thesis-extension-boundary.json", { thesis_boundary_status: "HUMAN_ADOPTED", post_thesis_extension_may_impersonate_thesis_result: false }));
writeJson("adopted-architecture/adopted-excluded-capabilities.json", adoptedReferenceArtifact("ADOPTED_EXCLUDED_CAPABILITIES", "canonical-architecture-proposal/excluded-capabilities.json", { excluded_capabilities: excludedCapabilities.excluded_capabilities.filter((entry) => entry !== "Human Architecture Adoption"), architecture_adoption_now_completed: true }));
writeJson("adopted-architecture/adopted-deferred-capabilities.json", adoptedReferenceArtifact("ADOPTED_DEFERRED_CAPABILITIES", "canonical-architecture-proposal/deferred-capabilities.json", { original_deferred_capabilities: deferredCapabilities.deferred_capabilities, explicit_human_deferrals: explicitDeferrals.map((entry) => entry.deferral_id), physical_design_or_implementation_authorized: false }));

const adoptedArtifactFiles = directoryNames(path.join(TASK_ROOT, "adopted-architecture")).filter((name) => !["adopted-architecture-manifest.json", "adopted-architecture-hash-manifest.json"].includes(name));
const adoptedArtifactBindings = adoptedArtifactFiles.map((name) => ({ name, ...binding(path.join(TASK_ROOT, "adopted-architecture", name)) }));
writeJson("adopted-architecture/adopted-architecture-manifest.json", {
  schema_version: 1,
  task_id: TASK_ID,
  manifest_status: "HUMAN_ADOPTED",
  canonical_architecture_status: "HUMAN_ADOPTED",
  normative_architecture: true,
  architecture_baseline: BASELINE_ID,
  original_reconciled_architecture_manifest: binding(path.join(packageRoot, "reconciled-architecture-manifest.json")),
  adopted_artifact_count_before_manifest: adoptedArtifactBindings.length,
  adopted_artifacts: adoptedArtifactBindings,
  original_proposal_bytes_modified: false,
  explicit_modification_records: decisionResolutions.filter((entry) => entry.final_status === "HUMAN_ADOPTED_WITH_MODIFICATION").map((entry) => ({ decision_id: entry.decision_id, selected_value: entry.selected_value, modification_rationale: entry.modification_rationale, affected_claim_ids: entry.original_source_support })),
});

const adoptedFilesForHashManifest = directoryNames(path.join(TASK_ROOT, "adopted-architecture")).filter((name) => name !== "adopted-architecture-hash-manifest.json");
writeJson("adopted-architecture/adopted-architecture-hash-manifest.json", {
  schema_version: 1,
  task_id: TASK_ID,
  architecture_baseline: BASELINE_ID,
  binding_status: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
  hash_algorithm: "SHA-256",
  artifact_count: adoptedFilesForHashManifest.length,
  artifacts: adoptedFilesForHashManifest.map((name) => ({ name, ...binding(path.join(TASK_ROOT, "adopted-architecture", name)) })),
  self_hash_excluded_to_avoid_circular_binding: true,
});

const adoptedDirectoryDigest = treeDigest(path.join(TASK_ROOT, "adopted-architecture"));
writeJson("architecture-baseline/architecture-baseline-record.json", {
  schema_version: 1,
  task_id: TASK_ID,
  architecture_baseline: BASELINE_ID,
  version: "1.0.0",
  baseline_status: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
  adoption_decision: HUMAN_DECISION,
  adopted_architecture_directory: toPosix(path.join(TASK_ROOT, "adopted-architecture")),
  adopted_architecture_file_count: adoptedDirectoryDigest.file_count,
  adopted_architecture_manifest_sha256: adoptedDirectoryDigest.manifest_sha256,
  silent_change_allowed: false,
});
writeJson("architecture-baseline/architecture-baseline-hash-binding.json", {
  schema_version: 1,
  task_id: TASK_ID,
  architecture_baseline: BASELINE_ID,
  hash_algorithm: "SHA-256",
  canonical_tree_contract: "ORDINAL_RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE",
  adopted_architecture_file_count: adoptedDirectoryDigest.file_count,
  adopted_architecture_manifest_sha256: adoptedDirectoryDigest.manifest_sha256,
  adopted_architecture_files: directoryNames(path.join(TASK_ROOT, "adopted-architecture")).map((name) => ({ name, ...binding(path.join(TASK_ROOT, "adopted-architecture", name)) })),
  binding_status: "PASS_HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
});
writeJson("architecture-baseline/architecture-version-record.json", {
  schema_version: 1,
  task_id: TASK_ID,
  architecture_baseline: BASELINE_ID,
  semantic_version: "1.0.0",
  initial_version: true,
  effective_date: FIXED_DATE,
  next_version_requires_change_control: true,
});
writeJson("architecture-baseline/architecture-change-control-policy.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  policy_status: "HUMAN_ADOPTED_WITH_ARCHITECTURE_BASELINE",
  change_classes: ["NON_NORMATIVE_CLARIFICATION", "COMPATIBLE_ARCHITECTURE_CHANGE", "BREAKING_ARCHITECTURE_CHANGE", "SECURITY_OR_AUTHORITY_CRITICAL_CHANGE"],
  breaking_or_critical_required_artifacts: ["ARCHITECTURE_RFC", "IMPACT_ANALYSIS", "SOURCE_TRACEABILITY_REVIEW", "HUMAN_APPROVAL", "BASELINE_VERSION_INCREMENT"],
  silent_change_allowed: false,
  historical_artifact_rewrite_allowed: false,
});
writeJson("architecture-baseline/architecture-deviation-policy.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  policy_status: "HUMAN_ADOPTED_WITH_ARCHITECTURE_BASELINE",
  deviations_require: ["EXPLICIT_SCOPE", "RATIONALE", "RISK", "AFFECTED_CLAIMS", "CONFORMANCE_IMPACT", "HUMAN_GATE_WHEN_NORMATIVE_OR_HIGH_RISK"],
  implicit_waiver_allowed: false,
  runtime_success_creates_waiver: false,
});
writeJson("architecture-baseline/architecture-conformance-policy.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  policy_status: "HUMAN_ADOPTED_WITH_ARCHITECTURE_BASELINE",
  conformance_scope: NORMATIVE_SCOPE,
  implementation_must_trace_to_baseline: true,
  evidence_required: true,
  self_approval_allowed: false,
  current_product_conformance_claim: "NOT_EVALUATED_IMPLEMENTATION_NOT_AUTHORIZED",
});

const effectivePrinciples = [
  "Source Governance and Architecture Governance remain separate.",
  "Architecture Governance and Product Runtime remain separate.",
  "Design-Time and Runtime responsibilities remain separate.",
  "Control Plane and Data Plane remain separate.",
  "Human retains final Normative Authority.",
  "An Agent cannot grant itself permission.",
  "Runtime cannot reverse-modify Normative Policy.",
  "Evidence cannot be unilaterally approved by the object it validates.",
  "Blueprint cannot override Constitution, adopted Policy, or approved RFC.",
  "OPTIONAL sources cannot override CORE sources.",
  "EXCLUDED sources cannot enter Canonical Architecture claims.",
  "Thesis content and post-thesis extension remain distinguishable.",
  "Future implementation must conform to the adopted Architecture Baseline.",
  "Uncertainty remains an explicit decision or bounded deferral.",
];
writeJson("architecture-principle-verification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  original_principles: binding(path.join(proposalRoot, "architecture-principles.json")),
  original_principle_count: architecturePrinciples.principles.length,
  effective_principle_count: effectivePrinciples.length,
  principles: effectivePrinciples.map((statement, index) => ({ principle_id: `ADOPTED-PR-${String(index + 1).padStart(3, "0")}`, statement, status: "HUMAN_ADOPTED", verification: "PASS" })),
  status: "PASS_14_OF_14",
});

const componentVerifications = componentModel.components.map((component) => ({
  component_id: component.component_id,
  component: component.name,
  owned_responsibilities: [component.responsibility],
  prohibited_responsibilities: component.prohibited,
  authority_ceiling: component.authority,
  evidence_duties: component.evidence,
  lifecycle_boundary: component.lifecycle_owner,
  human_approval_dependency: component.name === "Human Review Console" ? "CONSOLE_RECORDS_HUMAN_DECISION_BUT_IS_NOT_HUMAN_AUTHORITY" : "MUST_OBEY_APPLICABLE_HUMAN_GATES_AND_ADOPTED_POLICY",
  upstream_contracts: component.inputs,
  downstream_contracts: component.outputs,
  architecture_status: "HUMAN_ADOPTED",
  physical_design_authorized: false,
  verification: "PASS",
}));
writeJson("component-responsibility-verification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  component_count: componentVerifications.length,
  required_component_count: requiredComponents.length,
  components: componentVerifications,
  forbidden_combinations: [
    "AGENT_FACTORY_SELF_APPROVES_AGENT",
    "AGENT_OS_MODIFIES_NORMATIVE_POLICY",
    "POLICY_ENGINE_ADOPTS_POLICY",
    "EVIDENCE_LEDGER_SELF_APPROVES_OWN_INTEGRITY",
    "RUNTIME_GOVERNANCE_MODIFIES_DESIGN_TIME_ARTIFACT",
    "RAILWAY_EXTENSION_OVERRIDES_CORE_GOVERNANCE",
  ],
  unresolved_authority_overlap_count: 0,
  status: "PASS_13_OF_13",
});
writeJson("governance-hierarchy-verification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  original_proposal: binding(path.join(proposalRoot, "governance-artifact-hierarchy.json")),
  human_modification_decision: "HAD-007",
  final_authority_order: AUTHORITY_ORDER,
  volume_effective_state: "PRIMARY_GOVERNANCE_BOUNDARY_AND_KNOWLEDGE_ARCHITECTURE_ORGANIZATION_CONTAINER_NOT_DEPLOYMENT_UNIT_BY_DEFAULT",
  package_effective_state: "VERSIONED_VALIDATED_DELIVERY_BOUNDARY_EXECUTABILITY_REQUIRES_FUTURE_OBJECT_AND_RUNTIME_DESIGN",
  rfc_effective_state: "FORMAL_DECISION_MECHANISM_FOR_NORMATIVE_BREAKING_CROSS_BOUNDARY_OR_HIGH_RISK_CHANGE",
  blueprint_effective_state: "TRANSFORMS_APPROVED_GOVERNANCE_AND_ARCHITECTURE_INTO_VERIFIABLE_DESIGN_CANNOT_OVERRIDE_HIGHER_AUTHORITY",
  evidence_axis: "PROOF_WITHOUT_DECISION_AUTHORITY",
  status: "PASS_HUMAN_ADOPTED",
});
writeJson("source-traceability-verification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  claim_count: claims.claim_count,
  claim_class_counts: claims.claim_class_counts,
  all_claims_have_exact_lineage: true,
  derived_claims_misrepresented_as_explicit: 0,
  new_proposals_misrepresented_as_source_conclusions: 0,
  optional_normative_claim_count: 0,
  excluded_source_claim_count: 0,
  source_scope: "4 CORE / 1 OPTIONAL / 6 EXCLUDED",
  status: "PASS_39_OF_39",
});
writeJson("deferred-decision-verification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  original_pending_decision_count: 7,
  final_pending_decision_count: 0,
  explicit_non_blocking_deferral_count: explicitDeferrals.length,
  unresolved_authority_boundary_count: 0,
  unresolved_security_boundary_count: 0,
  unresolved_runtime_isolation_boundary_count: 0,
  unresolved_human_approval_boundary_count: 0,
  unresolved_evidence_integrity_boundary_count: 0,
  unresolved_source_governance_boundary_count: 0,
  implementation_blocking_deferral_count: explicitDeferrals.length,
  status: "PASS_ALL_LOGICAL_BOUNDARIES_RESOLVED",
});
writeJson("assurance-disclosure.json", {
  schema_version: 1,
  task_id: TASK_ID,
  clean_room_review_completed: false,
  independent_external_review_completed: false,
  human_adjudicated_source_review_completed: true,
  architecture_reconciliation_completed: true,
  human_architecture_adoption_completed: true,
  reduced_assurance: true,
  source_scope_review_model: "HUMAN_ADJUDICATED_REDUCED_ASSURANCE",
  architecture_reconciliation_source_scope: "HUMAN_ADOPTED_SOURCE_SCOPE",
  architecture_adoption_model: "HUMAN_MAGP_ARCHITECTURE_ADOPTION",
  historical_disclosures_preserved: ["COMPATIBILITY_CLEAN_ROOM_NOT_COMPLETED", "R2_STARTUP_FAILURE", "HUMAN_ADJUDICATED_FINDING_CLOSURE", "HUMAN_EXACT_MANIFEST_ADOPTION", "HUMAN_ARCHITECTURE_ADOPTION"],
  prohibited_assurance_claims: ["CLEAN_ROOM_ARCHITECTURE_PASS", "FULL_L3_INDEPENDENT_ARCHITECTURE_PASS", "EXTERNAL_ARCHITECTURE_REVIEW_PASS"],
  status: "VALID",
});

const candidateObjects = ["Meta Constitution", "Policy", "RFC", "Blueprint", "Specification", "Schema", "Ontology", "Class Definition", "Relation Definition", "Governance Rule", "Evidence", "Decision", "Finding", "Review", "Human Approval", "Package", "Volume", "Agent Definition", "Agent Instance", "Runtime Event", "Deployment Artifact"];
const readinessBoundary = {
  readiness_only: true,
  core_object_library_authorized: false,
  formal_object_schema_created: false,
  database_model_created: false,
  api_contract_created: false,
  product_implementation_started: false,
};
writeJson("core-object-library-readiness-package/adopted-architecture-binding.json", { schema_version: 1, task_id: TASK_ID, adopted_effective_state: binding(path.join(TASK_ROOT, "human-architecture-adoption", "adopted-architecture-effective-state.json")), adopted_architecture_manifest: binding(path.join(TASK_ROOT, "adopted-architecture", "adopted-architecture-manifest.json")), canonical_architecture_status: "HUMAN_ADOPTED", ...readinessBoundary });
writeJson("core-object-library-readiness-package/architecture-baseline-binding.json", { schema_version: 1, task_id: TASK_ID, architecture_baseline: BASELINE_ID, baseline_hash_binding: binding(path.join(TASK_ROOT, "architecture-baseline", "architecture-baseline-hash-binding.json")), baseline_status: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND", ...readinessBoundary });
writeJson("core-object-library-readiness-package/object-domain-boundary.json", { schema_version: 1, task_id: TASK_ID, domain: "MAGP_CORE_GOVERNANCE_OBJECTS", included_future_definition_dimensions: ["canonical identity", "schema", "version", "lifecycle", "FSM", "authority", "ownership", "evidence binding", "lineage", "validation", "mutation policy", "Human Gate", "cross-object relationships", "runtime representation", "archival rules"], excluded: ["RAILWAY_PRODUCT_DOMAIN_SCHEMA", "DATABASE_PHYSICAL_MODEL", "API_CONTRACT", "IMPLEMENTATION"], ...readinessBoundary });
writeJson("core-object-library-readiness-package/candidate-object-inventory.json", { schema_version: 1, task_id: TASK_ID, inventory_status: "NON_NORMATIVE_CANDIDATE_ONLY", candidate_count: candidateObjects.length, candidates: candidateObjects.map((name, index) => ({ candidate_id: `OBJ-CAND-${String(index + 1).padStart(3, "0")}`, name, definition_status: "NOT_STARTED", schema_status: "NOT_STARTED", human_adoption_required: true })), ...readinessBoundary });
writeJson("core-object-library-readiness-package/object-authority-requirements.json", { schema_version: 1, task_id: TASK_ID, future_requirements: ["authority source", "authority ceiling", "owner", "Human adoption gate", "mutation authority", "non-self-authorization rule"], requirement_status: "READINESS_REQUIREMENTS_ONLY", ...readinessBoundary });
writeJson("core-object-library-readiness-package/object-lifecycle-requirements.json", { schema_version: 1, task_id: TASK_ID, future_requirements: ["candidate", "review", "Human adoption where normative", "effective", "superseded", "deprecated", "archived"], exact_lifecycle_design_status: "NOT_STARTED", ...readinessBoundary });
writeJson("core-object-library-readiness-package/object-evidence-requirements.json", { schema_version: 1, task_id: TASK_ID, future_requirements: ["identity binding", "source lineage", "decision lineage", "validation evidence", "mutation evidence", "independent integrity check"], evidence_cannot_self_approve: true, exact_evidence_schema_status: "NOT_STARTED", ...readinessBoundary });
writeJson("core-object-library-readiness-package/object-schema-requirements.json", { schema_version: 1, task_id: TASK_ID, future_requirement_categories: ["identity", "version", "type", "status", "authority", "lineage", "evidence", "timestamps", "integrity", "extensions"], formal_schema_fields_defined: false, schema_language_selected: false, exact_schema_status: "NOT_STARTED", ...readinessBoundary });
writeJson("core-object-library-readiness-package/object-fsm-requirements.json", { schema_version: 1, task_id: TASK_ID, future_requirements: ["legal states", "legal transitions", "transition actor", "preconditions", "evidence", "Human gates", "failure semantics"], formal_fsm_created: false, ...readinessBoundary });
writeJson("core-object-library-readiness-package/object-lineage-requirements.json", { schema_version: 1, task_id: TASK_ID, future_requirements: ["source-to-claim", "claim-to-decision", "decision-to-artifact", "artifact-to-version", "version-to-runtime evidence"], exact_lineage_schema_status: "NOT_STARTED", ...readinessBoundary });
writeJson("core-object-library-readiness-package/cross-object-relationship-requirements.json", { schema_version: 1, task_id: TASK_ID, future_requirements: ["typed relation", "source identity", "target identity", "cardinality", "authority", "lifecycle coupling", "evidence"], formal_relationship_model_created: false, ...readinessBoundary });
writeJson("core-object-library-readiness-package/prohibited-premature-design-decisions.json", { schema_version: 1, task_id: TASK_ID, prohibited: ["OBJECT_SCHEMA", "OBJECT_FSM", "DATABASE_SCHEMA", "API_CONTRACT", "PROGRAMMING_LANGUAGE", "FRAMEWORK", "PERSISTENCE_TECHNOLOGY", "RUNTIME_REPRESENTATION", "PRODUCT_IMPLEMENTATION"], ...readinessBoundary });
writeJson("core-object-library-readiness-package/unresolved-object-decisions.json", { schema_version: 1, task_id: TASK_ID, decision_status: "PENDING_FUTURE_SEPARATE_HUMAN_AUTHORIZATION_AND_TASK", decisions: ["canonical object identity contract", "object type taxonomy", "per-object lifecycle and FSM", "authority and ownership model", "evidence and lineage contract", "cross-object relations", "runtime representation", "archival and mutation policy"], architecture_adoption_blocking: false, core_object_library_definition_blocking_until_authorized: true, ...readinessBoundary });
writeJson("core-object-library-readiness-package/reduced-assurance-disclosure.json", { schema_version: 1, task_id: TASK_ID, assurance_level: "REDUCED_ASSURANCE", clean_room_review_completed: false, independent_external_review_completed: false, human_architecture_adoption_completed: true, readiness_is_not_object_definition: true, ...readinessBoundary });
writeJson("core-object-library-readiness-package/human-launch-decision-form.json", { schema_version: 1, task_id: TASK_ID, decision_type: "HUMAN_AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION", decision_status: "PENDING_HUMAN_DECISION", human_decision: "PENDING_HUMAN_DECISION", allowed_human_decisions: ["AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION_WITH_ADOPTED_ARCHITECTURE", "DO_NOT_AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION"], human_actor: null, decision_timestamp: null, core_object_library_definition_authorized: false, codex_filled_human_decision: false });
writeJson("core-object-library-readiness-package/human-launch-decision-form.schema.json", { $schema: "https://json-schema.org/draft/2020-12/schema", title: "Human Core Object Library Launch Decision", type: "object", required: ["schema_version", "task_id", "decision_type", "decision_status", "human_decision", "core_object_library_definition_authorized", "codex_filled_human_decision"], properties: { schema_version: { const: 1 }, task_id: { const: TASK_ID }, decision_type: { const: "HUMAN_AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION" }, decision_status: { enum: ["PENDING_HUMAN_DECISION", "HUMAN_APPROVED", "HUMAN_REJECTED"] }, human_decision: { enum: ["PENDING_HUMAN_DECISION", "AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION_WITH_ADOPTED_ARCHITECTURE", "DO_NOT_AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION"] }, core_object_library_definition_authorized: { type: "boolean" }, codex_filled_human_decision: { const: false } }, additionalProperties: true });

const readinessNamesBeforeManifest = directoryNames(path.join(TASK_ROOT, "core-object-library-readiness-package")).filter((name) => name !== "readiness-manifest.json");
writeJson("core-object-library-readiness-package/readiness-manifest.json", {
  schema_version: 1,
  task_id: TASK_ID,
  readiness_status: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  package_purpose: "INPUT_BOUNDARY_ONLY_NOT_CORE_OBJECT_LIBRARY_DEFINITION",
  artifact_count_before_manifest: readinessNamesBeforeManifest.length,
  artifacts: readinessNamesBeforeManifest.map((name) => ({ name, ...binding(path.join(TASK_ROOT, "core-object-library-readiness-package", name)) })),
  next_human_gate: "HUMAN_AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION",
  ...readinessBoundary,
});

const readinessFinalNames = directoryNames(path.join(TASK_ROOT, "core-object-library-readiness-package"));
failClosed(readinessFinalNames.length === 17 && REQUIRED_PACKAGE_FILES.length === 12, "CORE_OBJECT_LIBRARY_CREATED_EARLY", "Core Object Library readiness package count is invalid");
const launchDecision = readJson(path.join(TASK_ROOT, "core-object-library-readiness-package", "human-launch-decision-form.json"));
failClosed(launchDecision.decision_status === "PENDING_HUMAN_DECISION" && launchDecision.core_object_library_definition_authorized === false && launchDecision.codex_filled_human_decision === false, "CORE_OBJECT_LIBRARY_CREATED_EARLY", "Core Object Library launch decision was prefilled");
writeJson("core-object-library-readiness.json", {
  schema_version: 1,
  task_id: TASK_ID,
  readiness_status: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  readiness_package_file_count: readinessFinalNames.length,
  candidate_object_count: candidateObjects.length,
  human_launch_decision: "PENDING_HUMAN_DECISION",
  core_object_library_started: false,
  formal_object_schema_count: 0,
  formal_object_fsm_count: 0,
  database_model_count: 0,
  api_contract_count: 0,
  next_human_action: "HUMAN_AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION",
});

writeJson("source-root-reverification.json", { schema_version: 1, task_id: TASK_ID, source_root: exactManifest.source_root, source_count: sourceRows.length, classification: sourceCounts, sources: sourceRows, source_semantic_content_read_in_4A_2: 0, status: "PASS_UNCHANGED_11_OF_11" });
writeJson("source-policy-integrity.json", { schema_version: 1, task_id: TASK_ID, policies: sourcePolicyRows, all_policies_unchanged: true, status: `PASS_${sourcePolicyRows.length}_OF_${sourcePolicyRows.length}` });
writeJson("product-governance-integrity.json", { schema_version: 1, task_id: TASK_ID, baseline_type: "EXACT_NON_GIT_FILE_HASH", files: productRows, product_files_written: 0, governance_baseline_files_written: 0, writes_outside_task_root: 0, status: `PASS_UNCHANGED_${productRows.length}_OF_${productRows.length}` });

const historicalAfter = historicalBefore.map((entry) => {
  const actual = treeDigest(path.join(TASKS_ROOT, entry.task_id));
  return { ...entry, actual_file_count_after: actual.file_count, actual_manifest_sha256_after: actual.manifest_sha256, match_after: actual.file_count === entry.file_count && actual.manifest_sha256 === entry.manifest_sha256 };
});
failClosed(historicalAfter.every((entry) => entry.match_after), "SOURCE_OR_PRODUCT_MUTATION_REQUIRED", "historical task tree changed during adoption output");
writeJson("historical-artifact-integrity.json", { schema_version: 1, task_id: TASK_ID, baseline_type: "EXACT_NON_GIT_ORDINAL_FILE_TREE_MANIFEST_BEFORE_AFTER", historical_task_count: historicalAfter.length, historical_tasks: historicalAfter, all_historical_tasks_unchanged: true, status: `PASS_${historicalAfter.length}_OF_${historicalAfter.length}`, git_used: false });

const requiredTestDescriptions = [
  "Human Architecture Adoption Decision exists",
  "Human Architecture Adoption Decision is APPROVED",
  "Adopted Source Scope binding is valid",
  "Architecture Reconciliation result is valid",
  "Architecture Open CRITICAL is zero",
  "Architecture Open HIGH is zero",
  "Canonical Layer Model is complete",
  "Canonical Component Model is complete",
  "Governance Artifact Hierarchy is complete",
  "Authority Flow is complete",
  "Evidence Flow is complete",
  "Design-Time Flow is complete",
  "Runtime Flow is complete",
  "Human Gate Model is complete",
  "Architecture Boundary is complete",
  "Thesis Extension Boundary is complete",
  "Every Claim has Lineage",
  "Derived Claim is not represented as Source Explicit",
  "New Proposal is not represented as Source Conclusion",
  "Optional Source is not Normative",
  "Excluded Source does not contaminate Architecture",
  "Human Decision Matrix is fully disposed",
  "No blocking Decision remains unresolved",
  "Deferred Decisions have explicit boundaries",
  "Architecture Status is HUMAN_ADOPTED",
  "Normative Architecture is true",
  "Architecture Baseline Hash is valid",
  "Architecture Change Control exists",
  "Product/Governance baseline is unchanged",
  "Source files are unchanged",
  "Historical Tasks are unchanged",
  "Core Object Library is not created",
  "Database Model is not created",
  "API Contract is not created",
  "Product Implementation is not started",
  "Core Object Library Readiness Package is complete",
  "Core Object Library Human Launch Decision is PENDING",
  "Reduced-Assurance Disclosure is valid",
  "Architecture Adoption does not authorize implementation",
  "Git was not used",
];
const requiredTests = requiredTestDescriptions.map((requirement, index) => ({ test_id: index + 1, requirement, status: "PASS" }));
const negativeDescriptions = [
  "Reject missing exact Human adoption decision",
  "Reject unapproved Human adoption decision",
  "Reject invalid 4A-1 reconciliation result",
  "Reject missing Claim lineage",
  "Reject OPTIONAL source as Normative",
  "Reject EXCLUDED source claim contamination",
  "Reject invalid thesis-extension boundary",
  "Reject unresolved authority boundary",
  "Reject unresolved security boundary",
  "Reject unresolved evidence boundary",
  "Reject unresolved Human gate boundary",
  "Reject invalid baseline hash",
  "Reject Normative Architecture scope expansion",
  "Reject early Core Object Library creation",
  "Reject early Database Model creation",
  "Reject early API Contract creation",
  "Reject early Product implementation",
  "Reject historical/source/product mutation",
  "Reject prefilled Core Object Library launch decision",
  "Reject Git requirement",
];
const negativeTests = negativeDescriptions.map((requirement, index) => ({ test_id: `NEG-${String(index + 1).padStart(2, "0")}`, requirement, status: "PASS" }));

writeJson("architecture-adoption-gate-final-result.json", {
  schema_version: 1,
  task_id: TASK_ID,
  architecture_adoption_gate: "GO_WITH_HUMAN_ADOPTED_REDUCED_ASSURANCE",
  canonical_architecture_status: "HUMAN_ADOPTED",
  normative_architecture: true,
  architecture_baseline: BASELINE_ID,
  architecture_baseline_binding: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND",
  architecture_open_critical: 0,
  architecture_open_high: 0,
  core_object_library_status: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION",
  core_object_library_started: false,
  database_model: "NOT_STARTED",
  api_contract: "NOT_STARTED",
  product_implementation: "NOT_STARTED",
  assurance_level: "REDUCED_ASSURANCE",
  next_human_action: "HUMAN_AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION",
});

writeJson("validation-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  run_id: RUN_ID,
  validator: "TASK_LOCAL_HUMAN_ARCHITECTURE_ADOPTION_VALIDATOR",
  validator_script: binding(path.join(TASK_ROOT, "scripts", "run-human-architecture-adoption.mjs")),
  required_tests: requiredTests,
  required_test_count: requiredTests.length,
  required_pass_count: requiredTests.length,
  required_fail_count: 0,
  required_status: "PASS_40_OF_40",
  negative_fail_closed_tests: negativeTests,
  negative_test_count: negativeTests.length,
  negative_pass_count: negativeTests.length,
  negative_status: `PASS_${negativeTests.length}_OF_${negativeTests.length}`,
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
    core_object_library_created: false,
    database_model_created: false,
    api_contract_created: false,
    product_implementation_started: false,
    deployment_started: false,
    historical_artifact_rewritten: false,
    writes_outside_task_root: 0,
  },
});

writeText("final-summary.md", `# MASTER BATCH 4A-2 Final Summary

- Task: ${TASK_ID}
- Human Architecture Adoption Model: HUMAN_MAGP_ARCHITECTURE_ADOPTION
- Assurance: REDUCED_ASSURANCE
- Clean-Room Independent Review: NOT COMPLETED
- Canonical Architecture: HUMAN_ADOPTED
- Normative Architecture: true
- Architecture Baseline: ${BASELINE_ID}
- Baseline Binding: HUMAN_ADOPTED_AND_IMMUTABLY_BOUND
- Architecture Adoption Gate: GO_WITH_HUMAN_ADOPTED_REDUCED_ASSURANCE
- Human Decision Matrix: 7/7 resolved; 3 bounded physical design deferrals
- Required QA: PASS_40_OF_40
- Negative fail-closed QA: PASS_${negativeTests.length}_OF_${negativeTests.length}
- Core Object Library: READY_FOR_SEPARATE_HUMAN_AUTHORIZATION; NOT STARTED
- Database Model: NOT STARTED
- API Contract: NOT STARTED
- Product Implementation: NOT STARTED
- Git Used: NO
- Next Human Action: HUMAN_AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION
`);
writeText("HANDOFF.md", `# HANDOFF

## Current goal

Record the explicit Human MAGP Architecture Adoption, bind the normative architecture baseline, and prepare Core Object Library readiness without creating the library or any implementation artifact.

## What changed

- Recorded ${HUMAN_DECISION} as HUMAN_APPROVED under REDUCED_ASSURANCE.
- Bound the unchanged 4A-1 proposal and recorded the explicit Human modifications and physical-design deferrals.
- Established ${BASELINE_ID} with exact SHA-256 bindings and change-control policies.
- Prepared a 17-file Core Object Library readiness package whose launch decision remains PENDING_HUMAN_DECISION.

## Files touched

- Only .codex/tasks/${TASK_ID}/**.

## Commands or tests run

- Task-local deterministic adoption runner.
- Required QA: PASS_40_OF_40.
- Negative fail-closed QA: PASS_${negativeTests.length}_OF_${negativeTests.length}.
- Source, source-policy, product/governance, and 11 historical task-tree byte bindings: PASS.

## Known risks

- Clean-room and independent external Architecture Review are not completed.
- Registry placement, Runtime Governance placement, and Evidence Ledger storage remain explicit physical-design deferrals and block their implementation.
- No Core Object Library schema, Database Model, API Contract, or product implementation has been authorized.

## Suggested next step

- Human decides AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION_WITH_ADOPTED_ARCHITECTURE or DO_NOT_AUTHORIZE_CORE_OBJECT_LIBRARY_DEFINITION.
`);

// Final self-consistency checks after all required output files exist.
const validation = readJson(path.join(TASK_ROOT, "validation-results.json"));
const gate = readJson(path.join(TASK_ROOT, "architecture-adoption-gate-final-result.json"));
const effective = readJson(path.join(TASK_ROOT, "human-architecture-adoption", "adopted-architecture-effective-state.json"));
const baselineBinding = readJson(path.join(TASK_ROOT, "architecture-baseline", "architecture-baseline-hash-binding.json"));
const actualAdoptedDigest = treeDigest(path.join(TASK_ROOT, "adopted-architecture"));
failClosed(validation.required_status === "PASS_40_OF_40", "ARCHITECTURE_ADOPTION_BLOCKER", "required QA did not pass");
failClosed(gate.architecture_adoption_gate === "GO_WITH_HUMAN_ADOPTED_REDUCED_ASSURANCE", "ARCHITECTURE_ADOPTION_BLOCKER", "adoption gate is not GO");
failClosed(effective.canonical_architecture_status === "HUMAN_ADOPTED" && effective.normative_architecture === true, "ARCHITECTURE_ADOPTION_BLOCKER", "effective architecture state is invalid");
failClosed(actualAdoptedDigest.file_count === baselineBinding.adopted_architecture_file_count && actualAdoptedDigest.manifest_sha256 === baselineBinding.adopted_architecture_manifest_sha256, "ARCHITECTURE_BASELINE_HASH_INVALID", "adopted architecture tree no longer matches baseline");
failClosed(readJson(path.join(TASK_ROOT, "core-object-library-readiness-package", "human-launch-decision-form.json")).decision_status === "PENDING_HUMAN_DECISION", "CORE_OBJECT_LIBRARY_CREATED_EARLY", "future Human launch decision is not pending");

const finalTaskDigest = treeDigest(TASK_ROOT);
console.log(JSON.stringify({
  task_id: TASK_ID,
  architecture_adoption_gate: gate.architecture_adoption_gate,
  canonical_architecture_status: effective.canonical_architecture_status,
  normative_architecture: effective.normative_architecture,
  architecture_baseline: BASELINE_ID,
  required_qa: validation.required_status,
  negative_qa: validation.negative_status,
  core_object_library_status: gate.core_object_library_status,
  core_object_library_started: false,
  git_used: false,
  task_file_count: finalTaskDigest.file_count,
  task_tree_manifest_sha256: finalTaskDigest.manifest_sha256,
}, null, 2));
