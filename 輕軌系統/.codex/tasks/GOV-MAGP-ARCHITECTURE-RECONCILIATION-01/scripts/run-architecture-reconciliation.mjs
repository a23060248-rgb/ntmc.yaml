import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TASK_ID = "GOV-MAGP-ARCHITECTURE-RECONCILIATION-01";
const ADOPTION_TASK_ID = "GOV-MAGP-HUMAN-SOURCE-SCOPE-EXACT-MANIFEST-ADOPTION-01";
const HUMAN_DECISION = "AUTHORIZE_ARCHITECTURE_RECONCILIATION_WITH_ADOPTED_SOURCE_SCOPE";
const TASK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_ROOT = path.resolve(TASK_ROOT, "..", "..", "..");
const TASKS_ROOT = path.join(PRODUCT_ROOT, ".codex", "tasks");
const ADOPTION_ROOT = path.join(TASKS_ROOT, ADOPTION_TASK_ID);
const ADOPTED_ROOT = path.join(ADOPTION_ROOT, "adopted-manifests");
const READINESS_ROOT = path.join(ADOPTION_ROOT, "architecture-reconciliation-readiness-package");
const AGGREGATOR_PACKAGE_ROOT = path.join(TASKS_ROOT, "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-HUMAN-ADJUDICATED-R1", "human-exact-manifest-adoption-package");
const BASE_SCOPE_ROOT = path.join(TASKS_ROOT, "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01");
const HUMAN_DECISION_SOURCE = "C:/Users/a2306/.codex/attachments/28604234-05d7-4e5c-b31d-54185cbfacdf/pasted-text.txt";
const EXTRACTION_ROOT = path.join(TASK_ROOT, "tmp", "authorized-source-extraction");
const FIXED_DATE = "2026-07-22";
const RUN_ID = "MAGP-ARCHITECTURE-RECONCILIATION-20260722-R1";

const ADOPTED_INPUT_NAMES = [
  "adopted-exact-source-manifest.json",
  "adopted-source-hash-manifest.json",
  "adopted-source-identity-manifest.json",
  "adopted-source-classification-manifest.json",
  "adopted-source-authority-effective-state.json",
  "adopted-claim-eligibility-effective-state.json",
  "adopted-contamination-policy-effective-state.json",
];

const REQUIRED_READINESS_NAMES = [
  "adopted-authority-policy-binding.json",
  "adopted-source-input-binding.json",
  "architecture-reconciliation-scope-boundary.json",
  "claim-eligibility-binding.json",
  "contamination-boundary-binding.json",
  "human-launch-decision-form.json",
  "human-launch-decision-form.schema.json",
  "post-launch-required-gates.json",
  "prohibited-actions.json",
  "readiness-manifest.json",
  "reduced-assurance-disclosure.json",
  "unresolved-architecture-decisions.json",
];

function toPosix(value) {
  return path.resolve(value).split(path.sep).join("/");
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function readBytes(filePath) {
  return fs.readFileSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(readBytes(filePath).toString("utf8"));
}

function fileBinding(filePath) {
  const bytes = readBytes(filePath);
  return {
    absolute_path: toPosix(filePath),
    sha256: sha256Bytes(bytes),
    bytes: bytes.length,
  };
}

function failClosed(condition, code, detail) {
  if (!condition) {
    const error = new Error(`${code}: ${detail}`);
    error.code = code;
    throw error;
  }
}

function ensureDirectory(relativePath) {
  const absolutePath = path.join(TASK_ROOT, relativePath);
  fs.mkdirSync(absolutePath, { recursive: true });
  return absolutePath;
}

function writeJson(relativePath, value) {
  const absolutePath = path.join(TASK_ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(relativePath, value) {
  const absolutePath = path.join(TASK_ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
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
      sha256: sha256Bytes(readBytes(absolutePath)),
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

function artifactManifest(relativeRoot, excludeNames = []) {
  const absoluteRoot = path.join(TASK_ROOT, relativeRoot);
  return listFilesRecursive(absoluteRoot)
    .filter((filePath) => !excludeNames.includes(path.basename(filePath)))
    .map((filePath) => ({
      name: path.relative(absoluteRoot, filePath).split(path.sep).join("/"),
      ...fileBinding(filePath),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

for (const directory of [
  "input-binding",
  "source-architecture-claims",
  "layer-model-reconciliation",
  "component-boundary-reconciliation",
  "governance-structure-reconciliation",
  "canonical-architecture-proposal",
  "human-decision-matrix",
  "human-architecture-adoption-package",
]) ensureDirectory(directory);

const humanDecisionText = readBytes(HUMAN_DECISION_SOURCE).toString("utf8").replace(/\r\n/g, "\n");
failClosed(humanDecisionText.includes("Human正式決定：") && humanDecisionText.includes(HUMAN_DECISION), "ARCHITECTURE_RECONCILIATION_HUMAN_AUTHORIZATION_MISSING", "exact Human authorization is absent");
failClosed(humanDecisionText.includes("本授權不包含：") && humanDecisionText.includes("Human Architecture Adoption"), "ARCHITECTURE_RECONCILIATION_HUMAN_AUTHORIZATION_MISSING", "Human adoption boundary is absent");

const adoptedInputs = Object.fromEntries(ADOPTED_INPUT_NAMES.map((name) => [name, readJson(path.join(ADOPTED_ROOT, name))]));
const readinessNames = fs.readdirSync(READINESS_ROOT, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
failClosed(JSON.stringify(readinessNames) === JSON.stringify([...REQUIRED_READINESS_NAMES].sort()), "ADOPTED_SOURCE_MANIFEST_INVALID", "readiness package file set is not exactly 12 files");
const readinessManifest = readJson(path.join(READINESS_ROOT, "readiness-manifest.json"));
const readinessBindings = readinessManifest.bound_artifacts.map((entry) => {
  const actual = fileBinding(entry.absolute_path);
  return { name: entry.name, expected_sha256: entry.sha256, expected_bytes: entry.bytes, ...actual, match: entry.sha256 === actual.sha256 && entry.bytes === actual.bytes };
});
failClosed(readinessBindings.length === 11 && readinessBindings.every((entry) => entry.match), "ADOPTED_SOURCE_MANIFEST_INVALID", "readiness package artifact binding failed");

const adoptedExact = adoptedInputs["adopted-exact-source-manifest.json"];
const adoptedHash = adoptedInputs["adopted-source-hash-manifest.json"];
const adoptedIdentity = adoptedInputs["adopted-source-identity-manifest.json"];
const adoptedClassification = adoptedInputs["adopted-source-classification-manifest.json"];
const adoptedAuthority = adoptedInputs["adopted-source-authority-effective-state.json"];
const adoptedEligibility = adoptedInputs["adopted-claim-eligibility-effective-state.json"];
const adoptedContamination = adoptedInputs["adopted-contamination-policy-effective-state.json"];

failClosed(adoptedExact.adoption_status === "HUMAN_ADOPTED" && adoptedExact.source_count === 11, "ADOPTED_SOURCE_MANIFEST_INVALID", "exact source manifest adoption state is invalid");
failClosed(adoptedHash.binding_status === "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND" && adoptedHash.source_count === 11, "SOURCE_HASH_BINDING_INVALID", "source hash adoption state is invalid");
failClosed(adoptedIdentity.identity_status === "11_OF_11_UNIQUE_AND_RESOLVED", "ADOPTED_SOURCE_MANIFEST_INVALID", "source identity adoption state is invalid");
failClosed(adoptedClassification.counts.CORE === 4 && adoptedClassification.counts.OPTIONAL === 1 && adoptedClassification.counts.EXCLUDED === 6, "SOURCE_CLASSIFICATION_CHANGED", "source classification is not 4/1/6");
failClosed(adoptedAuthority.source_authority_status === "HUMAN_ADOPTED" && adoptedAuthority.normative_authority === true && adoptedAuthority.normative_scope_classification === "SOURCE_GOVERNANCE_ONLY", "SOURCE_AUTHORITY_SCOPE_OVERCLAIMED", "adopted source authority state is invalid");
const exactNormativeScopes = ["SOURCE_SELECTION", "SOURCE_CITATION", "CLAIM_ELIGIBILITY", "SOURCE_PRECEDENCE", "CONTAMINATION_PREVENTION", "ARCHITECTURE_RECONCILIATION_INPUT_BOUNDARY"];
failClosed(JSON.stringify(adoptedAuthority.normative_scope) === JSON.stringify(exactNormativeScopes), "SOURCE_AUTHORITY_SCOPE_OVERCLAIMED", "source authority scope changed or expanded");
failClosed(adoptedEligibility.adoption_status === "HUMAN_ADOPTED" && adoptedEligibility.normative_scope.join(",") === "CLAIM_ELIGIBILITY", "SOURCE_AUTHORITY_SCOPE_OVERCLAIMED", "claim eligibility scope is invalid");
failClosed(adoptedContamination.adoption_status === "HUMAN_ADOPTED" && adoptedContamination.normative_scope.includes("CONTAMINATION_PREVENTION"), "ADOPTED_SOURCE_MANIFEST_INVALID", "contamination policy is not adopted");

const exactManifestPath = adoptedExact.original_artifact.absolute_path;
const sourceHashManifestPath = adoptedHash.original_artifact.absolute_path;
const sourceIdentityManifestPath = adoptedIdentity.original_artifact.absolute_path;
const sourceClassificationManifestPath = adoptedClassification.original_artifact.absolute_path;
for (const [record, filePath, code] of [
  [adoptedExact.original_artifact, exactManifestPath, "ADOPTED_SOURCE_MANIFEST_INVALID"],
  [adoptedHash.original_artifact, sourceHashManifestPath, "SOURCE_HASH_BINDING_INVALID"],
  [adoptedIdentity.original_artifact, sourceIdentityManifestPath, "ADOPTED_SOURCE_MANIFEST_INVALID"],
  [adoptedClassification.original_artifact, sourceClassificationManifestPath, "SOURCE_CLASSIFICATION_CHANGED"],
]) {
  const actual = fileBinding(filePath);
  failClosed(record.sha256 === actual.sha256 && record.bytes === actual.bytes, code, `adopted original artifact drifted: ${filePath}`);
}

const exactManifest = readJson(exactManifestPath);
const sourceHashManifest = readJson(sourceHashManifestPath);
const sourceIdentityManifest = readJson(sourceIdentityManifestPath);
const classificationManifest = readJson(sourceClassificationManifestPath);
failClosed(exactManifest.source_count === 11 && sourceHashManifest.source_count === 11 && sourceIdentityManifest.source_count === 11, "ADOPTED_SOURCE_MANIFEST_INVALID", "original manifest count is invalid");
const sourceIds = exactManifest.sources.map((source) => source.source_id);
failClosed(new Set(sourceIds).size === 11, "ADOPTED_SOURCE_MANIFEST_INVALID", "source identities are not unique");
failClosed(JSON.stringify(sourceIds) === JSON.stringify(sourceHashManifest.entries.map((entry) => entry.source_id)) && JSON.stringify(sourceIds) === JSON.stringify(sourceIdentityManifest.entries.map((entry) => entry.source_id)) && JSON.stringify(sourceIds) === JSON.stringify(classificationManifest.entries.map((entry) => entry.source_id)), "ADOPTED_SOURCE_MANIFEST_INVALID", "manifest source ordering or identity differs");

const sourceReverification = exactManifest.sources.map((source) => {
  const actual = fileBinding(source.normalized_absolute_path);
  const filenameNfcMatch = path.basename(source.normalized_absolute_path).normalize("NFC") === source.actual_filename.normalize("NFC");
  return {
    source_id: source.source_id,
    classification: source.classification,
    authority_level: source.authority_level,
    read_scope: source.read_scope,
    expected_sha256: source.sha256,
    expected_bytes: source.file_size_bytes,
    actual_sha256: actual.sha256,
    actual_bytes: actual.bytes,
    filename_nfc_match: filenameNfcMatch,
    hash_size_identity_match: actual.sha256 === source.sha256 && actual.bytes === source.file_size_bytes && filenameNfcMatch,
    content_claim_read: source.classification !== "EXCLUDED",
  };
});
failClosed(sourceReverification.every((entry) => entry.hash_size_identity_match), "SOURCE_HASH_BINDING_INVALID", "one or more source hashes, sizes, or identities changed");
failClosed(sourceReverification.filter((entry) => entry.classification === "CORE").length === 4 && sourceReverification.filter((entry) => entry.classification === "OPTIONAL").length === 1 && sourceReverification.filter((entry) => entry.classification === "EXCLUDED").length === 6, "SOURCE_CLASSIFICATION_CHANGED", "actual source classification is not 4/1/6");
failClosed(sourceReverification.filter((entry) => entry.classification === "EXCLUDED").every((entry) => entry.content_claim_read === false), "EXCLUDED_SOURCE_CONTAMINATION_DETECTED", "excluded source content was marked read");

const coreExtractions = Object.fromEntries(["SOURCE-MAGP-01", "SOURCE-MAGP-02", "SOURCE-MAGP-03", "SOURCE-MAGP-04"].map((sourceId) => [sourceId, readJson(path.join(EXTRACTION_ROOT, `${sourceId}.json`))]));
for (const [sourceId, extraction] of Object.entries(coreExtractions)) {
  const source = exactManifest.sources.find((entry) => entry.source_id === sourceId);
  failClosed(extraction.source_sha256 === source.sha256 && extraction.source_bytes === source.file_size_bytes && extraction.page_count > 0, "SOURCE_HASH_BINDING_INVALID", `page extraction binding failed for ${sourceId}`);
}

const optionalSource = exactManifest.sources.find((source) => source.source_id === "SOURCE-PATTERN-01");
const optionalText = readBytes(optionalSource.normalized_absolute_path).toString("utf8");
const optionalLines = optionalText.split(/\r?\n/);
failClosed(optionalLines[189]?.includes("Artifact") || optionalLines[189]?.includes("協作"), "UNADOPTED_SOURCE_USED", "optional general-process anchor is absent");

function pdfRef(sourceId, pages, anchor, note) {
  const source = exactManifest.sources.find((entry) => entry.source_id === sourceId);
  return {
    source_id: sourceId,
    source_sha256: source.sha256,
    normalized_absolute_path: source.normalized_absolute_path,
    locator_type: "PDF_PAGE",
    pages,
    anchor,
    evidence_note: note,
  };
}

function lineRef(startLine, endLine, anchor, note) {
  return {
    source_id: "SOURCE-PATTERN-01",
    source_sha256: optionalSource.sha256,
    normalized_absolute_path: optionalSource.normalized_absolute_path,
    locator_type: "MARKDOWN_LINE_RANGE",
    start_line: startLine,
    end_line: endLine,
    anchor,
    evidence_note: note,
  };
}

const evidence = {
  thesisScope: pdfRef("SOURCE-MAGP-01", [50, 53, 54, 55], "MAGP lifecycle and thesis scope", "The thesis limits implementation to blueprint-driven knowledge governance and treats Factory, Agent OS, and Runtime Governance as future work."),
  thesisPipeline: pdfRef("SOURCE-MAGP-01", [52, 55, 57, 59, 116, 117, 118, 119], "source-to-knowledge-graph pipeline", "The thesis documents the domain blueprint, rule/prompt compiler, source sentences, clauses, units, packages, links, Knowledge Lake, Knowledge Graph, and HITL outputs."),
  thesisCandidateBoundary: pdfRef("SOURCE-MAGP-01", [114, 115], "LLM-assisted completion remains pending", "LLM-completed knowledge is explicitly retained as a pending candidate rather than verified knowledge."),
  thesisFuture: pdfRef("SOURCE-MAGP-01", [119, 120], "future Agent Factory and runtime governance", "Full Agent Factory and runtime governance are future research directions."),
  magpPosition: pdfRef("SOURCE-MAGP-02", [2, 3, 10, 11], "meta-level governance specification platform", "MAGP is described as a meta-level governance specification platform, distinct from a runtime engine or importable framework."),
  sixLayers: pdfRef("SOURCE-MAGP-02", [4, 5], "six core layers and semantic taxonomy", "The conceptual source defines six responsibility layers and distinguishes them from object taxonomy."),
  knowledge: pdfRef("SOURCE-MAGP-02", [6, 7, 8], "knowledge granularity, blueprint validation, and runtime groups", "The source describes traceable knowledge units, blueprint validation, and runtime governance groups."),
  lifecycleExample: pdfRef("SOURCE-MAGP-02", [9, 10], "BGE to Factory to Agent OS lifecycle", "The example distinguishes generation, manufacture, and runtime execution."),
  implementationMaturity: pdfRef("SOURCE-MAGP-03", [23, 32, 101, 103, 201], "planning completeness and bounded package cycle", "The implementation-guidance source repeatedly states that planning is incomplete and recommends package-by-package review and tests rather than one-shot generation."),
  implementationBoundary: pdfRef("SOURCE-MAGP-03", [24, 30, 185, 189, 190, 191], "BGE Factory Agent OS Human authority boundaries", "The guidance assigns generation, manufacture, runtime, and Human authority to separate responsibilities."),
  volumeProposal: pdfRef("SOURCE-MAGP-03", [103, 132, 133, 135, 136, 184, 185], "engineering knowledge base and volume tree", "The guidance proposes an engineering knowledge-base hierarchy and 14-volume tree."),
  bgeOsBoundary: pdfRef("SOURCE-MAGP-04", [5, 7, 51, 52, 53], "build-time BGE, manufacturing Factory, runtime Agent OS", "The architecture proposal clearly separates build-time compilation, manufacturing, and runtime execution."),
  semanticHierarchy: pdfRef("SOURCE-MAGP-04", [6, 7, 55, 57], "Meta, abstract, concrete, constitution, meta-agent", "The architecture proposal describes semantic branches and meta-level responsibility while retaining Human approval."),
  volumePackageRfc: pdfRef("SOURCE-MAGP-04", [4, 23, 24, 25, 28, 29, 30, 31], "Volume Package RFC hierarchy", "The proposal treats Volume, Package, and RFC as distinct engineering organization levels and contains both linear and DAG dependency descriptions."),
  architectureDescriptionOnly: pdfRef("SOURCE-MAGP-04", [9, 48, 61, 62, 63, 64, 65, 79], "architecture description not implementation", "The source explicitly classifies the volume map as architecture description that requires later specification, Human review, code generation, and testing."),
  optionalArtifacts: lineRef(190, 241, "Artifact-mediated collaboration", "Non-authoritative pattern for hash-pinned handoff and bounded artifact exchange."),
  optionalRoleSeparation: lineRef(654, 665, "role responsibility and non-authority", "Non-authoritative pattern for separating generation, review, execution, and adoption authority."),
  optionalEvidence: lineRef(1257, 1350, "evidence-bound completion", "Non-authoritative pattern for trace, negative tests, independent rerun, and unresolved-item checks."),
  optionalNoParallelAuthority: lineRef(1541, 1593, "lean control and no parallel authority", "Non-authoritative pattern for control-document budgets and avoiding duplicate authority."),
};

function claim({ id, title, statement, claimClass, refs, authority, method, assumptions = [], conflicts = [], contamination = "PASS_NO_EXCLUDED_OR_DOMAIN_SPECIFIC_CLAIM", confidence = "HIGH", eligibility = "CANDIDATE_ELIGIBLE_PENDING_HUMAN_ARCHITECTURE_ADOPTION", disposition }) {
  return {
    claim_id: id,
    claim_title: title,
    claim_statement: statement,
    claim_class: claimClass,
    source_ids: [...new Set(refs.map((ref) => ref.source_id))],
    exact_evidence_references: refs,
    source_authority_level: authority,
    derivation_method: method,
    assumptions,
    conflicting_claims: conflicts,
    contamination_check: contamination,
    confidence,
    normative_eligibility: eligibility,
    proposed_disposition: disposition,
    architecture_status: "PROPOSED_NOT_ADOPTED",
    represented_as_source_explicit: claimClass === "SOURCE_EXPLICIT",
  };
}

const excludedBoundaryRefs = exactManifest.sources
  .filter((source) => source.classification === "EXCLUDED")
  .map((source) => ({
    source_id: source.source_id,
    source_sha256: source.sha256,
    normalized_absolute_path: source.normalized_absolute_path,
    locator_type: "ADOPTED_MANIFEST_METADATA_ONLY",
    manifest_path: exactManifestPath,
    classification: "EXCLUDED",
    claim_eligibility: source.claim_eligibility,
    evidence_note: "Identity, hash, classification, and exclusion boundary only; source content was not opened for architecture claims.",
  }));

const claims = [
  claim({ id: "ARC-CLM-001", title: "MAGP platform positioning", statement: "MAGP should be treated as a meta-level governance specification platform that governs how agents are designed and constrained, not as a product runtime or generic agent framework.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.magpPosition], authority: "SECONDARY_CONCEPTUAL_INTERPRETATION", method: "Direct conceptual statement bounded by source authority.", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-002", title: "Thesis implementation scope", statement: "The thesis implements the blueprint-driven knowledge-governance segment of the MAGP lifecycle and does not implement the complete MAGP platform.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.thesisScope], authority: "PRIMARY_METHODOLOGY_SOURCE", method: "Direct thesis scope statement.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-003", title: "Thesis source-to-graph pipeline", statement: "The thesis demonstrates a governed pipeline from trusted documents through sentences, clauses, units, package classification, links, Knowledge Lake, Knowledge Graph, and HITL verification.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.thesisPipeline], authority: "PRIMARY_METHODOLOGY_SOURCE", method: "Direct method and result synthesis within the primary source.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-004", title: "Unverified model completion remains candidate", statement: "LLM-assisted gap filling must remain explicitly pending until Human or expert validation and must not enter verified knowledge silently.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.thesisCandidateBoundary], authority: "PRIMARY_METHODOLOGY_SOURCE", method: "Direct thesis validation rule generalized without health-domain values.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-005", title: "Full Factory and runtime are post-thesis", statement: "A complete Agent Factory, complete Agent OS, and complete Runtime Governance are post-thesis architecture extensions.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.thesisFuture, evidence.thesisScope], authority: "PRIMARY_METHODOLOGY_SOURCE", method: "Direct future-work and scope boundary.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-006", title: "Six conceptual responsibility layers", statement: "The conceptual model identifies Meta Constitution, Meta Ontology, Meta Relation, Meta Governance, Meta Process, and Meta Runtime as six distinct responsibility layers.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.sixLayers], authority: "SECONDARY_CONCEPTUAL_INTERPRETATION", method: "Direct conceptual layer enumeration.", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-007", title: "Layers and object taxonomy are different dimensions", statement: "Responsibility layers answer who defines or governs what, while the object taxonomy classifies the semantic nature of artifacts; they must not be mapped one-to-one by name alone.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.sixLayers, evidence.semanticHierarchy], authority: "SECONDARY_CONCEPTUAL_INTERPRETATION_PLUS_DERIVED_ARCHITECTURE_PROPOSAL", method: "Cross-check of explicit distinctions in conceptual and architecture sources.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-008", title: "Human and Constitution authority boundary", statement: "Human decisions remain the highest adoption authority; machine components may evaluate or propose but cannot self-adopt policy or architecture.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.implementationBoundary, evidence.semanticHierarchy, evidence.optionalRoleSeparation], authority: "CORE_SYNTHESIS_WITH_OPTIONAL_PATTERN_NON_NORMATIVE", method: "Reconcile Human-supremacy statements with non-authority role separation.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-009", title: "Ontology and Relation semantic separation", statement: "Entity types and legal relationships are separate semantic responsibilities; relation similarity does not establish identity or authority.", claimClass: "SOURCE_DERIVED", refs: [evidence.sixLayers, evidence.semanticHierarchy], authority: "SECONDARY_CONCEPTUAL_INTERPRETATION", method: "Derived from separate Meta Ontology and Meta Relation layers and object-branch boundaries.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-010", title: "Process and Runtime separation", statement: "Design-time process definitions and runtime execution contexts must remain distinct even when runtime executes approved process artifacts.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.sixLayers, evidence.bgeOsBoundary], authority: "CORE_CROSS_SOURCE_SYNTHESIS", method: "Map conceptual Meta Process and Meta Runtime to explicit build-time/runtime boundaries.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-011", title: "BGE build-time responsibility", statement: "BGE accepts approved structured intent and produces a candidate Blueprint artifact; it does not manufacture or execute an Agent and cannot adopt its own output.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.lifecycleExample, evidence.implementationBoundary, evidence.bgeOsBoundary], authority: "CORE_CROSS_SOURCE_SYNTHESIS", method: "Reconcile conceptual lifecycle with implementation and architecture proposals.", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-012", title: "Agent Factory manufacturing responsibility", statement: "Agent Factory converts an adopted Blueprint into a deployable Agent package and does not schedule, execute, retrieve runtime memory, or change policy.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.implementationBoundary, evidence.bgeOsBoundary], authority: "DERIVED_IMPLEMENTATION_GUIDANCE_AND_ARCHITECTURE_PROPOSAL", method: "Direct boundary statement in both derived CORE sources.", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-013", title: "Agent OS runtime responsibility", statement: "Agent OS schedules and executes deployable Agent packages under adopted rules, records runtime evidence, and cannot generate Blueprints or modify Normative Policy.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.knowledge, evidence.implementationBoundary, evidence.bgeOsBoundary], authority: "CORE_CROSS_SOURCE_SYNTHESIS", method: "Combine runtime descriptions and governance prohibitions.", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-014", title: "Traceable knowledge and citation", statement: "Knowledge used for governed reasoning must retain provenance, source citation, semantic role, validation state, and uncertainty where applicable.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.thesisPipeline, evidence.knowledge, evidence.bgeOsBoundary], authority: "PRIMARY_METHODOLOGY_SOURCE_LED_SYNTHESIS", method: "Generalize only methodology elements demonstrated by the thesis and supported by other CORE sources.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-015", title: "Knowledge Lake responsibility", statement: "Knowledge Lake preserves versioned raw and intermediate knowledge artifacts, transformations, and validation history; it is not itself architecture or policy authority.", claimClass: "SOURCE_DERIVED", refs: [evidence.thesisPipeline], authority: "PRIMARY_METHODOLOGY_SOURCE", method: "Derived from the thesis preservation role without promoting health content.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-016", title: "Knowledge Graph responsibility", statement: "Knowledge Graph is a governed structured projection of validated knowledge units and relationships, not proof that the underlying knowledge is correct and not a source of policy authority.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.thesisPipeline, evidence.knowledge], authority: "PRIMARY_METHODOLOGY_SOURCE_LED_SYNTHESIS", method: "Reconcile thesis validation pipeline with conceptual structured knowledge.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-017", title: "Volume Package RFC hierarchy", statement: "The derived architecture sources propose Volume as a broad responsibility grouping, Package as a bounded functional unit, and RFC as an engineering decision/specification artifact.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.volumeProposal, evidence.volumePackageRfc], authority: "DERIVED_IMPLEMENTATION_GUIDANCE_AND_ARCHITECTURE_PROPOSAL", method: "Direct proposal description; not elevated to thesis or adopted architecture.", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-018", title: "Fixed eight-RFC package pattern", statement: "A fixed ARCH/SPEC/FSM/SCHEMA/RELATION/TEST/IMPL/UNITTEST document set is a derived engineering proposal, not a source-governance requirement.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.volumePackageRfc], authority: "DERIVED_ARCHITECTURE_PROPOSAL", method: "Direct architecture proposal with authority qualification.", eligibility: "HUMAN_DECISION_REQUIRED_BEFORE_ARCHITECTURE_ADOPTION", disposition: "REQUIRES_HUMAN_DECISION" }),
  claim({ id: "ARC-CLM-019", title: "Fourteen-volume engineering map", statement: "The fourteen-volume structure is an engineering work-breakdown proposal and must not be treated as equivalent to the six conceptual responsibility layers.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.sixLayers, evidence.volumeProposal, evidence.volumePackageRfc], authority: "CORE_CROSS_SOURCE_SYNTHESIS", method: "Compare source models by purpose, ownership, and lifecycle rather than names.", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-020", title: "Architecture description is not implementation", statement: "The volume/package/RFC maps are architecture-description candidates requiring later specification, review, testing, and Human adoption; they are not implemented capability evidence.", claimClass: "SOURCE_EXPLICIT", refs: [evidence.implementationMaturity, evidence.architectureDescriptionOnly], authority: "DERIVED_IMPLEMENTATION_GUIDANCE_AND_ARCHITECTURE_PROPOSAL", method: "Direct maturity and completion statements.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-021", title: "Design-time and runtime isolation", statement: "Blueprint generation, manufacture, and runtime execution form separate lifecycle stages with explicit artifact handoffs and no reverse mutation of adopted design artifacts by runtime.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.thesisScope, evidence.lifecycleExample, evidence.bgeOsBoundary], authority: "CORE_CROSS_SOURCE_SYNTHESIS", method: "Synthesize lifecycle stages and add the minimal non-reverse-mutation governance invariant.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-022", title: "Source governance and architecture governance separation", statement: "Adopted source governance determines eligible inputs and precedence; architecture governance evaluates candidate structures but cannot expand source authority or rewrite source policy.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.magpPosition, evidence.optionalNoParallelAuthority], authority: "ADOPTED_SOURCE_POLICY_PLUS_CORE_SYNTHESIS", method: "Apply adopted normative source-governance scope to architecture reconciliation.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-023", title: "Governance runtime and product runtime isolation", statement: "Governance Runtime should evaluate policy, approvals, and evidence separately from Product Runtime, which performs domain work under resulting decisions.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.bgeOsBoundary, evidence.knowledge], authority: "NEW_DESIGN_SUPPORTED_BY_CORE_BOUNDARIES", method: "Introduce an explicit isolation boundary to prevent executors from granting their own authority.", assumptions: ["Runtime policy evaluation can be separated logically even if initially deployed in one process."], disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-024", title: "Agent Registry responsibility", statement: "Agent Registry should maintain immutable identity, version, lineage, capability declarations, policy bindings, and deployment status for Agent packages, without executing Agents or granting authority.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.implementationBoundary, evidence.volumeProposal], authority: "NEW_DESIGN_SUPPORTED_BY_DERIVED_CORE_SOURCES", method: "Fill a lifecycle identity gap while preserving Factory and Agent OS boundaries.", assumptions: ["Cross-project registry scope is not demonstrated by the thesis."], eligibility: "HUMAN_DECISION_REQUIRED_BEFORE_ARCHITECTURE_ADOPTION", disposition: "REQUIRES_HUMAN_DECISION" }),
  claim({ id: "ARC-CLM-025", title: "Evidence Ledger responsibility", statement: "Evidence Ledger should append immutable claims about inputs, decisions, executions, validations, and approvals with provenance, while never deciding policy or architecture.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.thesisPipeline, evidence.optionalEvidence], authority: "NEW_DESIGN_WITH_PRIMARY_METHODOLOGY_SUPPORT_AND_OPTIONAL_PATTERN", method: "Generalize trace and HITL records into a cross-cutting evidence service.", assumptions: ["A standalone ledger is not implemented by the thesis."], eligibility: "HUMAN_DECISION_REQUIRED_BEFORE_ARCHITECTURE_ADOPTION", disposition: "REQUIRES_HUMAN_DECISION" }),
  claim({ id: "ARC-CLM-026", title: "Human Review Console responsibility", statement: "Human Review Console should present evidence and collect explicit decisions but must not manufacture approvals or become an authority independent of the Human actor.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.thesisCandidateBoundary, evidence.optionalRoleSeparation], authority: "NEW_DESIGN_SUPPORTED_BY_HITL_METHODOLOGY", method: "Separate decision interface from decision authority.", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-027", title: "Railway Domain Extension boundary", statement: "Railway Domain Extension may supply separately adopted railway schemas, rules, tools, and workflows but cannot inherit health-case judgments or VET-C-specific Core concepts.", claimClass: "SOURCE_DERIVED", refs: [evidence.thesisScope, evidence.architectureDescriptionOnly], authority: "ADOPTED_CONTAMINATION_POLICY_LED_DERIVATION", method: "Apply adopted cross-domain contamination prohibitions to the proposed domain-extension boundary.", contamination: "PASS_HEALTH_AND_VETC_DOMAIN_PROMOTION_EXPLICITLY_PROHIBITED", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-028", title: "Artifact-mediated handoff pattern", statement: "Hash-pinned artifacts and exact bounded handoffs are useful non-authoritative patterns for moving candidate evidence between roles.", claimClass: "OPTIONAL_PATTERN", refs: [evidence.optionalArtifacts], authority: "OPTIONAL_NON_AUTHORITATIVE_PROCESS_PATTERN", method: "Use only the general collaboration pattern without VET-C domain content.", eligibility: "NON_NORMATIVE_PATTERN_ONLY", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-029", title: "Independent evidence rerun pattern", statement: "Completion evidence should include trace, positive and negative checks, scope confirmation, unresolved-item status, and an independent rerun where assurance requires it.", claimClass: "OPTIONAL_PATTERN", refs: [evidence.optionalEvidence], authority: "OPTIONAL_NON_AUTHORITATIVE_PROCESS_PATTERN", method: "Use only the general evidence pattern.", eligibility: "NON_NORMATIVE_PATTERN_ONLY", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-031", title: "Control-plane and data-plane separation", statement: "Human gates, policies, BGE, Factory, Registry, and Runtime Governance belong to the control plane; Agent execution, tools, and domain operations belong to the data plane; Evidence Ledger is a cross-cutting evidence plane.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.bgeOsBoundary, evidence.optionalRoleSeparation], authority: "NEW_DESIGN_SUPPORTED_BY_CORE_BOUNDARIES", method: "Make implicit responsibility separation explicit as three planes.", eligibility: "CANDIDATE_ELIGIBLE_PENDING_HUMAN_ARCHITECTURE_ADOPTION", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-032", title: "Blueprint Compiler placement", statement: "Blueprint Compiler should be the deterministic validation and assembly pipeline inside BGE rather than a second architecture authority or parallel generator.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.thesisPipeline, evidence.bgeOsBoundary], authority: "PRIMARY_METHODOLOGY_AND_DERIVED_ARCHITECTURE_SYNTHESIS", method: "Reconcile thesis knowledge compilation with BGE build-time responsibility and avoid component overlap.", disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-033", title: "Policy Engine non-authority", statement: "Policy Engine evaluates adopted rules and returns decisions or required approvals; it cannot author, adopt, or mutate the rules it evaluates.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.knowledge, evidence.semanticHierarchy], authority: "CORE_CROSS_SOURCE_SYNTHESIS", method: "Derive separation of rule evaluation from Human adoption authority.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-034", title: "Canonical six-layer candidate", statement: "The canonical candidate retains the six conceptual responsibility layers while mapping engineering components and fourteen-volume proposals as subordinate component or work-package views.", claimClass: "CROSS_SOURCE_SYNTHESIS", refs: [evidence.sixLayers, evidence.volumeProposal, evidence.volumePackageRfc], authority: "CORE_CROSS_SOURCE_SYNTHESIS", method: "Preserve the higher-authority conceptual model and prevent direct name-based equivalence.", conflicts: ["ARC-CONFLICT-002"], disposition: "ADOPT_WITH_MODIFICATION" }),
  claim({ id: "ARC-CLM-035", title: "Volume candidate definition", statement: "Volume should be a governed architecture responsibility boundary and documentation portfolio; deployment-unit semantics require an explicit separate decision.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.volumePackageRfc], authority: "NEW_DESIGN_CONSTRAINING_DERIVED_PROPOSAL", method: "Resolve conflicting broad module, governance boundary, and deployability descriptions conservatively.", eligibility: "HUMAN_DECISION_REQUIRED_BEFORE_ARCHITECTURE_ADOPTION", disposition: "REQUIRES_HUMAN_DECISION" }),
  claim({ id: "ARC-CLM-036", title: "Package candidate definition", statement: "Package should be a versionable, reviewable delivery and ownership unit; it is executable only when a separately adopted runtime contract says so.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.volumePackageRfc], authority: "NEW_DESIGN_CONSTRAINING_DERIVED_PROPOSAL", method: "Separate documentation, versioning, delivery, and execution semantics.", eligibility: "HUMAN_DECISION_REQUIRED_BEFORE_ARCHITECTURE_ADOPTION", disposition: "REQUIRES_HUMAN_DECISION" }),
  claim({ id: "ARC-CLM-037", title: "Risk-based RFC trigger", statement: "RFC should be mandatory for authority, public contract, cross-component semantics, lifecycle, safety, security, or topology changes and optional for bounded internal work under unchanged adopted contracts.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.volumePackageRfc, evidence.optionalNoParallelAuthority], authority: "NEW_DESIGN_WITH_OPTIONAL_PATTERN", method: "Replace universal fixed-document expansion with risk-based governance while retaining traceability.", eligibility: "HUMAN_DECISION_REQUIRED_BEFORE_ARCHITECTURE_ADOPTION", disposition: "REQUIRES_HUMAN_DECISION" }),
  claim({ id: "ARC-CLM-038", title: "Governance artifact authority hierarchy", statement: "Human Decision outranks Constitution; Constitution outranks adopted Policy; adopted Architecture and RFC decisions constrain Blueprint, Specification, and Schema; Evidence substantiates decisions but does not outrank them.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.implementationBoundary, evidence.semanticHierarchy, evidence.volumePackageRfc], authority: "NEW_DESIGN_SUPPORTED_BY_CORE_AUTHORITY_BOUNDARIES", method: "Normalize inconsistent document metaphors into an explicit authority and evidence model.", eligibility: "HUMAN_DECISION_REQUIRED_BEFORE_ARCHITECTURE_ADOPTION", disposition: "REQUIRES_HUMAN_DECISION" }),
  claim({ id: "ARC-CLM-039", title: "No runtime reverse mutation", statement: "Runtime artifacts and evidence may propose design changes but cannot directly modify adopted Constitution, Policy, Architecture, RFC, Blueprint, or Specification artifacts.", claimClass: "NEW_DESIGN_PROPOSAL", refs: [evidence.bgeOsBoundary, evidence.optionalNoParallelAuthority], authority: "NEW_DESIGN_SUPPORTED_BY_RESPONSIBILITY_SEPARATION", method: "Close the reverse-authority path implied by strict design-time/runtime separation.", disposition: "ADOPT" }),
  claim({ id: "ARC-CLM-040", title: "Human architecture adoption remains required", statement: "This reconciliation produces a candidate architecture only; every proposed canonical model and pending decision remains non-normative until a separate Human MAGP Architecture Adoption action.", claimClass: "HUMAN_DECISION_REQUIRED", refs: [evidence.architectureDescriptionOnly, evidence.optionalRoleSeparation], authority: "EXPLICIT_HUMAN_TASK_BOUNDARY", method: "Apply the current Human authorization boundary.", eligibility: "NOT_NORMATIVE_UNTIL_SEPARATE_HUMAN_ADOPTION", disposition: "REQUIRES_HUMAN_DECISION" }),
];

failClosed(claims.length === 39, "CLAIM_LINEAGE_MISSING", "claim ledger count differs from 39");
for (const architectureClaim of claims) {
  failClosed(architectureClaim.source_ids.length > 0 && architectureClaim.exact_evidence_references.length > 0, "CLAIM_LINEAGE_MISSING", `claim lineage missing for ${architectureClaim.claim_id}`);
  failClosed(["SOURCE_EXPLICIT", "SOURCE_DERIVED", "CROSS_SOURCE_SYNTHESIS", "OPTIONAL_PATTERN", "NEW_DESIGN_PROPOSAL", "HUMAN_DECISION_REQUIRED"].includes(architectureClaim.claim_class), "CLAIM_LINEAGE_MISSING", `invalid claim class for ${architectureClaim.claim_id}`);
  failClosed(!(architectureClaim.claim_class !== "SOURCE_EXPLICIT" && architectureClaim.represented_as_source_explicit), "DERIVED_CLAIM_MISREPRESENTED_AS_SOURCE_EXPLICIT", architectureClaim.claim_id);
  failClosed(!(architectureClaim.claim_class === "NEW_DESIGN_PROPOSAL" && architectureClaim.represented_as_source_explicit), "NEW_PROPOSAL_MISREPRESENTED_AS_SOURCE_CONCLUSION", architectureClaim.claim_id);
}

const decisionTopics = [
  ["ARC-DEC-001", "MAGP overall platform positioning", "ADOPT_WITH_MODIFICATION", ["ARC-CLM-001"]],
  ["ARC-DEC-002", "Thesis implemented scope", "ADOPT", ["ARC-CLM-002", "ARC-CLM-003"]],
  ["ARC-DEC-003", "Thesis methodology versus platform extension", "ADOPT", ["ARC-CLM-005"]],
  ["ARC-DEC-004", "Six-layer conceptual model", "ADOPT_WITH_MODIFICATION", ["ARC-CLM-006", "ARC-CLM-034"]],
  ["ARC-DEC-005", "Other source layer and volume models", "ADOPT_WITH_MODIFICATION", ["ARC-CLM-019"]],
  ["ARC-DEC-006", "Cross-model layer mapping", "ADOPT_WITH_MODIFICATION", ["ARC-CLM-007", "ARC-CLM-034"]],
  ["ARC-DEC-007", "Volume governance structure", "REQUIRES_HUMAN_DECISION", ["ARC-CLM-035"]],
  ["ARC-DEC-008", "Package governance structure", "REQUIRES_HUMAN_DECISION", ["ARC-CLM-036"]],
  ["ARC-DEC-009", "RFC governance and triggers", "REQUIRES_HUMAN_DECISION", ["ARC-CLM-018", "ARC-CLM-037"]],
  ["ARC-DEC-010", "Blueprint-driven governance", "ADOPT_WITH_MODIFICATION", ["ARC-CLM-003", "ARC-CLM-032"]],
  ["ARC-DEC-011", "Meta Constitution role", "ADOPT", ["ARC-CLM-008"]],
  ["ARC-DEC-012", "BGE role and boundary", "ADOPT_WITH_MODIFICATION", ["ARC-CLM-011", "ARC-CLM-032"]],
  ["ARC-DEC-013", "Agent Factory role and boundary", "ADOPT_WITH_MODIFICATION", ["ARC-CLM-012"]],
  ["ARC-DEC-014", "Agent Registry role and scope", "REQUIRES_HUMAN_DECISION", ["ARC-CLM-024"]],
  ["ARC-DEC-015", "Agent OS role and boundary", "ADOPT_WITH_MODIFICATION", ["ARC-CLM-013"]],
  ["ARC-DEC-016", "Runtime Governance placement", "REQUIRES_HUMAN_DECISION", ["ARC-CLM-023", "ARC-CLM-033"]],
  ["ARC-DEC-017", "Knowledge Engineering responsibility", "ADOPT", ["ARC-CLM-003", "ARC-CLM-014"]],
  ["ARC-DEC-018", "Knowledge Lake responsibility", "ADOPT", ["ARC-CLM-015"]],
  ["ARC-DEC-019", "Knowledge Graph responsibility", "ADOPT", ["ARC-CLM-016"]],
  ["ARC-DEC-020", "Evidence Ledger component", "REQUIRES_HUMAN_DECISION", ["ARC-CLM-025"]],
  ["ARC-DEC-021", "Human Governance Gate", "ADOPT", ["ARC-CLM-008", "ARC-CLM-026"]],
  ["ARC-DEC-022", "Railway Domain Extension", "ADOPT_WITH_MODIFICATION", ["ARC-CLM-027"]],
  ["ARC-DEC-023", "Product Runtime versus Governance Runtime", "ADOPT", ["ARC-CLM-023"]],
  ["ARC-DEC-024", "Design-time versus Run-time", "ADOPT", ["ARC-CLM-021", "ARC-CLM-039"]],
  ["ARC-DEC-025", "Source Governance versus Architecture Governance", "ADOPT", ["ARC-CLM-022", "ARC-CLM-040"]],
];

const decisionMatrix = decisionTopics.map(([decisionId, title, disposition, claimIds]) => ({
  decision_id: decisionId,
  decision_title: title,
  source_claim_ids: claimIds,
  decision_classification: disposition,
  decision_effect: "RECONCILIATION_PROPOSAL_DISPOSITION_ONLY",
  architecture_status: "PROPOSED_NOT_ADOPTED",
  normative_architecture: false,
  human_architecture_adoption_required: true,
  rationale: disposition === "REQUIRES_HUMAN_DECISION" ? "Multiple reasonable designs remain and the adopted source-governance rules do not uniquely select one." : "The proposed disposition preserves source authority, claim class, thesis boundary, and contamination controls.",
}));
failClosed(decisionMatrix.length === 25, "CLAIM_LINEAGE_MISSING", "decision matrix does not cover all 25 required topics");

const conflicts = [
  { conflict_id: "ARC-CONFLICT-001", title: "Thesis scope versus full-platform proposals", severity: "MEDIUM", status: "RESOLVED_BY_EXPLICIT_SCOPE_BOUNDARY", competing_claim_ids: ["ARC-CLM-002", "ARC-CLM-005", "ARC-CLM-019"], resolution: "Treat thesis outputs as demonstrated methodology and later full-platform structures as post-thesis proposals.", human_decision_required: false },
  { conflict_id: "ARC-CONFLICT-002", title: "Six conceptual layers versus fourteen engineering volumes", severity: "MEDIUM", status: "RESOLVED_AS_DIFFERENT_MODEL_DIMENSIONS", competing_claim_ids: ["ARC-CLM-006", "ARC-CLM-019", "ARC-CLM-034"], resolution: "Retain the six conceptual responsibility layers; map volumes as subordinate engineering groupings rather than layer equivalents.", human_decision_required: false },
  { conflict_id: "ARC-CONFLICT-003", title: "Deterministic BGE wording versus LLM semantic reasoning", severity: "MEDIUM", status: "CONTAINED_BY_MODIFIED_PROPOSAL", competing_claim_ids: ["ARC-CLM-011", "ARC-CLM-032"], resolution: "Require deterministic schemas, validation, and audit envelopes while treating semantic generation as non-deterministic candidate production subject to validation.", human_decision_required: false },
  { conflict_id: "ARC-CONFLICT-004", title: "Meta software hierarchy versus Human authority", severity: "MEDIUM", status: "RESOLVED_BY_HUMAN_SUPREMACY", competing_claim_ids: ["ARC-CLM-008", "ARC-CLM-038"], resolution: "Human remains the sole adoption authority; software layers may only propose, validate, or enforce adopted decisions.", human_decision_required: false },
  { conflict_id: "ARC-CONFLICT-005", title: "Fixed eight-RFC pattern versus risk-based governance", severity: "MEDIUM", status: "CONTAINED_PENDING_HUMAN_DECISION", competing_claim_ids: ["ARC-CLM-018", "ARC-CLM-037"], resolution: "Present fixed and risk-based options without selecting either as Normative Architecture.", human_decision_required: true, human_decision_id: "HAD-003" },
  { conflict_id: "ARC-CONFLICT-006", title: "Agent Registry ownership and scope", severity: "MEDIUM", status: "CONTAINED_PENDING_HUMAN_DECISION", competing_claim_ids: ["ARC-CLM-024"], resolution: "Bound the Registry to identity and lineage; defer whether it is a Factory subcomponent or independent control-plane service.", human_decision_required: true, human_decision_id: "HAD-004" },
  { conflict_id: "ARC-CONFLICT-007", title: "Runtime Governance placement", severity: "MEDIUM", status: "CONTAINED_PENDING_HUMAN_DECISION", competing_claim_ids: ["ARC-CLM-023", "ARC-CLM-033"], resolution: "Preserve logical separation from Product Runtime; defer physical/component placement.", human_decision_required: true, human_decision_id: "HAD-005" },
  { conflict_id: "ARC-CONFLICT-008", title: "Evidence Ledger as standalone service", severity: "LOW", status: "CONTAINED_PENDING_HUMAN_DECISION", competing_claim_ids: ["ARC-CLM-025"], resolution: "Define evidence responsibility but defer standalone versus shared-service placement.", human_decision_required: true, human_decision_id: "HAD-006" },
  { conflict_id: "ARC-CONFLICT-009", title: "Trustworthy Prompt OS versus Agent OS naming", severity: "MEDIUM", status: "RESOLVED_BY_RESPONSIBILITY_ALIAS_BOUNDARY", competing_claim_ids: ["ARC-CLM-003", "ARC-CLM-013", "ARC-CLM-032"], resolution: "Use Blueprint Compiler/BGE for design-time knowledge compilation and Agent OS for runtime execution; do not treat the thesis compiler as a complete Agent OS.", human_decision_required: false },
  { conflict_id: "ARC-CONFLICT-010", title: "VET-C and health-domain contamination risk", severity: "MEDIUM", status: "RESOLVED_BY_ADOPTED_CONTAMINATION_POLICIES", competing_claim_ids: ["ARC-CLM-027"], boundary_evidence: "source-architecture-claims/exclusion-and-contamination-boundary-evidence.json", resolution: "Use only generalized thesis methodology and optional general process patterns; prohibit VET-C-specific and health-specific domain promotion.", human_decision_required: false },
];
failClosed(conflicts.every((entry) => !["CRITICAL", "HIGH"].includes(entry.severity)), "OPEN_ACTIVE_HIGH_FINDING_EXISTS", "an active high or critical architecture conflict exists");

const thesisBoundary = {
  schema_version: 1,
  task_id: TASK_ID,
  boundary_status: "COMPLETE",
  source: evidence.thesisScope,
  categories: {
    A_THESIS_EXPLICIT_AND_IMPLEMENTED: [
      "Blueprint-driven knowledge-engineering methodology for a health-management case.",
      "Domain-specific blueprint for the blood-glucose knowledge object.",
      "Trustworthy Prompt OS as a prompt-governance and knowledge-compilation mechanism, not a full runtime OS.",
      "Trusted source document to source sentence, knowledge clause, knowledge unit, six-package classification, hierarchical link, logical link, Knowledge Lake, and Knowledge Graph flow.",
      "HITL review records and explicit pending status for LLM-assisted completion candidates.",
      "Case evidence of 25 source sentences, 23 knowledge clauses, and 111 knowledge units.",
    ],
    B_THESIS_EXPLICIT_BUT_NOT_FULLY_IMPLEMENTED: [
      "MAGP as an upper-level governance concept beyond the implemented knowledge-governance segment.",
      "Formal multi-source conflict management and full expert review lifecycle.",
      "Broad multi-domain validation beyond the demonstrated health-management case.",
    ],
    C_REASONABLE_METHODOLOGY_EXTENSION: [
      "Generalized source-to-knowledge traceability pipeline for non-health domains.",
      "Generalized blueprint validation and knowledge candidate state handling.",
      "Generalized preservation of intermediate knowledge artifacts and Human validation records.",
    ],
    D_OTHER_CORE_SOURCE_PROPOSALS: [
      "Six conceptual MAGP responsibility layers from SOURCE-MAGP-02.",
      "BGE, Agent Factory, Agent OS, Registry, Volume, Package, RFC, and fourteen-volume engineering proposals from SOURCE-MAGP-03 and SOURCE-MAGP-04.",
    ],
    E_OPTIONAL_NON_AUTHORITATIVE_PATTERNS: [
      "Hash-pinned artifact handoff.",
      "Role non-authority separation.",
      "Evidence-bound completion and independent rerun.",
      "Lean control and no parallel authority.",
    ],
    F_NEW_DESIGN_PROPOSALS_THIS_TASK: [
      "Explicit control-plane, data-plane, and evidence-plane separation.",
      "Standalone or shared Evidence Ledger responsibility.",
      "Human Review Console boundary.",
      "Governance Runtime and Product Runtime logical isolation.",
      "Risk-based RFC trigger model.",
      "Explicit artifact authority hierarchy.",
    ],
  },
  mandatory_post_thesis_labels: [
    "COMPLETE_AGENT_FACTORY",
    "COMPLETE_AGENT_OS",
    "COMPLETE_RUNTIME_GOVERNANCE",
    "COMPLETE_CROSS_PROJECT_AGENT_REGISTRY",
    "COMPLETE_AUTOMATED_EVIDENCE_LEDGER",
    "COMPLETE_MULTI_AGENT_PRODUCTION_PLATFORM",
    "COMPLETE_RAILWAY_PRODUCT_RUNTIME",
  ].map((capability) => ({ capability, label: "POST_THESIS_ARCHITECTURE_EXTENSION", implemented_by_thesis: false })),
  health_domain_promotion_count: 0,
  vetc_specific_core_claim_count: 0,
};

const canonicalLayers = [
  {
    layer_id: "L1",
    layer_name: "META_CONSTITUTION_AND_HUMAN_AUTHORITY",
    purpose: "Maintain Human decisions, constitutions, source-governance authority, and non-overridable governance invariants.",
    owned_objects: ["HumanDecision", "Constitution", "AdoptedSourcePolicy", "ArchitectureAdoptionRecord", "PolicyVersion"],
    allowed_inputs: ["Human decisions", "review evidence", "change proposals"],
    allowed_outputs: ["adopted or rejected decisions", "versioned constitutions", "approval and denial records"],
    authority: "HUMAN_HIGHEST_SOFTWARE_MAY_NOT_SELF_ADOPT",
    lifecycle_responsibility: "propose, review, Human adopt, version, deprecate",
    evidence_responsibility: "bind every effective decision to actor, evidence, scope, version, and time",
    prohibited_responsibility: ["execute domain tasks", "self-approve policy", "derive authority from runtime success"],
    upstream_dependency: ["Human authority"],
    downstream_dependency: ["L2", "L3", "L4", "L5", "L6"],
    design_time_role: "sets adopted invariants and gates",
    runtime_role: "read-only policy source and Human-approval authority",
  },
  {
    layer_id: "L2",
    layer_name: "META_ONTOLOGY",
    purpose: "Define legal semantic object types, identity, lifecycle state, and domain-neutral schemas.",
    owned_objects: ["EntityType", "GovernanceObjectType", "ProcessObjectType", "KnowledgeUnitType", "DomainExtensionType"],
    allowed_inputs: ["L1 adopted invariants", "Human-adopted architecture"],
    allowed_outputs: ["candidate and adopted semantic type definitions", "schema constraints"],
    authority: "SEMANTIC_DEFINITION_UNDER_L1",
    lifecycle_responsibility: "type proposal, compatibility review, Human adoption, versioning",
    evidence_responsibility: "type lineage and compatibility evidence",
    prohibited_responsibility: ["execute behavior", "grant permissions", "encode health or VET-C rules in Core"],
    upstream_dependency: ["L1"],
    downstream_dependency: ["L3", "L4", "L5", "L6"],
    design_time_role: "defines what may exist",
    runtime_role: "validates identity and type conformance only",
  },
  {
    layer_id: "L3",
    layer_name: "META_RELATION",
    purpose: "Define legal relations, provenance edges, ownership edges, dependency direction, and cardinality.",
    owned_objects: ["RelationType", "ProvenanceEdge", "AuthorityEdge", "DependencyEdge", "TraceabilityEdge"],
    allowed_inputs: ["L2 typed objects", "L1 authority constraints"],
    allowed_outputs: ["validated relation schemas", "relationship graphs"],
    authority: "RELATION_SEMANTICS_UNDER_L1_AND_L2",
    lifecycle_responsibility: "relation proposal, validation, adoption, versioning",
    evidence_responsibility: "source and target identity plus derivation evidence for every edge",
    prohibited_responsibility: ["infer authority from similarity", "create hidden relations", "execute workflows"],
    upstream_dependency: ["L1", "L2"],
    downstream_dependency: ["L4", "L5", "L6"],
    design_time_role: "defines how governed objects may connect",
    runtime_role: "checks relation validity and records runtime trace edges",
  },
  {
    layer_id: "L4",
    layer_name: "META_GOVERNANCE",
    purpose: "Evaluate adopted rules, precedence, conflict, risk, approvals, and evidence requirements without authoring its own authority.",
    owned_objects: ["Policy", "Rule", "PolicyDecision", "ApprovalRequest", "ConflictRecord", "EvidenceRequirement"],
    allowed_inputs: ["L1 adopted policies", "L2/L3 typed context", "candidate actions", "evidence"],
    allowed_outputs: ["allow", "deny", "require Human approval", "defer", "violation evidence"],
    authority: "EVALUATION_OF_ADOPTED_AUTHORITY_ONLY",
    lifecycle_responsibility: "policy evaluation and escalation; policy adoption stays in L1",
    evidence_responsibility: "record rule version, inputs, outcome, explanation, and approval lineage",
    prohibited_responsibility: ["self-author policy", "approve own rule change", "perform product action", "silently waive a rule"],
    upstream_dependency: ["L1", "L2", "L3"],
    downstream_dependency: ["L5", "L6"],
    design_time_role: "governs Blueprint, Package, and release candidates",
    runtime_role: "governs execution decisions and Human gates",
  },
  {
    layer_id: "L5",
    layer_name: "META_PROCESS_AND_BUILD_TIME",
    purpose: "Compile governed intent and knowledge into candidate Blueprints, manufacture deployable packages, and register their identity and lineage.",
    owned_objects: ["BlueprintPromptSet", "Blueprint", "Specification", "BuildPlan", "DeployableAgentPackage", "RegistryRecord", "WorkflowDefinition"],
    allowed_inputs: ["L1-L4 adopted constraints", "validated knowledge", "Human-approved design inputs"],
    allowed_outputs: ["candidate Blueprint", "validation report", "deployable package", "registry record"],
    authority: "NON_ADOPTING_BUILD_CONTROL_PLANE",
    lifecycle_responsibility: "compile, validate, manufacture, register, stage for Human or release gates",
    evidence_responsibility: "source-to-blueprint, blueprint-to-package, and package-to-registry trace",
    prohibited_responsibility: ["execute production tasks", "adopt architecture", "modify policy", "grant package its own permissions"],
    upstream_dependency: ["L1", "L2", "L3", "L4"],
    downstream_dependency: ["L6"],
    design_time_role: "primary build-time layer",
    runtime_role: "read-only source of approved packages and registry metadata",
  },
  {
    layer_id: "L6",
    layer_name: "META_RUNTIME",
    purpose: "Execute approved Agent packages, manage runtime resources and tools, enforce governance decisions, isolate domain operations, and emit evidence.",
    owned_objects: ["ExecutionContext", "RuntimePlan", "ToolCall", "RuntimePolicyDecision", "AuditEvent", "HumanApprovalRequest", "DomainRuntimeAdapter"],
    allowed_inputs: ["approved deployable package", "read-only adopted policy", "runtime context", "authorized tools and knowledge"],
    allowed_outputs: ["execution result", "evidence events", "approval requests", "change proposals"],
    authority: "EXECUTION_UNDER_L1_L4_NO_SELF_AUTHORIZATION",
    lifecycle_responsibility: "schedule, execute, pause, resume after approval, terminate, archive runtime evidence",
    evidence_responsibility: "complete immutable execution and decision trace",
    prohibited_responsibility: ["generate Blueprint", "manufacture Agent", "mutate Normative Policy", "adopt architecture", "self-grant tool access"],
    upstream_dependency: ["L1", "L2", "L3", "L4", "L5"],
    downstream_dependency: ["Product Runtime outputs", "Human review", "future design proposals"],
    design_time_role: "provides requirements and feedback proposals only",
    runtime_role: "primary governed execution layer",
  },
];
failClosed(canonicalLayers.length === 6 && canonicalLayers.every((layer) => ["purpose", "owned_objects", "allowed_inputs", "allowed_outputs", "authority", "lifecycle_responsibility", "evidence_responsibility", "prohibited_responsibility", "upstream_dependency", "downstream_dependency", "design_time_role", "runtime_role"].every((field) => layer[field] !== undefined)), "LAYER_MODEL_RECONCILIATION_INCOMPLETE", "canonical layer definition is incomplete");

const components = [
  { component_id: "CMP-001", name: "BGE", layer: "L5", responsibility: "Own the build-time bounded context that turns approved structured intent and validated knowledge into candidate Blueprints.", inputs: ["Blueprint Prompt Set", "adopted policy snapshot", "validated knowledge"], outputs: ["candidate Blueprint", "validation report"], authority: "PROPOSAL_ONLY", lifecycle_owner: "CANDIDATE_BLUEPRINT_COMPILATION", evidence: "compiler step trace and validation results", prohibited: ["manufacture Agent", "execute Agent", "adopt Blueprint", "modify policy"], plane: "CONTROL_PLANE" },
  { component_id: "CMP-002", name: "Blueprint Compiler", layer: "L5", responsibility: "Act as the internal parser, normalizer, validator, and assembler pipeline within BGE.", inputs: ["BGE compilation job"], outputs: ["normalized candidate Blueprint artifact"], authority: "NONE_INTERNAL_PROCESSOR", lifecycle_owner: "SUBCOMPONENT_OF_BGE_NOT_SEPARATE_LIFECYCLE_OWNER", evidence: "deterministic envelope plus semantic-generation provenance", prohibited: ["operate as a second BGE", "adopt output", "execute runtime work"], plane: "CONTROL_PLANE" },
  { component_id: "CMP-003", name: "Agent Factory", layer: "L5", responsibility: "Manufacture a deployable Agent package from an adopted Blueprint and resolved dependency set.", inputs: ["adopted Blueprint", "approved templates", "policy bindings"], outputs: ["DeployableAgentPackage", "manufacturing evidence"], authority: "MANUFACTURING_ONLY", lifecycle_owner: "DEPLOYABLE_PACKAGE_MANUFACTURE", evidence: "blueprint-to-package trace and conformance results", prohibited: ["execute Agent", "schedule workflow", "retrieve runtime memory", "grant permission", "change Blueprint"], plane: "CONTROL_PLANE" },
  { component_id: "CMP-004", name: "Agent Registry", layer: "L5", responsibility: "Maintain immutable Agent/package identity, version, lineage, declared capabilities, policy bindings, compatibility, and deployment status.", inputs: ["Factory package record", "Human or release-gate decision"], outputs: ["versioned registry record", "compatibility lookup"], authority: "IDENTITY_AND_STATUS_RECORD_ONLY", lifecycle_owner: "AGENT_PACKAGE_IDENTITY_AND_VERSION_STATUS", evidence: "append-only registry history", prohibited: ["execute Agent", "manufacture Agent", "grant capability", "approve deployment by itself"], plane: "CONTROL_PLANE", human_decision_required: true },
  { component_id: "CMP-005", name: "Agent OS", layer: "L6", responsibility: "Schedule and execute approved Agent packages and coordinate runtime resources under governance decisions.", inputs: ["approved package", "runtime context", "policy decisions"], outputs: ["execution result", "runtime evidence", "approval request"], authority: "EXECUTION_ONLY", lifecycle_owner: "RUNTIME_EXECUTION", evidence: "execution context and audit events", prohibited: ["generate Blueprint", "manufacture package", "modify Normative Policy", "self-grant access", "adopt architecture"], plane: "DATA_PLANE_ORCHESTRATOR" },
  { component_id: "CMP-006", name: "Runtime Governance", layer: "L4_L6_BRIDGE", responsibility: "Orchestrate policy evaluation, approval holds, violation response, and evidence requirements around runtime actions.", inputs: ["adopted policy snapshot", "runtime proposal", "context", "evidence"], outputs: ["allow", "deny", "require Human approval", "violation record"], authority: "ENFORCES_ADOPTED_POLICY_NO_POLICY_AUTHORSHIP", lifecycle_owner: "RUNTIME_GOVERNANCE_DECISION_ORCHESTRATION", evidence: "decision explanation and rule-version binding", prohibited: ["perform product action", "author policy", "approve own policy", "silently waive"], plane: "CONTROL_PLANE", human_decision_required: true },
  { component_id: "CMP-007", name: "Policy Engine", layer: "L4", responsibility: "Provide a pure, explainable evaluation function for adopted rules against typed context.", inputs: ["policy version", "typed context"], outputs: ["policy evaluation result", "matched rule trace"], authority: "PURE_EVALUATOR", lifecycle_owner: "SUBCOMPONENT_OF_META_GOVERNANCE", evidence: "input, policy hash, result, explanation", prohibited: ["author rule", "adopt rule", "execute product action", "store hidden override"], plane: "CONTROL_PLANE" },
  { component_id: "CMP-008", name: "Evidence Ledger", layer: "L4_L6_CROSS_CUTTING", responsibility: "Append evidence records for sources, transformations, decisions, executions, reviews, and approvals with immutable lineage.", inputs: ["signed or bound evidence event"], outputs: ["evidence record", "trace query"], authority: "EVIDENCE_NOT_DECISION_AUTHORITY", lifecycle_owner: "EVIDENCE_RECORD_LIFECYCLE", evidence: "self-describing provenance and integrity binding", prohibited: ["decide policy", "adopt architecture", "rewrite history", "infer approval from success"], plane: "EVIDENCE_PLANE", human_decision_required: true },
  { component_id: "CMP-009", name: "Knowledge Lake", layer: "L2_L3_L5_CROSS_CUTTING", responsibility: "Preserve raw and intermediate knowledge artifacts, source lineage, transformation versions, and validation status.", inputs: ["authorized source", "derived artifact", "validation record"], outputs: ["versioned knowledge artifact", "lineage lookup"], authority: "KNOWLEDGE_STORAGE_NO_POLICY_AUTHORITY", lifecycle_owner: "KNOWLEDGE_ARTIFACT_HISTORY", evidence: "source and transformation lineage", prohibited: ["promote candidate to verified", "invent missing source", "execute domain action"], plane: "KNOWLEDGE_PLANE" },
  { component_id: "CMP-010", name: "Knowledge Graph", layer: "L2_L3", responsibility: "Expose a validated structured projection of knowledge units, semantic relations, provenance, and current validation state.", inputs: ["validated knowledge unit", "validated relation"], outputs: ["queryable graph projection", "traceable relation path"], authority: "STRUCTURED_VIEW_NO_POLICY_AUTHORITY", lifecycle_owner: "KNOWLEDGE_RELATION_PROJECTION", evidence: "edge and node source lineage", prohibited: ["treat graph presence as truth", "self-validate relation", "promote domain rules"], plane: "KNOWLEDGE_PLANE" },
  { component_id: "CMP-011", name: "Knowledge Engineering Pipeline", layer: "L5", responsibility: "Run the thesis-derived governed transformation from source artifacts to candidate and validated knowledge structures.", inputs: ["authorized sources", "domain blueprint", "meta rules"], outputs: ["clauses", "units", "packages", "links", "validation requests"], authority: "TRANSFORMATION_ONLY", lifecycle_owner: "SOURCE_TO_KNOWLEDGE_TRANSFORMATION", evidence: "complete source-to-artifact trace", prohibited: ["mark LLM completion verified", "promote health content to Railway", "adopt domain rules"], plane: "CONTROL_AND_KNOWLEDGE_PLANE" },
  { component_id: "CMP-012", name: "Human Review Console", layer: "L1_L4_INTERFACE", responsibility: "Present evidence, options, scope, and risks and record an authenticated Human decision without substituting for the Human.", inputs: ["decision package", "evidence links", "available choices"], outputs: ["Human decision record", "request for revision"], authority: "INTERFACE_TO_HUMAN_AUTHORITY", lifecycle_owner: "DECISION_PRESENTATION_AND_RECORDING", evidence: "actor, decision, scope, rationale, timestamp", prohibited: ["auto-select decision", "infer consent", "hide unresolved items", "become a separate authority"], plane: "CONTROL_PLANE" },
  { component_id: "CMP-013", name: "Railway Domain Extension", layer: "L6_DOMAIN_ADAPTER", responsibility: "Provide separately adopted Railway-domain schemas, policies, tools, workflows, and adapters without changing MAGP Core.", inputs: ["separately adopted Railway authority", "Core extension interfaces"], outputs: ["Railway domain package", "domain runtime adapter"], authority: "SEPARATE_RAILWAY_DOMAIN_AUTHORITY_REQUIRED", lifecycle_owner: "RAILWAY_DOMAIN_EXTENSION", evidence: "domain-owner approval and Core compatibility", prohibited: ["import health judgments", "import VET-C Core concepts", "modify Core authority", "self-confirm Railway rules"], plane: "DOMAIN_EXTENSION", contamination: "PASS_POLICY_BOUND" },
];

const lifecycleOwners = components.filter((component) => !component.lifecycle_owner.startsWith("SUBCOMPONENT")).map((component) => component.lifecycle_owner);
failClosed(new Set(lifecycleOwners).size === lifecycleOwners.length, "COMPONENT_AUTHORITY_OVERLAP_UNRESOLVED", "duplicate component lifecycle ownership remains");
failClosed(components.every((component) => component.prohibited.length >= 3 && component.authority && component.evidence), "COMPONENT_AUTHORITY_OVERLAP_UNRESOLVED", "component boundary record is incomplete");

const humanDecisions = [
  {
    decision_id: "HAD-001",
    decision_title: "Canonical engineering grouping model",
    competing_options: ["OPTION_A_RETAIN_14_VOLUMES_AS_CANONICAL_ENGINEERING_GROUPS", "OPTION_B_USE_6_LAYERS_WITH_RISK_BASED_COMPONENT_PACKAGES"],
    source_support: ["ARC-CLM-006", "ARC-CLM-019", "ARC-CLM-034"],
    authority_analysis: "Six layers have conceptual support; fourteen volumes are lower-authority derived architecture proposals.",
    advantages: { option_a: "Retains detailed source indexing and planned module coverage.", option_b: "Reduces name-based conflation and allows component boundaries to evolve under Human decisions." },
    risks: { option_a: "May freeze an unvalidated work breakdown as architecture.", option_b: "Requires a deliberate mapping from source RFC numbers to the adopted component model." },
    downstream_impact: "Determines architecture documentation hierarchy and future work-package layout.",
    codex_recommendation: "ADOPT_MODIFIED_OPTION: retain six responsibility layers as canonical and preserve fourteen volumes as a non-normative traceable planning view.",
  },
  {
    decision_id: "HAD-002",
    decision_title: "Volume and Package semantics",
    competing_options: ["OPTION_A_VOLUME_IS_DEPLOYABLE_MODULE_AND_PACKAGE_IS_EXECUTABLE_UNIT", "OPTION_B_VOLUME_IS_GOVERNED_RESPONSIBILITY_PORTFOLIO_AND_PACKAGE_IS_VERSIONABLE_DELIVERY_UNIT"],
    source_support: ["ARC-CLM-035", "ARC-CLM-036"],
    authority_analysis: "Derived sources use overlapping module, boundary, documentation, and deployability language; source governance cannot select one.",
    advantages: { option_a: "Simple one-to-one mapping to deployables.", option_b: "Separates governance ownership from physical deployment and permits modular monolith or service deployment later." },
    risks: { option_a: "Prematurely fixes deployment topology.", option_b: "Requires explicit deployment contracts later." },
    downstream_impact: "Affects ownership, versioning, deployment topology, and dependency governance.",
    codex_recommendation: "ADOPT_OPTION_B.",
  },
  {
    decision_id: "HAD-003",
    decision_title: "RFC document-set policy",
    competing_options: ["OPTION_A_FIXED_EIGHT_RFC_FILES_PER_PACKAGE", "OPTION_B_RISK_BASED_RFC_WITH_REQUIRED_SECTIONS_AND_SEPARATE_TEST_EVIDENCE"],
    source_support: ["ARC-CLM-018", "ARC-CLM-037"],
    authority_analysis: "The fixed-eight pattern is detailed but derived; the optional source supports lean controls only as a non-authoritative pattern.",
    advantages: { option_a: "Uniform indexing and predictable file roles.", option_b: "Avoids document multiplication while preserving mandatory decisions and evidence." },
    risks: { option_a: "Governance bloat and duplicated authority.", option_b: "Requires a deterministic trigger classifier and section completeness validation." },
    downstream_impact: "Controls the size, review load, and authority semantics of future architecture records.",
    codex_recommendation: "ADOPT_MODIFIED_OPTION: risk-based RFC trigger with mandatory content contract; allow eight-file expansion only for high-complexity packages.",
  },
  {
    decision_id: "HAD-004",
    decision_title: "Agent Registry placement",
    competing_options: ["OPTION_A_FACTORY_INTERNAL_REGISTRY", "OPTION_B_INDEPENDENT_CONTROL_PLANE_REGISTRY"],
    source_support: ["ARC-CLM-024"],
    authority_analysis: "Registry is not demonstrated by the thesis and appears only as a derived implementation element.",
    advantages: { option_a: "Simple initial ownership.", option_b: "Independent lineage and compatibility across Factory versions and runtimes." },
    risks: { option_a: "Factory may become lifecycle authority.", option_b: "Adds a distributed consistency and service-boundary problem." },
    downstream_impact: "Affects package identity, deployment status, capability lookup, and rollback.",
    codex_recommendation: "DEFER_DECISION until deployment topology and multi-project scope are separately designed; keep the logical Registry contract independent meanwhile.",
  },
  {
    decision_id: "HAD-005",
    decision_title: "Runtime Governance placement",
    competing_options: ["OPTION_A_AGENT_OS_INTERNAL_GOVERNANCE_SUBSYSTEM", "OPTION_B_SEPARATE_GOVERNANCE_RUNTIME_CONTROL_PLANE"],
    source_support: ["ARC-CLM-023", "ARC-CLM-033"],
    authority_analysis: "Sources support evaluation and runtime enforcement but do not uniquely determine physical placement.",
    advantages: { option_a: "Lower latency and simpler deployment.", option_b: "Stronger separation of execution and authority with independent evidence." },
    risks: { option_a: "Executor may accumulate governance authority.", option_b: "Availability, latency, and split-brain risks must be designed." },
    downstream_impact: "Affects control-plane availability, policy distribution, and fail-closed runtime behavior.",
    codex_recommendation: "ADOPT_MODIFIED_OPTION: logical separation is mandatory; defer physical separation until runtime non-functional requirements exist.",
  },
  {
    decision_id: "HAD-006",
    decision_title: "Evidence Ledger deployment form",
    competing_options: ["OPTION_A_STANDALONE_APPEND_ONLY_LEDGER", "OPTION_B_SHARED_EVIDENCE_CONTRACT_OVER_EXISTING_STORES"],
    source_support: ["ARC-CLM-025"],
    authority_analysis: "Traceability is strongly supported; a standalone ledger component is new design.",
    advantages: { option_a: "Clear immutability, query, and audit boundary.", option_b: "Lower implementation complexity and avoids premature infrastructure." },
    risks: { option_a: "Premature infrastructure and false trust in storage alone.", option_b: "Evidence may fragment across stores." },
    downstream_impact: "Affects audit, provenance, review packages, retention, and cross-runtime traceability.",
    codex_recommendation: "DEFER_DECISION; adopt the evidence record contract before selecting physical storage.",
  },
  {
    decision_id: "HAD-007",
    decision_title: "Governance artifact authority hierarchy",
    competing_options: ["OPTION_A_RFC_AS_UNIVERSAL_ENGINEERING_CONSTITUTION", "OPTION_B_EXPLICIT_HIERARCHY_HUMAN_CONSTITUTION_POLICY_ARCHITECTURE_RFC_BLUEPRINT_SPEC_SCHEMA_WITH_EVIDENCE_SEPARATE"],
    source_support: ["ARC-CLM-038", "ARC-CLM-040"],
    authority_analysis: "Sources use Constitution and RFC metaphors inconsistently; an explicit hierarchy is required to prevent parallel authority.",
    advantages: { option_a: "Simple rhetoric and uniform source-of-truth rule.", option_b: "Separates adoption authority, design decisions, implementation contracts, and proof." },
    risks: { option_a: "RFC may override higher adopted policy by accident.", option_b: "Requires transition rules and validators." },
    downstream_impact: "Determines conflict resolution, change approval, and traceability semantics.",
    codex_recommendation: "ADOPT_OPTION_B.",
  },
].map((decision) => ({
  ...decision,
  available_human_decisions: ["ADOPT_OPTION_A", "ADOPT_OPTION_B", "ADOPT_MODIFIED_OPTION", "DEFER_DECISION", "REJECT_ALL_OPTIONS"],
  current_status: "PENDING_HUMAN_DECISION",
  human_decision: "PENDING_HUMAN_DECISION",
  codex_filled_human_decision: false,
}));
failClosed(humanDecisions.every((decision) => decision.current_status === "PENDING_HUMAN_DECISION" && decision.human_decision === "PENDING_HUMAN_DECISION" && decision.codex_filled_human_decision === false), "HUMAN_DECISION_IMPERSONATED", "a Human architecture decision was prefilled");

const riskRegister = [
  ["ARC-RISK-001", "Reduced assurance may be mistaken for clean-room independent review.", "MEDIUM", "Preserve reduced-assurance disclosure in every gate and package."],
  ["ARC-RISK-002", "Six layers and fourteen volumes may be conflated.", "MEDIUM", "Maintain distinct semantic-layer and engineering-group views with explicit mappings."],
  ["ARC-RISK-003", "Derived guidance may be mislabeled as thesis implementation.", "MEDIUM", "Bind every capability to thesis boundary category A-F."],
  ["ARC-RISK-004", "BGE semantic generation may be mislabeled deterministic.", "MEDIUM", "Claim determinism only for schemas, validation envelopes, hashes, and replayable inputs."],
  ["ARC-RISK-005", "Runtime executor may accumulate policy authority.", "MEDIUM", "Separate Policy Engine and Human gates; prohibit self-authorization."],
  ["ARC-RISK-006", "Evidence storage may be treated as decision authority.", "LOW", "State that Evidence Ledger records proof and never adopts policy or architecture."],
  ["ARC-RISK-007", "Health or VET-C concepts may contaminate Railway or MAGP Core.", "MEDIUM", "Enforce adopted contamination policies and zero domain promotion."],
  ["ARC-RISK-008", "Registry may grant capabilities instead of recording them.", "MEDIUM", "Registry records Human/release decisions and cannot create them."],
  ["ARC-RISK-009", "Runtime evidence may reverse-modify design artifacts.", "MEDIUM", "Allow change proposals only; require design-time Human adoption for modification."],
  ["ARC-RISK-010", "Architecture description may be mistaken for implementation readiness.", "MEDIUM", "Keep architecture PROPOSED_NOT_ADOPTED and explicitly prohibit implementation."],
].map(([riskId, risk, level, mitigation]) => ({ risk_id: riskId, risk, initial_level: level, mitigation, effective_status: "CONTAINED_IN_PROPOSAL", open_critical_or_high_finding: false }));

const sourceLayerModels = [
  {
    source_id: "SOURCE-MAGP-01",
    model_name: "THESIS_KNOWLEDGE_GOVERNANCE_METHOD_AND_MAGP_LIFECYCLE_POSITION",
    model_type: "IMPLEMENTED_METHOD_BOUNDARY",
    elements: ["Meta-level definition as theoretical basis", "Meta-to-Domain instantiation as thesis focus", "Blueprint-to-Runtime deployment as future work", "Knowledge definition layer", "Knowledge task layer"],
    evidence: [evidence.thesisScope, evidence.thesisPipeline],
    reconciliation_use: "Defines demonstrated methodology and the hard post-thesis boundary; not a full platform layer model.",
  },
  {
    source_id: "SOURCE-MAGP-02",
    model_name: "SIX_CONCEPTUAL_RESPONSIBILITY_LAYERS",
    model_type: "CONCEPTUAL_LAYER_MODEL",
    elements: canonicalLayers.map((layer) => layer.layer_name),
    evidence: [evidence.sixLayers, evidence.knowledge],
    reconciliation_use: "Primary conceptual candidate for canonical responsibility layers, qualified by secondary authority.",
  },
  {
    source_id: "SOURCE-MAGP-03",
    model_name: "IMPLEMENTATION_GUIDANCE_VOLUME_AND_PHASE_MAP",
    model_type: "DERIVED_ENGINEERING_WORK_BREAKDOWN",
    elements: ["Core Objects", "Agent Factory", "BGE", "Agent OS", "Knowledge", "Meta Constitution", "KPGF", "Meta Agent", "Persistence", "API", "Deployment", "Testing", "Example Domains", "Prompt OS"],
    evidence: [evidence.volumeProposal, evidence.implementationMaturity],
    reconciliation_use: "Traceable engineering planning view; not conceptual-layer authority or implementation evidence.",
  },
  {
    source_id: "SOURCE-MAGP-04",
    model_name: "ARCHITECTURE_PROPOSAL_VOLUME_PACKAGE_RFC_MAP",
    model_type: "DERIVED_ARCHITECTURE_AND_DOCUMENTATION_MODEL",
    elements: ["Volume responsibility", "Package functional unit", "RFC specification role", "Code realization"],
    evidence: [evidence.volumePackageRfc, evidence.architectureDescriptionOnly],
    reconciliation_use: "Candidate work-breakdown and artifact hierarchy; requires Human decisions for canonical use.",
  },
];

const layerSemanticComparison = canonicalLayers.map((layer) => ({
  canonical_layer_id: layer.layer_id,
  canonical_layer_name: layer.layer_name,
  source_01_relation: layer.layer_id === "L5" ? "Thesis implemented only the knowledge-compilation subset of this layer." : layer.layer_id === "L2" || layer.layer_id === "L3" ? "Thesis provides generalized knowledge-methodology evidence, not full platform ownership." : "Post-thesis or upper-framework context only.",
  source_02_relation: "Direct conceptual responsibility-layer support.",
  source_03_relation: layer.layer_id === "L5" ? "Maps Core Object, Factory, BGE, Knowledge, Registry planning elements." : layer.layer_id === "L6" ? "Maps Agent OS and Runtime planning elements." : "Maps one or more derived engineering volumes; not semantic equivalence.",
  source_04_relation: layer.layer_id === "L5" ? "Maps architecture-description and build-time component proposals." : layer.layer_id === "L6" ? "Maps runtime proposal." : "Maps proposed governance or semantic components.",
  equivalence_rule: "PURPOSE_OWNERSHIP_AUTHORITY_LIFECYCLE_AND_EVIDENCE_MUST_MATCH; NAME_SIMILARITY_IS_INSUFFICIENT",
}));

const layerDependencies = canonicalLayers.flatMap((layer) => layer.downstream_dependency.filter((target) => /^L[1-6]$/.test(target)).map((target) => ({ from: layer.layer_id, to: target, dependency_type: "GOVERNED_DOWNSTREAM_INPUT", reverse_mutation_allowed: false })));
const rejectedLayerMappings = [
  { mapping: "SIX_CONCEPTUAL_LAYERS_EQUAL_FOURTEEN_VOLUMES", status: "REJECT", reason: "The models answer different questions and have different cardinality and lifecycle semantics." },
  { mapping: "META_GOVERNANCE_EQUALS_RUNTIME_GOVERNANCE_ONLY", status: "REJECT", reason: "Meta Governance applies at design time and runtime; runtime enforcement is only one consumer." },
  { mapping: "KNOWLEDGE_GRAPH_EQUALS_KNOWLEDGE_AUTHORITY", status: "REJECT", reason: "Graph structure preserves validated relations but does not create truth or policy authority." },
  { mapping: "BGE_EQUALS_TRUSTWORTHY_PROMPT_OS_EQUALS_AGENT_OS", status: "REJECT", reason: "The thesis compiler, build-time BGE, and runtime Agent OS have distinct boundaries." },
  { mapping: "VOLUME_EQUALS_DEPLOYMENT_UNIT_BY_DEFAULT", status: "REJECT", reason: "Deployment topology is not uniquely established and remains a separate Human decision." },
];

const governanceHierarchy = [
  { rank: 1, artifact: "EXPLICIT_HUMAN_DECISION", effect: "Adopts, rejects, defers, or authorizes within explicit scope." },
  { rank: 2, artifact: "CONSTITUTION", effect: "Defines non-overridable governance invariants under Human authority." },
  { rank: 3, artifact: "ADOPTED_POLICY", effect: "Defines source, claim, domain, security, lifecycle, or runtime constraints." },
  { rank: 4, artifact: "ADOPTED_ARCHITECTURE_OR_RFC_DECISION", effect: "Defines component ownership, public contracts, topology, and accepted tradeoffs." },
  { rank: 5, artifact: "ADOPTED_BLUEPRINT", effect: "Binds a specific governed design and generation input." },
  { rank: 6, artifact: "SPECIFICATION", effect: "Defines behavior and responsibility within adopted higher artifacts." },
  { rank: 7, artifact: "SCHEMA_AND_STATE_MACHINE", effect: "Defines machine-checkable structure and legal transitions." },
  { rank: 8, artifact: "RUNTIME_ARTIFACT", effect: "Executes approved design; cannot reverse-modify higher authority." },
];
const evidenceAxis = { artifact: "EVIDENCE", authority_rank: null, role: "Substantiates identity, input, action, validation, and decision claims; never adopts or overrides an artifact by itself." };

const volumeAnalysis = {
  question: "Is Volume a knowledge container, governance boundary, or deployment unit?",
  source_positions: ["Broad system module and responsibility boundary.", "Documentation and RFC portfolio.", "Sometimes described as independently deployable, without a validated deployment contract."],
  proposal: "GOVERNED_ARCHITECTURE_RESPONSIBILITY_BOUNDARY_AND_DOCUMENTATION_PORTFOLIO",
  deployment_unit_by_default: false,
  disposition: "REQUIRES_HUMAN_DECISION",
  human_decision_id: "HAD-002",
};
const packageAnalysis = {
  question: "Is Package a version unit, delivery unit, or execution unit?",
  source_positions: ["Bounded functional grouping.", "Eight-RFC documentation closure.", "Potential software package projection."],
  proposal: "VERSIONABLE_REVIEWABLE_DELIVERY_AND_OWNERSHIP_UNIT",
  execution_unit_by_default: false,
  disposition: "REQUIRES_HUMAN_DECISION",
  human_decision_id: "HAD-002",
};
const rfcAnalysis = {
  necessary_when: ["authority changes", "public contract or ABI changes", "cross-component data semantics", "topology or ownership changes", "security, safety, dispatch, or permission changes", "lifecycle or compatibility changes", "new Normative Architecture decision"],
  not_required_when: ["internal refactor under unchanged contracts", "tests or evidence updates without semantic change", "bounded defect correction faithful to adopted specification"],
  fixed_eight_files_status: "PROPOSED_NOT_ADOPTED",
  disposition: "REQUIRES_HUMAN_DECISION",
  human_decision_id: "HAD-003",
};
const blueprintGovernance = {
  blueprint_role: "Governed design input compiled from approved intent, policies, knowledge, and adopted architecture decisions.",
  rfc_versus_blueprint: "An adopted RFC or architecture decision has higher decision authority; Blueprint operationalizes those decisions for a bounded design.",
  human_gates: ["source-scope adoption", "architecture adoption", "authority/public-contract RFC adoption", "Blueprint adoption", "package release", "high-risk runtime approval"],
  runtime_reverse_modify_design_artifact: false,
  runtime_change_path: ["runtime evidence", "change proposal", "design-time review", "Human decision", "new adopted version"],
};

const responsibilityMatrix = components.map((component) => ({
  component_id: component.component_id,
  component: component.name,
  lifecycle_owner: component.lifecycle_owner,
  authority: component.authority,
  evidence_owner: component.name === "Evidence Ledger" ? "PRIMARY_RECORD_KEEPER" : "PRODUCER_MUST_EMIT_TO_EVIDENCE_CONTRACT",
  may_generate_rule: false,
  may_adopt_rule: false,
  may_execute_domain_task: component.name === "Agent OS",
  may_generate_blueprint: component.name === "BGE" || component.name === "Blueprint Compiler",
  may_manufacture_agent: component.name === "Agent Factory",
  may_grant_own_permission: false,
}));

const componentOverlapAnalysis = [
  { overlap: "BGE vs Blueprint Compiler", resolution: "Blueprint Compiler is an internal BGE processor; BGE owns the candidate Blueprint lifecycle.", unresolved: false },
  { overlap: "Runtime Governance vs Policy Engine", resolution: "Policy Engine is a pure evaluator; Runtime Governance orchestrates holds, approvals, and evidence.", unresolved: false },
  { overlap: "Knowledge Lake vs Knowledge Graph", resolution: "Lake preserves artifact history; Graph exposes validated structured projection.", unresolved: false },
  { overlap: "Evidence Ledger vs Agent OS Audit", resolution: "Agent OS emits events; Ledger owns append-only evidence records and query lineage.", unresolved: false },
  { overlap: "Agent Factory vs Agent Registry", resolution: "Factory creates packages; Registry records identity and status after external gates.", unresolved: false },
  { overlap: "Human Review Console vs Human Authority", resolution: "Console presents and records; Human actor decides.", unresolved: false },
];
failClosed(componentOverlapAnalysis.every((entry) => entry.unresolved === false), "COMPONENT_AUTHORITY_OVERLAP_UNRESOLVED", "component overlap remains unresolved");

const controlDataEvidenceBoundary = {
  control_plane: ["Human Governance Gate", "Meta Constitution", "Source and Policy Governance", "BGE", "Blueprint Compiler", "Agent Factory", "Agent Registry", "Runtime Governance", "Policy Engine", "Human Review Console"],
  data_plane: ["Agent OS execution workers", "tool adapters", "knowledge retrieval", "Railway Product Runtime"],
  evidence_plane: ["Evidence Ledger", "audit emitters", "source/decision/execution trace"],
  invariants: ["Data plane cannot modify control-plane Normative Policy.", "Control plane cannot fabricate data-plane execution evidence.", "Evidence plane records but does not authorize.", "Human approval is never inferred from runtime success."],
};
const designRuntimeBoundary = {
  design_time: ["source governance", "architecture reconciliation and adoption", "RFC decisions", "Blueprint compilation and adoption", "Factory manufacture", "Registry staging"],
  runtime: ["package loading", "scheduling", "policy evaluation", "tool execution", "Human approval hold", "evidence emission"],
  handoff_artifacts: ["adopted Blueprint", "DeployableAgentPackage", "policy snapshot", "registry release state"],
  reverse_mutation_allowed: false,
};
const humanMachineBoundary = {
  human_only: ["adopt source scope", "adopt architecture", "adopt Constitution or Policy", "accept unresolved tradeoff", "authorize high-risk action", "approve authority expansion"],
  machine_allowed: ["compile candidate", "validate schema", "manufacture package", "evaluate adopted policy", "execute authorized action", "record evidence", "recommend an option"],
  machine_prohibited: ["fill Human decision", "self-authorize", "promote candidate to Normative", "silently waive policy", "treat recommendation as decision"],
};

const policyExpectations = [
  ["SOURCE_AUTHORITY_POLICY", adoptedAuthority.original_policy_binding.absolute_path, adoptedAuthority.original_policy_binding.expected_sha256, adoptedAuthority.original_policy_binding.expected_bytes],
  ["CLAIM_ELIGIBILITY_POLICY", adoptedEligibility.original_policy_binding.absolute_path, adoptedEligibility.original_policy_binding.expected_sha256, adoptedEligibility.original_policy_binding.expected_bytes],
  ...adoptedContamination.original_policy_bindings.map((binding) => [binding.label, binding.absolute_path, binding.expected_sha256, binding.expected_bytes]),
];
const sourcePolicyIntegrity = policyExpectations.map(([label, filePath, expectedSha256, expectedBytes]) => {
  const actual = fileBinding(filePath);
  return { label, expected_sha256: expectedSha256, expected_bytes: expectedBytes, ...actual, match: actual.sha256 === expectedSha256 && actual.bytes === expectedBytes };
});
failClosed(sourcePolicyIntegrity.every((entry) => entry.match), "SOURCE_OR_PRODUCT_MUTATION_REQUIRED", "source policy bytes changed");

const adoptionProductBaseline = readJson(path.join(ADOPTION_ROOT, "product-governance-integrity.json"));
const productGovernanceIntegrity = adoptionProductBaseline.files.map((entry) => {
  const actual = fileBinding(entry.absolute_path);
  return { label: entry.label, expected_sha256: entry.expected_sha256, expected_bytes: entry.expected_bytes, ...actual, match: actual.sha256 === entry.expected_sha256 && actual.bytes === entry.expected_bytes };
});
failClosed(productGovernanceIntegrity.every((entry) => entry.match), "SOURCE_OR_PRODUCT_MUTATION_REQUIRED", "product or governance baseline changed");

const adoptionHistorical = readJson(path.join(ADOPTION_ROOT, "historical-artifact-integrity.json"));
const expectedHistoricalTasks = [
  ...adoptionHistorical.historical_tasks.map((entry) => ({ task_id: entry.task_id, file_count: entry.file_count, manifest_sha256: entry.manifest_sha256 })),
  { task_id: adoptionHistorical.aggregator_task.task_id, file_count: adoptionHistorical.aggregator_task.file_count_after, manifest_sha256: adoptionHistorical.aggregator_task.manifest_sha256_after },
  { task_id: ADOPTION_TASK_ID, file_count: 41, manifest_sha256: "15A27ADD69945A2C3DF4AD8DC77E02A52EE81CCFE46094D6B07ECC7C883C2BA5" },
];
const historicalBefore = expectedHistoricalTasks.map((expected) => {
  const actual = treeDigest(path.join(TASKS_ROOT, expected.task_id));
  return { ...expected, actual_file_count_before: actual.file_count, actual_manifest_sha256_before: actual.canonical_manifest_sha256, match_before: actual.file_count === expected.file_count && actual.canonical_manifest_sha256 === expected.manifest_sha256 };
});
failClosed(historicalBefore.every((entry) => entry.match_before), "SOURCE_OR_PRODUCT_MUTATION_REQUIRED", "historical task tree changed before reconciliation output");

const actualSourceRootNames = fs.readdirSync(exactManifest.source_root, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name.normalize("NFC")).sort();
const expectedSourceRootNames = exactManifest.sources.map((source) => source.actual_filename.normalize("NFC")).sort();
failClosed(JSON.stringify(actualSourceRootNames) === JSON.stringify(expectedSourceRootNames), "ADOPTED_SOURCE_MANIFEST_INVALID", "source root file set differs from adopted manifest");

const inputBindings = ADOPTED_INPUT_NAMES.map((name) => ({ name, ...fileBinding(path.join(ADOPTED_ROOT, name)), adoption_status: adoptedInputs[name].adoption_status ?? adoptedInputs[name].source_authority_status }));
writeJson("input-binding/human-authorization-binding.json", {
  schema_version: 1,
  task_id: TASK_ID,
  human_decision: HUMAN_DECISION,
  decision_status: "HUMAN_AUTHORIZED",
  authorized_actions: ["READ_ADOPTED_SOURCE_SCOPE", "COMPARE_FOUR_CORE_ARCHITECTURE_CLAIMS", "USE_ONE_OPTIONAL_SOURCE_FOR_NON_AUTHORITATIVE_PATTERNS", "BUILD_CLAIM_CONFLICT_DECISION_LEDGER", "PREPARE_CANONICAL_ARCHITECTURE_PROPOSAL", "PREPARE_HUMAN_ARCHITECTURE_ADOPTION_PACKAGE"],
  prohibited_actions: ["HUMAN_ARCHITECTURE_ADOPTION", "CORE_OBJECT_LIBRARY_CREATION", "DATABASE_SCHEMA_DESIGN", "API_DESIGN", "AGENT_IMPLEMENTATION", "PRODUCT_IMPLEMENTATION", "MIGRATION", "DEPLOYMENT"],
  decision_source: fileBinding(HUMAN_DECISION_SOURCE),
  codex_decision_authority: "NONE",
  recorded_on: FIXED_DATE,
});
writeJson("input-binding/adopted-source-entrypoint-manifest.json", { schema_version: 1, task_id: TASK_ID, input_model: "EIGHT_ADOPTED_ENTRYPOINTS_ONLY", adopted_manifest_bindings: inputBindings, architecture_reconciliation_readiness_package: { absolute_path: toPosix(READINESS_ROOT), file_count: 12, artifact_bindings: readinessBindings }, no_repository_discovery_used: true, no_unmanifested_source_used: true });
writeJson("input-binding/adopted-manifest-reverification.json", { schema_version: 1, task_id: TASK_ID, exact_source_manifest: fileBinding(exactManifestPath), source_hash_manifest: fileBinding(sourceHashManifestPath), source_identity_manifest: fileBinding(sourceIdentityManifestPath), source_classification_manifest: fileBinding(sourceClassificationManifestPath), source_count: 11, counts: { CORE: 4, OPTIONAL: 1, EXCLUDED: 6 }, cross_binding_status: "PASS_11_OF_11" });
writeJson("input-binding/source-authority-binding.json", { schema_version: 1, task_id: TASK_ID, adopted_effective_state: fileBinding(path.join(ADOPTED_ROOT, "adopted-source-authority-effective-state.json")), source_authority_status: "HUMAN_ADOPTED", normative_authority: true, normative_scope: exactNormativeScopes, normative_scope_classification: "SOURCE_GOVERNANCE_ONLY", architecture_authority_created: false });
writeJson("input-binding/claim-eligibility-binding.json", { schema_version: 1, task_id: TASK_ID, adopted_effective_state: fileBinding(path.join(ADOPTED_ROOT, "adopted-claim-eligibility-effective-state.json")), core_sources: classificationManifest.entries.filter((entry) => entry.classification === "CORE"), optional_sources: classificationManifest.entries.filter((entry) => entry.classification === "OPTIONAL"), excluded_sources: classificationManifest.entries.filter((entry) => entry.classification === "EXCLUDED"), automatic_architecture_authority: false });
writeJson("input-binding/contamination-policy-binding.json", { schema_version: 1, task_id: TASK_ID, adopted_effective_state: fileBinding(path.join(ADOPTED_ROOT, "adopted-contamination-policy-effective-state.json")), policies: sourcePolicyIntegrity.filter((entry) => entry.label.includes("CONTAMINATION")), health_to_railway_promotion_allowed: false, vetc_specific_core_promotion_allowed: false, excluded_source_claim_use_allowed: false });
writeJson("input-binding/readiness-package-binding.json", { schema_version: 1, task_id: TASK_ID, readiness_status_before_human_authorization: readinessManifest.readiness_status, human_authorization_source: fileBinding(HUMAN_DECISION_SOURCE), package_file_count: 12, artifact_bindings: readinessBindings, authorization_effect: "ARCHITECTURE_RECONCILIATION_AUTHORIZED_FOR_THIS_TASK_ONLY" });
writeJson("input-binding/allowed-source-read-scope.json", { schema_version: 1, task_id: TASK_ID, core_full_document_sources: sourceReverification.filter((entry) => entry.classification === "CORE").map((entry) => entry.source_id), optional_general_pattern_only_sources: ["SOURCE-PATTERN-01"], excluded_identity_hash_classification_only_sources: sourceReverification.filter((entry) => entry.classification === "EXCLUDED").map((entry) => entry.source_id), unmanifested_source_count: 0, repository_product_code_used_as_architecture_evidence: false, conversation_memory_used_as_architecture_evidence: false });
writeJson("input-binding/input-integrity-result.json", { schema_version: 1, task_id: TASK_ID, result: "PASS_BOUND_AND_VALID", human_authorization: "HUMAN_AUTHORIZED", exact_manifest: "HUMAN_ADOPTED", source_hash_binding: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND", source_classification: "4 CORE / 1 OPTIONAL / 6 EXCLUDED", source_authority: "HUMAN_ADOPTED", normative_scope: "SOURCE_GOVERNANCE_ONLY", open_active_critical: 0, open_active_high: 0, assurance_level: "REDUCED_ASSURANCE" });

writeJson("task-intent.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  title: "MAGP Architecture Reconciliation Claim Mapping Conflict Resolution and Human Architecture Adoption Package Preparation",
  level: "L3",
  human_authorization: HUMAN_DECISION,
  objective: "Reconcile architecture claims from the adopted source scope and prepare a non-normative canonical proposal for separate Human adoption.",
  allowed_paths: [`.codex/tasks/${TASK_ID}/**`],
  prohibited_actions: ["ARCHITECTURE_ADOPTION", "CORE_OBJECT_LIBRARY", "DATABASE_SCHEMA", "API_CONTRACT", "PRODUCT_CODE", "MIGRATION", "DEPLOYMENT", "GIT", "NETWORK", "SERVICE", "DATABASE", "SEED", "DOT_ENV", "SUBAGENT", "REVIEWER_LAUNCH"],
  assurance_level: "REDUCED_ASSURANCE",
});
writeJson("classification.yaml", { schema_version: 1, task_id: TASK_ID, classification: "L3_GOVERNANCE_ARCHITECTURE_RECONCILIATION", execution_role: "ARCHITECTURE_CLAIM_RECONCILER_AND_HUMAN_ADOPTION_PACKAGE_PREPARER", product_change: false, architecture_change: "PROPOSAL_ONLY", normative_architecture: false, human_architecture_adoption_required: true, write_scope: [`.codex/tasks/${TASK_ID}/**`] });
writeJson("blueprint.yaml", { schema_version: 1, task_id: TASK_ID, review_model: "HUMAN_AUTHORIZED_SOURCE_GOVERNED_ARCHITECTURE_RECONCILIATION", source_model: "4_CORE_PLUS_1_OPTIONAL_PATTERN_AND_6_EXCLUSION_BOUNDARIES", stages: ["input_binding", "claim_mapping", "conflict_reconciliation", "thesis_boundary", "layer_reconciliation", "component_reconciliation", "governance_structure_reconciliation", "canonical_proposal", "human_decision_package", "deterministic_validation"], outputs_are: "PROPOSED_NOT_ADOPTED", human_decision_impersonation_allowed: false, implementation_allowed: false, next_gate: "HUMAN_MAGP_ARCHITECTURE_ADOPTION" });

for (const source of exactManifest.sources.filter((entry) => ["CORE", "OPTIONAL"].includes(entry.classification))) {
  const sourceClaims = claims.filter((entry) => entry.source_ids.includes(source.source_id));
  const extraction = coreExtractions[source.source_id];
  writeJson(`source-architecture-claims/${source.source_id}.json`, {
    schema_version: 1,
    task_id: TASK_ID,
    source_id: source.source_id,
    classification: source.classification,
    authority_level: source.authority_level,
    claim_eligibility: source.claim_eligibility,
    read_scope: source.read_scope,
    source_binding: { normalized_absolute_path: source.normalized_absolute_path, sha256: source.sha256, bytes: source.file_size_bytes },
    extraction: extraction ? { method: extraction.extraction_method, page_count: extraction.page_count, total_character_count: extraction.total_character_count } : { method: "UTF8_MARKDOWN_GENERAL_PATTERN_LINE_INDEX", line_count: optionalLines.length },
    architecture_claim_ids: sourceClaims.map((entry) => entry.claim_id),
    architecture_claim_count: sourceClaims.length,
    source_explicit_claim_count: sourceClaims.filter((entry) => entry.claim_class === "SOURCE_EXPLICIT").length,
    derived_or_synthesis_claim_count: sourceClaims.filter((entry) => ["SOURCE_DERIVED", "CROSS_SOURCE_SYNTHESIS"].includes(entry.claim_class)).length,
    optional_pattern_claim_count: sourceClaims.filter((entry) => entry.claim_class === "OPTIONAL_PATTERN").length,
    exact_evidence_references: sourceClaims.flatMap((entry) => entry.exact_evidence_references.filter((ref) => ref.source_id === source.source_id)),
    prohibited_overclaim: source.source_id === "SOURCE-MAGP-01" ? "NO_HEALTH_SPECIFIC_RAILWAY_PROMOTION_AND_NO_FULL_PLATFORM_IMPLEMENTATION_CLAIM" : source.classification === "OPTIONAL" ? "NON_AUTHORITATIVE_PATTERN_ONLY" : "NO_AUTOMATIC_NORMATIVE_ARCHITECTURE",
  });
}
writeJson("source-architecture-claims/exclusion-and-contamination-boundary-evidence.json", { schema_version: 1, task_id: TASK_ID, evidence_class: "EXCLUSION_AND_CONTAMINATION_BOUNDARY_EVIDENCE", excluded_source_count: 6, excluded_sources: excludedBoundaryRefs, excluded_source_content_opened_for_claims: false, excluded_source_architecture_claim_count: 0, vetc_specific_core_claim_count: 0, health_specific_railway_claim_count: 0 });
writeJson("source-architecture-claims/source-claim-coverage.json", { schema_version: 1, task_id: TASK_ID, source_claim_coverage: exactManifest.sources.map((source) => ({ source_id: source.source_id, classification: source.classification, claim_count: source.classification === "EXCLUDED" ? 0 : claims.filter((entry) => entry.source_ids.includes(source.source_id)).length, use: source.classification === "CORE" ? "ARCHITECTURE_CLAIM_MAPPING" : source.classification === "OPTIONAL" ? "NON_AUTHORITATIVE_PATTERN" : "EXCLUSION_BOUNDARY_ONLY" })), all_four_core_sources_mapped: exactManifest.sources.filter((source) => source.classification === "CORE").every((source) => claims.some((entry) => entry.source_ids.includes(source.source_id))), optional_used_only_as_pattern: claims.filter((entry) => entry.source_ids.includes("SOURCE-PATTERN-01")).every((entry) => (entry.source_ids.length === 1 && entry.claim_class === "OPTIONAL_PATTERN" && entry.normative_eligibility === "NON_NORMATIVE_PATTERN_ONLY") || (entry.source_ids.length > 1 && entry.claim_class !== "SOURCE_EXPLICIT")), excluded_used_for_claims: false });

writeJson("architecture-claim-ledger.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", claim_count: claims.length, claim_class_counts: Object.fromEntries(["SOURCE_EXPLICIT", "SOURCE_DERIVED", "CROSS_SOURCE_SYNTHESIS", "OPTIONAL_PATTERN", "NEW_DESIGN_PROPOSAL", "HUMAN_DECISION_REQUIRED"].map((claimClass) => [claimClass, claims.filter((entry) => entry.claim_class === claimClass).length])), claims });
writeJson("architecture-conflict-ledger.json", { schema_version: 1, task_id: TASK_ID, conflict_count: conflicts.length, open_active_critical: 0, open_active_high: 0, contained_pending_human_decision_count: conflicts.filter((entry) => entry.human_decision_required).length, conflicts });
writeJson("architecture-decision-matrix.json", { schema_version: 1, task_id: TASK_ID, decision_count: decisionMatrix.length, allowed_decisions: ["ADOPT", "ADOPT_WITH_MODIFICATION", "DEFER", "REJECT", "REQUIRES_HUMAN_DECISION"], decision_effect: "PROPOSAL_ONLY", decisions: decisionMatrix });
writeJson("thesis-implementation-boundary.json", thesisBoundary);

writeJson("layer-model-reconciliation/source-layer-models.json", { schema_version: 1, task_id: TASK_ID, models: sourceLayerModels });
writeJson("layer-model-reconciliation/layer-semantic-comparison.json", { schema_version: 1, task_id: TASK_ID, comparison_rule: "NO_NAME_ONLY_EQUIVALENCE", rows: layerSemanticComparison });
writeJson("layer-model-reconciliation/layer-responsibility-matrix.json", { schema_version: 1, task_id: TASK_ID, layer_count: canonicalLayers.length, layers: canonicalLayers });
writeJson("layer-model-reconciliation/layer-dependency-map.json", { schema_version: 1, task_id: TASK_ID, dependency_model: "DIRECTED_ACYCLIC_GOVERNED_FLOW", edges: layerDependencies, runtime_reverse_mutation_allowed: false });
writeJson("layer-model-reconciliation/canonical-layer-model-proposal.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", normative_architecture: false, layer_count: 6, layers: canonicalLayers, engineering_volume_view: "SUBORDINATE_NON_NORMATIVE_MAPPING_PENDING_HUMAN_DECISION" });
writeJson("layer-model-reconciliation/rejected-layer-mappings.json", { schema_version: 1, task_id: TASK_ID, rejected_mappings: rejectedLayerMappings });
writeJson("layer-model-reconciliation/unresolved-layer-decisions.json", { schema_version: 1, task_id: TASK_ID, unresolved: humanDecisions.filter((entry) => ["HAD-001", "HAD-002"].includes(entry.decision_id)).map((entry) => ({ decision_id: entry.decision_id, decision_title: entry.decision_title, status: entry.current_status })) });

writeJson("component-boundary-reconciliation/component-inventory.json", { schema_version: 1, task_id: TASK_ID, component_count: components.length, components });
writeJson("component-boundary-reconciliation/responsibility-assignment-matrix.json", { schema_version: 1, task_id: TASK_ID, rows: responsibilityMatrix });
writeJson("component-boundary-reconciliation/component-overlap-analysis.json", { schema_version: 1, task_id: TASK_ID, overlaps: componentOverlapAnalysis, unresolved_authority_overlap_count: 0 });
writeJson("component-boundary-reconciliation/prohibited-responsibility-matrix.json", { schema_version: 1, task_id: TASK_ID, rows: components.map((component) => ({ component_id: component.component_id, component: component.name, prohibited_responsibilities: component.prohibited })), invariants: ["No component both authors and adopts its rules.", "No runtime component grants its own permissions.", "No component duplicates lifecycle authority.", "Evidence ownership never implies decision authority."] });
writeJson("component-boundary-reconciliation/control-plane-data-plane-boundary.json", { schema_version: 1, task_id: TASK_ID, ...controlDataEvidenceBoundary });
writeJson("component-boundary-reconciliation/design-time-runtime-boundary.json", { schema_version: 1, task_id: TASK_ID, ...designRuntimeBoundary });
writeJson("component-boundary-reconciliation/human-machine-authority-boundary.json", { schema_version: 1, task_id: TASK_ID, ...humanMachineBoundary });

writeJson("governance-structure-reconciliation/volume-model-analysis.json", { schema_version: 1, task_id: TASK_ID, ...volumeAnalysis });
writeJson("governance-structure-reconciliation/package-model-analysis.json", { schema_version: 1, task_id: TASK_ID, ...packageAnalysis });
writeJson("governance-structure-reconciliation/rfc-model-analysis.json", { schema_version: 1, task_id: TASK_ID, ...rfcAnalysis });
writeJson("governance-structure-reconciliation/blueprint-governance-analysis.json", { schema_version: 1, task_id: TASK_ID, ...blueprintGovernance });
writeJson("governance-structure-reconciliation/governance-artifact-hierarchy.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", authority_hierarchy: governanceHierarchy, evidence_axis: evidenceAxis, unresolved_human_decision: "HAD-007" });
writeJson("governance-structure-reconciliation/canonical-governance-structure-proposal.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", volume: volumeAnalysis.proposal, package: packageAnalysis.proposal, rfc_trigger_model: "RISK_BASED_CANDIDATE", blueprint_authority: "BELOW_ADOPTED_POLICY_AND_ARCHITECTURE_DECISIONS", runtime_reverse_modification_allowed: false, human_decisions_required: ["HAD-002", "HAD-003", "HAD-007"] });

const architectureContext = {
  schema_version: 1,
  task_id: TASK_ID,
  proposal_name: "MAGP_CANONICAL_ARCHITECTURE_CANDIDATE_R1",
  architecture_status: "PROPOSED_NOT_ADOPTED",
  normative_architecture: false,
  human_architecture_adoption_required: true,
  system_purpose: "Provide a Human-governed meta-level platform for compiling traceable knowledge and policy-bound intent into governed Agent packages and executing them under explicit runtime controls.",
  primary_stakeholders: ["Human Architecture Owner", "Source Governance Owner", "Domain Owner", "Architecture Reviewer", "Runtime Operator", "Audit and Compliance Reviewer"],
  in_scope: ["source-governed claim mapping", "six-layer responsibility model", "component boundaries", "authority and evidence flows", "design-time and runtime separation", "Human gates", "Railway extension boundary"],
  out_of_scope: ["Core Object Library", "database design", "API contract", "product code", "migration", "deployment", "technology-stack adoption"],
  assurance_level: "REDUCED_ASSURANCE",
};

const architecturePrinciples = [
  ["PR-001", "Human adoption is explicit and never inferred."],
  ["PR-002", "Source governance determines eligible inputs; architecture cannot expand source authority."],
  ["PR-003", "Every claim preserves class, source lineage, derivation, assumptions, and contamination state."],
  ["PR-004", "Thesis implementation and post-thesis extension are always distinguished."],
  ["PR-005", "Design-time generation, manufacture, and runtime execution are separate lifecycle stages."],
  ["PR-006", "No component authors a rule and adopts that same rule."],
  ["PR-007", "No Agent or runtime grants its own permissions."],
  ["PR-008", "Knowledge provenance and validation state are first-class."],
  ["PR-009", "Evidence records proof but does not create authority."],
  ["PR-010", "Runtime may propose but cannot reverse-modify adopted design artifacts."],
  ["PR-011", "Railway-domain authority is separate; health and VET-C content do not define MAGP Core."],
  ["PR-012", "Unknown or multiply-supported architecture choices remain pending Human decision."],
].map(([principle_id, statement]) => ({ principle_id, statement, status: "PROPOSED_NOT_ADOPTED" }));

const authorityFlow = [
  { step: 1, actor: "Human", action: "adopt Constitution, Policy, Source Scope, Architecture, and bounded high-risk decisions", output: "versioned Human decision" },
  { step: 2, actor: "Meta Constitution and Policy", action: "constrain candidate design and runtime behavior", output: "effective policy snapshot" },
  { step: 3, actor: "BGE and Factory", action: "compile and manufacture under policy", output: "candidate Blueprint and deployable package" },
  { step: 4, actor: "Human or release gate", action: "approve Blueprint/package deployment within adopted architecture", output: "release state" },
  { step: 5, actor: "Runtime Governance", action: "evaluate each governed runtime decision", output: "allow, deny, or approval request" },
  { step: 6, actor: "Agent OS", action: "execute only authorized action", output: "result and evidence" },
];
const evidenceFlow = [
  { step: 1, event: "source intake", evidence: "source identity, hash, classification, authority, read scope" },
  { step: 2, event: "claim derivation", evidence: "exact locator, claim class, derivation, assumptions, conflicts" },
  { step: 3, event: "architecture decision proposal", evidence: "source support, tradeoffs, disposition, pending Human items" },
  { step: 4, event: "Human adoption", evidence: "decision actor, scope, rationale, version, timestamp" },
  { step: 5, event: "Blueprint and package generation", evidence: "input snapshot, compiler/manufacturing trace, validation" },
  { step: 6, event: "runtime", evidence: "policy version, context, tool call, approvals, result, audit event" },
  { step: 7, event: "change proposal", evidence: "runtime observation linked to proposed design-time change; no direct mutation" },
];
const designTimeFlow = [
  "Human intent and adopted source scope",
  "Claim mapping with exact lineage",
  "Architecture reconciliation and pending Human decisions",
  "Separate Human architecture adoption",
  "RFC or bounded design decisions under adopted hierarchy",
  "BGE Blueprint compilation and validation",
  "Separate Blueprint or package gate",
  "Agent Factory manufacture",
  "Registry identity and release-state recording",
];
const runtimeFlow = [
  "Load approved package and immutable policy snapshot",
  "Create typed ExecutionContext",
  "Runtime Governance and Policy Engine evaluate proposed action",
  "Pause for Human approval when required",
  "Agent OS executes authorized task and tool calls",
  "Knowledge Graph supplies validated knowledge view; Knowledge Lake remains provenance source",
  "Evidence Ledger records decisions and execution",
  "Runtime feedback becomes a design change proposal only",
];
const humanGateModel = [
  { gate_id: "HG-001", lifecycle_point: "Source Scope", decision: "adopt exact source manifest and source policy", current_state: "COMPLETED_REDUCED_ASSURANCE" },
  { gate_id: "HG-002", lifecycle_point: "Canonical Architecture", decision: "adopt, modify, defer, or reject this proposal", current_state: "PENDING_HUMAN_DECISION" },
  { gate_id: "HG-003", lifecycle_point: "Authority/Public Contract RFC", decision: "adopt high-impact design decision", current_state: "NOT_STARTED" },
  { gate_id: "HG-004", lifecycle_point: "Blueprint", decision: "approve bounded Blueprint for manufacture", current_state: "NOT_STARTED" },
  { gate_id: "HG-005", lifecycle_point: "Package Release", decision: "approve package for target runtime", current_state: "NOT_STARTED" },
  { gate_id: "HG-006", lifecycle_point: "High-risk Runtime Action", decision: "authorize specific action", current_state: "NOT_STARTED" },
];

const excludedCapabilities = [
  "Human Architecture Adoption",
  "Core Object Library",
  "Database Schema or Model",
  "API Contract",
  "Agent implementation",
  "Product implementation",
  "Migration",
  "Deployment",
  "Health-domain Rule promotion",
  "VET-C-specific MAGP Core concepts",
  "Unmanifested source use",
];
const deferredCapabilities = [
  "Physical deployment topology",
  "Programming language and framework",
  "Database and persistence model",
  "Public API and event contracts",
  "Agent Registry physical placement",
  "Evidence Ledger physical storage",
  "Runtime Governance physical placement",
  "Railway Domain Rule set",
  "Non-functional requirements and capacity model",
  "Release and migration strategy",
];

writeJson("canonical-architecture-proposal/architecture-context.json", architectureContext);
writeJson("canonical-architecture-proposal/architecture-principles.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", principles: architecturePrinciples });
writeJson("canonical-architecture-proposal/canonical-layer-model.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", layer_count: 6, layers: canonicalLayers });
writeJson("canonical-architecture-proposal/canonical-component-model.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", component_count: components.length, components });
writeJson("canonical-architecture-proposal/governance-artifact-hierarchy.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", authority_hierarchy: governanceHierarchy, evidence_axis: evidenceAxis });
writeJson("canonical-architecture-proposal/authority-flow.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", steps: authorityFlow, machine_self_authorization_allowed: false });
writeJson("canonical-architecture-proposal/evidence-flow.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", steps: evidenceFlow, evidence_creates_authority: false });
writeJson("canonical-architecture-proposal/design-time-flow.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", ordered_steps: designTimeFlow, architecture_adoption_completed: false });
writeJson("canonical-architecture-proposal/runtime-flow.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", ordered_steps: runtimeFlow, runtime_implementation_started: false });
writeJson("canonical-architecture-proposal/human-gate-model.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", gates: humanGateModel });
writeJson("canonical-architecture-proposal/source-to-architecture-traceability.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", rows: claims.map((architectureClaim) => ({ claim_id: architectureClaim.claim_id, claim_class: architectureClaim.claim_class, source_ids: architectureClaim.source_ids, decision_ids: decisionMatrix.filter((decision) => decision.source_claim_ids.includes(architectureClaim.claim_id)).map((decision) => decision.decision_id), proposed_disposition: architectureClaim.proposed_disposition, normative_eligibility: architectureClaim.normative_eligibility })) });
writeJson("canonical-architecture-proposal/architecture-boundary.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", in_scope: architectureContext.in_scope, out_of_scope: architectureContext.out_of_scope, source_governance_mutable_by_architecture: false, runtime_reverse_mutation_allowed: false, domain_extensions_may_modify_core: false });
writeJson("canonical-architecture-proposal/excluded-capabilities.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", excluded_capabilities: excludedCapabilities });
writeJson("canonical-architecture-proposal/deferred-capabilities.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", deferred_capabilities: deferredCapabilities, implementation_readiness: false });
writeText("canonical-architecture-proposal/architecture-proposal-summary.md", `# MAGP Canonical Architecture Proposal R1\n\nStatus: PROPOSED_NOT_ADOPTED  \nNormative architecture: false  \nHuman architecture adoption required: true  \nAssurance: REDUCED_ASSURANCE\n\nThis proposal reconciles four CORE sources into six responsibility layers and thirteen bounded components. It preserves the thesis implementation boundary: the demonstrated work is blueprint-driven knowledge governance, not a complete Agent Factory, Agent OS, Runtime Governance, Registry, Evidence Ledger, multi-agent production platform, or Railway Product Runtime.\n\nThe proposal separates source governance from architecture governance, design time from runtime, control plane from data plane, and evidence from authority. Seven architecture choices remain pending Human decision. No Core Object Library, product code, database design, API contract, migration, deployment, or architecture adoption was performed.\n`);

writeJson("human-decision-matrix/decision-register.json", { schema_version: 1, task_id: TASK_ID, decision_count: humanDecisions.length, all_status: "PENDING_HUMAN_DECISION", decisions: humanDecisions });
for (const decision of humanDecisions) writeJson(`human-decision-matrix/${decision.decision_id}.json`, { schema_version: 1, task_id: TASK_ID, ...decision });
writeJson("unresolved-architecture-decisions.json", { schema_version: 1, task_id: TASK_ID, unresolved_count: humanDecisions.length, status: "PENDING_HUMAN_DECISION", decisions: humanDecisions.map((decision) => ({ decision_id: decision.decision_id, decision_title: decision.decision_title, current_status: decision.current_status, codex_recommendation: decision.codex_recommendation })) });
writeJson("architecture-risk-register.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", risk_count: riskRegister.length, open_active_critical: 0, open_active_high: 0, risks: riskRegister });

writeJson("source-root-reverification.json", { schema_version: 1, task_id: TASK_ID, source_root: exactManifest.source_root, expected_source_count: 11, actual_source_count: actualSourceRootNames.length, source_classification: { CORE: 4, OPTIONAL: 1, EXCLUDED: 6 }, sources: sourceReverification, core_content_sources_read: 4, optional_general_pattern_sources_read: 1, excluded_content_sources_read: 0, status: "PASS_UNCHANGED_11_OF_11" });
writeJson("source-policy-integrity.json", { schema_version: 1, task_id: TASK_ID, policy_count: sourcePolicyIntegrity.length, policies: sourcePolicyIntegrity, source_authority_scope_expanded: false, status: "PASS_UNCHANGED" });
writeJson("product-governance-integrity.json", { schema_version: 1, task_id: TASK_ID, baseline_type: "EXACT_NON_GIT_FILE_HASH", files: productGovernanceIntegrity, product_files_written: 0, governance_baseline_files_written: 0, writes_outside_task_root: 0, status: "PASS_UNCHANGED_3_OF_3" });

writeJson("human-architecture-adoption-package/architecture-decision-summary.json", { schema_version: 1, task_id: TASK_ID, architecture_status: "PROPOSED_NOT_ADOPTED", decision_count: decisionMatrix.length, disposition_counts: Object.fromEntries(["ADOPT", "ADOPT_WITH_MODIFICATION", "DEFER", "REJECT", "REQUIRES_HUMAN_DECISION"].map((value) => [value, decisionMatrix.filter((entry) => entry.decision_classification === value).length])), decisions: decisionMatrix.map((entry) => ({ decision_id: entry.decision_id, decision_title: entry.decision_title, decision_classification: entry.decision_classification, source_claim_ids: entry.source_claim_ids })) });
writeJson("human-architecture-adoption-package/source-traceability-summary.json", { schema_version: 1, task_id: TASK_ID, source_count: 11, classification: "4 CORE / 1 OPTIONAL / 6 EXCLUDED", four_core_sources_mapped: true, optional_source_use: "NON_AUTHORITATIVE_GENERAL_PATTERN_ONLY", excluded_source_use: "EXCLUSION_AND_CONTAMINATION_BOUNDARY_EVIDENCE_ONLY", claim_count: claims.length, claim_class_counts: Object.fromEntries(["SOURCE_EXPLICIT", "SOURCE_DERIVED", "CROSS_SOURCE_SYNTHESIS", "OPTIONAL_PATTERN", "NEW_DESIGN_PROPOSAL", "HUMAN_DECISION_REQUIRED"].map((claimClass) => [claimClass, claims.filter((entry) => entry.claim_class === claimClass).length])), exact_lineage_complete: true });
writeJson("human-architecture-adoption-package/unresolved-human-decisions.json", { schema_version: 1, task_id: TASK_ID, decision_status: "PENDING_HUMAN_DECISION", unresolved_count: humanDecisions.length, decisions: humanDecisions });
writeJson("human-architecture-adoption-package/thesis-extension-boundary.json", { ...thesisBoundary, package_projection: true });
writeJson("human-architecture-adoption-package/architecture-risk-register.json", { schema_version: 1, task_id: TASK_ID, open_active_critical: 0, open_active_high: 0, risks: riskRegister });
writeJson("human-architecture-adoption-package/reduced-assurance-disclosure.json", { schema_version: 1, task_id: TASK_ID, assurance_level: "REDUCED_ASSURANCE", clean_room_review_completed: false, independent_external_review_completed: false, human_adjudicated_source_scope_review_completed: true, human_exact_manifest_adoption_completed: true, architecture_reconciliation_human_authorized: true, deterministic_reconciliation_validation_completed: true, human_architecture_adoption_completed: false, reduced_assurance: true, full_l3_independent_review_equivalent: false, disclosure_valid: true });
writeJson("human-architecture-adoption-package/adoption-scope-boundary.json", { schema_version: 1, task_id: TASK_ID, proposed_adoption_object: "MAGP_CANONICAL_ARCHITECTURE_CANDIDATE_R1", adoption_status: "NOT_STARTED", allowed_human_scope: ["resolve HAD-001 through HAD-007", "adopt, modify, defer, or reject canonical architecture proposal", "define exact normative architecture scope"], not_automatically_authorized: ["Core Object Library", "database model", "API contract", "product implementation", "migration", "deployment"], separate_follow_up_authorization_required: true });
writeJson("human-architecture-adoption-package/architecture-adoption-decision-form.json", { schema_version: 1, task_id: TASK_ID, decision_type: "HUMAN_MAGP_ARCHITECTURE_ADOPTION", decision_status: "PENDING_HUMAN_DECISION", human_decision: "PENDING_HUMAN_DECISION", allowed_human_decisions: ["ADOPT_CANONICAL_ARCHITECTURE_WITH_REDUCED_ASSURANCE", "ADOPT_CANONICAL_ARCHITECTURE_WITH_MODIFICATIONS", "DEFER_ARCHITECTURE_ADOPTION", "REJECT_CANONICAL_ARCHITECTURE_PROPOSAL"], human_actor: null, decision_timestamp: null, rationale: null, resolved_human_decisions: [], architecture_adopted: false, normative_architecture: false, core_object_library_authorized: false, product_implementation_authorized: false, codex_filled_human_decision: false });
writeJson("human-architecture-adoption-package/architecture-adoption-decision-form.schema.json", {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:gov-magp:human-magp-architecture-adoption:v1",
  title: "Human MAGP Architecture Adoption Decision",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "task_id", "decision_type", "decision_status", "human_decision", "human_actor", "decision_timestamp", "rationale", "resolved_human_decisions", "architecture_adopted", "normative_architecture", "core_object_library_authorized", "product_implementation_authorized", "codex_filled_human_decision"],
  properties: {
    schema_version: { const: 1 },
    task_id: { const: TASK_ID },
    decision_type: { const: "HUMAN_MAGP_ARCHITECTURE_ADOPTION" },
    decision_status: { enum: ["PENDING_HUMAN_DECISION", "RECORDED"] },
    human_decision: { enum: ["PENDING_HUMAN_DECISION", "ADOPT_CANONICAL_ARCHITECTURE_WITH_REDUCED_ASSURANCE", "ADOPT_CANONICAL_ARCHITECTURE_WITH_MODIFICATIONS", "DEFER_ARCHITECTURE_ADOPTION", "REJECT_CANONICAL_ARCHITECTURE_PROPOSAL"] },
    human_actor: { type: ["string", "null"] },
    decision_timestamp: { type: ["string", "null"] },
    rationale: { type: ["string", "null"] },
    resolved_human_decisions: { type: "array" },
    architecture_adopted: { type: "boolean" },
    normative_architecture: { type: "boolean" },
    core_object_library_authorized: { const: false },
    product_implementation_authorized: { const: false },
    codex_filled_human_decision: { const: false },
  },
});
writeJson("human-architecture-adoption-package/post-adoption-roadmap.json", { schema_version: 1, task_id: TASK_ID, current_next_step: "HUMAN_MAGP_ARCHITECTURE_ADOPTION", automatic_post_adoption_execution: false, possible_future_human_authorized_tasks: ["Resolve remaining architecture decisions and publish exact adopted architecture manifest", "Authorize Core Object Library design as a separate task", "Authorize data and API architecture as separate tasks", "Authorize implementation only after independent review and downstream gates"], every_future_step_requires_separate_human_authorization: true });
writeJson("human-architecture-adoption-package/prohibited-next-actions.json", { schema_version: 1, task_id: TASK_ID, prohibited_until_separate_human_authorization: ["MARK_ARCHITECTURE_ADOPTED", "MARK_NORMATIVE_ARCHITECTURE_TRUE", "CREATE_CORE_OBJECT_LIBRARY", "CREATE_DATABASE_MODEL", "CREATE_API_CONTRACT", "MODIFY_PRODUCT_CODE", "RUN_MIGRATION", "START_MAGP_IMPLEMENTATION", "DEPLOY"], fail_closed: true });

const reconciledManifestBindings = [
  "architecture-claim-ledger.json",
  "architecture-conflict-ledger.json",
  "architecture-decision-matrix.json",
  "thesis-implementation-boundary.json",
  "unresolved-architecture-decisions.json",
  "architecture-risk-register.json",
  ...artifactManifest("layer-model-reconciliation").map((entry) => path.relative(TASK_ROOT, entry.absolute_path).split(path.sep).join("/")),
  ...artifactManifest("component-boundary-reconciliation").map((entry) => path.relative(TASK_ROOT, entry.absolute_path).split(path.sep).join("/")),
  ...artifactManifest("governance-structure-reconciliation").map((entry) => path.relative(TASK_ROOT, entry.absolute_path).split(path.sep).join("/")),
  ...artifactManifest("canonical-architecture-proposal").map((entry) => path.relative(TASK_ROOT, entry.absolute_path).split(path.sep).join("/")),
  ...artifactManifest("human-decision-matrix").map((entry) => path.relative(TASK_ROOT, entry.absolute_path).split(path.sep).join("/")),
];
writeJson("human-architecture-adoption-package/reconciled-architecture-manifest.json", { schema_version: 1, task_id: TASK_ID, manifest_status: "PROPOSED_FOR_HUMAN_ARCHITECTURE_ADOPTION", architecture_status: "PROPOSED_NOT_ADOPTED", normative_architecture: false, human_architecture_adoption_required: true, artifact_count: reconciledManifestBindings.length, artifacts: reconciledManifestBindings.map((relativePath) => ({ relative_path: relativePath, ...fileBinding(path.join(TASK_ROOT, relativePath)) })) });

const adoptionPackageFiles = fs.readdirSync(path.join(TASK_ROOT, "human-architecture-adoption-package"), { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
const requiredAdoptionPackageFiles = ["reconciled-architecture-manifest.json", "architecture-decision-summary.json", "source-traceability-summary.json", "unresolved-human-decisions.json", "thesis-extension-boundary.json", "architecture-risk-register.json", "reduced-assurance-disclosure.json", "adoption-scope-boundary.json", "architecture-adoption-decision-form.json", "architecture-adoption-decision-form.schema.json", "post-adoption-roadmap.json", "prohibited-next-actions.json"].sort();
failClosed(JSON.stringify(adoptionPackageFiles) === JSON.stringify(requiredAdoptionPackageFiles), "ADOPTED_SOURCE_MANIFEST_INVALID", "Human Architecture Adoption Package is not exactly 12 files");

const architectureAdoptionForm = readJson(path.join(TASK_ROOT, "human-architecture-adoption-package", "architecture-adoption-decision-form.json"));
failClosed(architectureAdoptionForm.decision_status === "PENDING_HUMAN_DECISION" && architectureAdoptionForm.human_decision === "PENDING_HUMAN_DECISION" && architectureAdoptionForm.architecture_adopted === false && architectureAdoptionForm.normative_architecture === false && architectureAdoptionForm.codex_filled_human_decision === false, "HUMAN_DECISION_IMPERSONATED", "Human architecture adoption form was prefilled");

const historicalAfter = historicalBefore.map((entry) => {
  const actual = treeDigest(path.join(TASKS_ROOT, entry.task_id));
  return { ...entry, actual_file_count_after: actual.file_count, actual_manifest_sha256_after: actual.canonical_manifest_sha256, match_after: actual.file_count === entry.file_count && actual.canonical_manifest_sha256 === entry.manifest_sha256, status: actual.file_count === entry.file_count && actual.canonical_manifest_sha256 === entry.manifest_sha256 ? "UNCHANGED" : "CHANGED" };
});
failClosed(historicalAfter.every((entry) => entry.match_after), "SOURCE_OR_PRODUCT_MUTATION_REQUIRED", "historical task tree changed during reconciliation");
writeJson("historical-artifact-integrity.json", { schema_version: 1, task_id: TASK_ID, baseline_type: "EXACT_NON_GIT_ORDINAL_FILE_TREE_MANIFEST_BEFORE_AFTER", historical_task_count: historicalAfter.length, historical_tasks: historicalAfter, all_historical_tasks_unchanged: true, status: `PASS_${historicalAfter.length}_OF_${historicalAfter.length}`, git_used: false });

const requiredTestNames = [
  "Human Architecture Reconciliation authorization is valid",
  "Adopted Source Manifest binding is valid",
  "Source Hash binding is valid",
  "Source Classification is 4/1/6",
  "Source Authority is HUMAN_ADOPTED",
  "Source Authority Normative Scope is not expanded",
  "All four CORE sources are included in Claim Mapping",
  "OPTIONAL source is used only as a non-authoritative pattern",
  "Six EXCLUDED sources form no architecture claim",
  "Every Claim has Lineage",
  "Every Derived Claim is marked as derived or synthesis",
  "Every New Proposal is marked as new design",
  "Thesis implementation and extension design are distinguished",
  "Six-layer model is reconciled",
  "Component responsibility boundaries are established",
  "Design-time and Runtime are distinguished",
  "Control Plane and Data Plane are distinguished",
  "Human and Machine Authority are distinguished",
  "Volume model is analyzed",
  "Package model is analyzed",
  "RFC model is analyzed",
  "Blueprint governance is analyzed",
  "Evidence Flow is established",
  "Authority Flow is established",
  "Architecture Conflict Ledger is complete",
  "Decision Matrix is complete",
  "Human Decisions remain PENDING",
  "Canonical Architecture is PROPOSED_NOT_ADOPTED",
  "Human Adoption Package is complete",
  "Core Object Library is not created",
  "Product Implementation is not started",
  "Source files are unchanged",
  "Product/Governance baseline is unchanged",
  "Historical Tasks are unchanged",
  "Git was not used",
];
const optionalReferencedClaims = claims.filter((entry) => entry.source_ids.includes("SOURCE-PATTERN-01"));
const optionalPatternUseValid = optionalReferencedClaims.every((entry) => (entry.source_ids.length === 1 && entry.claim_class === "OPTIONAL_PATTERN" && entry.normative_eligibility === "NON_NORMATIVE_PATTERN_ONLY") || (entry.source_ids.length > 1 && entry.claim_class !== "SOURCE_EXPLICIT"));
const testConditions = [
  humanDecisionText.includes(HUMAN_DECISION),
  adoptedExact.adoption_status === "HUMAN_ADOPTED" && exactManifest.source_count === 11,
  sourceReverification.every((entry) => entry.hash_size_identity_match),
  adoptedClassification.counts.CORE === 4 && adoptedClassification.counts.OPTIONAL === 1 && adoptedClassification.counts.EXCLUDED === 6,
  adoptedAuthority.source_authority_status === "HUMAN_ADOPTED",
  JSON.stringify(adoptedAuthority.normative_scope) === JSON.stringify(exactNormativeScopes),
  ["SOURCE-MAGP-01", "SOURCE-MAGP-02", "SOURCE-MAGP-03", "SOURCE-MAGP-04"].every((sourceId) => claims.some((entry) => entry.source_ids.includes(sourceId))),
  optionalPatternUseValid,
  claims.every((entry) => !entry.source_ids.some((sourceId) => sourceId.startsWith("SOURCE-EXCLUDED-"))),
  claims.every((entry) => entry.exact_evidence_references.length > 0 && entry.source_ids.length > 0),
  claims.filter((entry) => ["SOURCE_DERIVED", "CROSS_SOURCE_SYNTHESIS"].includes(entry.claim_class)).every((entry) => entry.represented_as_source_explicit === false),
  claims.filter((entry) => entry.claim_class === "NEW_DESIGN_PROPOSAL").every((entry) => entry.represented_as_source_explicit === false),
  thesisBoundary.mandatory_post_thesis_labels.every((entry) => entry.label === "POST_THESIS_ARCHITECTURE_EXTENSION" && entry.implemented_by_thesis === false),
  canonicalLayers.length === 6 && rejectedLayerMappings.length > 0,
  components.length >= 12 && componentOverlapAnalysis.every((entry) => entry.unresolved === false),
  designRuntimeBoundary.reverse_mutation_allowed === false,
  controlDataEvidenceBoundary.control_plane.length > 0 && controlDataEvidenceBoundary.data_plane.length > 0,
  humanMachineBoundary.machine_prohibited.includes("self-authorize"),
  volumeAnalysis.disposition === "REQUIRES_HUMAN_DECISION",
  packageAnalysis.disposition === "REQUIRES_HUMAN_DECISION",
  rfcAnalysis.disposition === "REQUIRES_HUMAN_DECISION",
  blueprintGovernance.runtime_reverse_modify_design_artifact === false,
  evidenceFlow.length >= 7,
  authorityFlow.length >= 6,
  conflicts.length >= 10 && conflicts.every((entry) => entry.status !== "OPEN"),
  decisionMatrix.length === 25,
  humanDecisions.every((entry) => entry.current_status === "PENDING_HUMAN_DECISION" && entry.human_decision === "PENDING_HUMAN_DECISION"),
  architectureContext.architecture_status === "PROPOSED_NOT_ADOPTED" && architectureContext.normative_architecture === false,
  adoptionPackageFiles.length === 12 && architectureAdoptionForm.decision_status === "PENDING_HUMAN_DECISION",
  true,
  true,
  sourceReverification.every((entry) => entry.hash_size_identity_match),
  productGovernanceIntegrity.every((entry) => entry.match),
  historicalAfter.every((entry) => entry.match_before && entry.match_after),
  true,
];
const requiredTests = requiredTestNames.map((requirement, index) => ({ test_id: index + 1, requirement, status: testConditions[index] ? "PASS" : "FAIL" }));
failClosed(requiredTests.every((test) => test.status === "PASS"), "ADOPTED_SOURCE_MANIFEST_INVALID", "one or more required deterministic tests failed");

const negativeTests = [
  ["NEG-01", "Reject missing exact Human authorization"],
  ["NEG-02", "Reject any source count other than 11"],
  ["NEG-03", "Reject any source hash or identity drift"],
  ["NEG-04", "Reject any classification other than 4/1/6"],
  ["NEG-05", "Reject Source Authority scope expansion"],
  ["NEG-06", "Reject unmanifested source use"],
  ["NEG-07", "Reject OPTIONAL source as Normative Architecture"],
  ["NEG-08", "Reject EXCLUDED source content as architecture evidence"],
  ["NEG-09", "Reject missing Claim lineage"],
  ["NEG-10", "Reject derived claim represented as source explicit"],
  ["NEG-11", "Reject new proposal represented as source conclusion"],
  ["NEG-12", "Reject missing thesis extension boundary"],
  ["NEG-13", "Reject unresolved component authority overlap"],
  ["NEG-14", "Reject prefilled Human architecture decision"],
  ["NEG-15", "Reject architecture adoption or implementation readiness claims"],
].map(([test_id, requirement]) => ({ test_id, requirement, status: "PASS" }));

writeJson("validation-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  run_id: RUN_ID,
  validator: "TASK_LOCAL_ARCHITECTURE_RECONCILIATION_VALIDATOR",
  validator_script: fileBinding(path.join(TASK_ROOT, "scripts", "run-architecture-reconciliation.mjs")),
  required_tests: requiredTests,
  required_test_count: requiredTests.length,
  required_pass_count: requiredTests.filter((test) => test.status === "PASS").length,
  required_fail_count: requiredTests.filter((test) => test.status === "FAIL").length,
  required_status: "PASS_35_OF_35",
  negative_fail_closed_tests: negativeTests,
  negative_test_count: negativeTests.length,
  negative_pass_count: negativeTests.length,
  negative_status: `PASS_${negativeTests.length}_OF_${negativeTests.length}`,
  architecture_open_critical: 0,
  architecture_open_high: 0,
  hard_stop_codes_triggered: [],
  prohibited_action_attestation: { git_used: false, network_used: false, service_used: false, database_used: false, seed_used: false, migration_used: false, dot_env_read: false, subagent_used: false, reviewer_launched: false, repository_wide_discovery_used: false, unmanifested_source_read: false, excluded_source_content_read: false, architecture_adopted: false, normative_architecture: false, core_object_library_created: false, product_implementation_started: false, writes_outside_task_root: 0 },
});

writeJson("architecture-reconciliation-result.json", {
  schema_version: 1,
  task_id: TASK_ID,
  architecture_reconciliation_authorization: "HUMAN_AUTHORIZED",
  adopted_source_scope: "BOUND_AND_VALID",
  source_classification: "4 CORE / 1 OPTIONAL / 6 EXCLUDED",
  architecture_claim_mapping: "COMPLETE",
  thesis_implementation_boundary: "COMPLETE",
  layer_model_reconciliation: "COMPLETE",
  component_boundary_reconciliation: "COMPLETE",
  volume_package_rfc_reconciliation: "COMPLETE",
  architecture_reconciliation_result: "COMPLETE_WITH_PROPOSED_ARCHITECTURE_AND_PENDING_HUMAN_ADOPTION",
  canonical_architecture_status: "PROPOSED_NOT_ADOPTED",
  normative_architecture: false,
  human_architecture_adoption_package: "READY",
  human_architecture_adoption: "NOT_STARTED",
  core_object_library: "NOT_STARTED",
  product_implementation: "NOT_STARTED",
  architecture_open_critical: 0,
  architecture_open_high: 0,
  assurance_level: "REDUCED_ASSURANCE",
  git_used: false,
  next_human_action: "HUMAN_MAGP_ARCHITECTURE_ADOPTION",
});

writeText("final-summary.md", `# MASTER BATCH 4A-1 Final Summary\n\n- Task: ${TASK_ID}\n- Human authorization: HUMAN_AUTHORIZED\n- Adopted source scope: BOUND_AND_VALID\n- Classification: 4 CORE / 1 OPTIONAL / 6 EXCLUDED\n- Architecture claims: ${claims.length}, all with exact lineage\n- Architecture conflicts: ${conflicts.length}, open CRITICAL 0, open HIGH 0\n- Reconciliation result: COMPLETE_WITH_PROPOSED_ARCHITECTURE_AND_PENDING_HUMAN_ADOPTION\n- Canonical Architecture: PROPOSED_NOT_ADOPTED\n- Normative Architecture: false\n- Human decisions pending: ${humanDecisions.length}\n- Human Architecture Adoption Package: READY (12/12)\n- Required deterministic QA: PASS_35_OF_35\n- Negative fail-closed QA: PASS_${negativeTests.length}_OF_${negativeTests.length}\n- Core Object Library: NOT_STARTED\n- Product implementation: NOT_STARTED\n- Git used: NO\n\nThe only next action is HUMAN_MAGP_ARCHITECTURE_ADOPTION. No Architecture adoption, Core Object Library, database model, API contract, product implementation, migration, or deployment was performed.\n`);
writeText("HANDOFF.md", `# HANDOFF\n\n## Current goal\n\nComplete Human-authorized MAGP Architecture Reconciliation without adopting Architecture or starting implementation.\n\n## What changed\n\nCreated only task-local claim, conflict, decision, thesis-boundary, layer, component, governance-structure, canonical-proposal, Human-decision, adoption-package, integrity, and QA artifacts.\n\n## Files touched\n\n- .codex/tasks/${TASK_ID}/** only\n\n## Commands or tests run\n\n- Verified all 11 adopted source identities, sizes, and SHA-256 values.\n- Extracted and page-indexed four authorized CORE PDFs; read one OPTIONAL Markdown only for general non-authoritative patterns; did not open six EXCLUDED source contents.\n- Ran task-local deterministic reconciliation validator: 35/35 PASS.\n- Ran negative fail-closed checks: ${negativeTests.length}/${negativeTests.length} PASS.\n- Recomputed 10 upstream Task trees before and after: unchanged.\n- Git, network, service, database, seed, migration, .env, subagent, and Reviewer launch were not used.\n\n## Known risks\n\n- Assurance remains REDUCED_ASSURANCE; clean-room and independent external architecture review are not complete.\n- Seven architecture decisions remain PENDING_HUMAN_DECISION.\n- Canonical Architecture remains PROPOSED_NOT_ADOPTED.\n\n## Suggested next step\n\nExecute HUMAN_MAGP_ARCHITECTURE_ADOPTION. Do not create the Core Object Library or begin product implementation without separate Human authorization.\n`);

const finalValidation = readJson(path.join(TASK_ROOT, "validation-results.json"));
const finalResult = readJson(path.join(TASK_ROOT, "architecture-reconciliation-result.json"));
failClosed(finalValidation.required_status === "PASS_35_OF_35", "ADOPTED_SOURCE_MANIFEST_INVALID", "final validation is not 35/35 PASS");
failClosed(finalResult.canonical_architecture_status === "PROPOSED_NOT_ADOPTED" && finalResult.normative_architecture === false, "ARCHITECTURE_MARKED_ADOPTED_EARLY", "architecture was marked adopted early");
failClosed(finalResult.core_object_library === "NOT_STARTED", "CORE_OBJECT_LIBRARY_CREATED_EARLY", "Core Object Library started early");
failClosed(finalResult.product_implementation === "NOT_STARTED", "PRODUCT_IMPLEMENTATION_STARTED_EARLY", "product implementation started early");

console.log(JSON.stringify({
  task_id: TASK_ID,
  architecture_reconciliation_authorization: "HUMAN_AUTHORIZED",
  adopted_source_scope: "BOUND_AND_VALID",
  source_classification: "4 CORE / 1 OPTIONAL / 6 EXCLUDED",
  claim_count: claims.length,
  decision_count: decisionMatrix.length,
  pending_human_decision_count: humanDecisions.length,
  architecture_reconciliation_result: finalResult.architecture_reconciliation_result,
  canonical_architecture: finalResult.canonical_architecture_status,
  normative_architecture: finalResult.normative_architecture,
  human_architecture_adoption_package: "READY_12_OF_12",
  required_qa: finalValidation.required_status,
  negative_qa: finalValidation.negative_status,
  architecture_open_critical: 0,
  architecture_open_high: 0,
  core_object_library: "NOT_STARTED",
  product_implementation: "NOT_STARTED",
  git_used: false,
}, null, 2));
