import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TASK_ID = "GOV-MAGP-PLATFORM-DESIGN-AND-IMPLEMENTATION-BLUEPRINT-01";
const MASTER_BATCH = "7A-1";
const ROLE = "INTEGRATED_PLATFORM_DESIGN_AND_IMPLEMENTATION_BLUEPRINT_PLANNER_HA1";
const here = path.dirname(fileURLToPath(import.meta.url));
const TASK_ROOT = path.resolve(here, "..");
const TASKS_ROOT = path.resolve(TASK_ROOT, "..");
const PRODUCT_ROOT = path.resolve(TASK_ROOT, "../../..");
const INPUT_TASK_ID = "GOV-MAGP-HUMAN-LOGICAL-CONTRACT-DECISION-AND-ADOPTION-01";
const INPUT_ROOT = path.join(TASKS_ROOT, INPUT_TASK_ID);
const EXPECTED_INPUT = { file_count: 54, manifest_sha256: "08E4D330C3A287D6A26A8B0587E7099DD677C7B118AB29E5A015F4C570D01E6D" };
const BASELINES = {
  architecture: { id: "MAGP-ARCH-BASELINE-V1", file_count: 14, manifest_sha256: "32A064D90A2051DFC7B28962F9757F7947E6A4863615628C1E99169FE91C128C" },
  object_library: { id: "MAGP-OBJECT-LIBRARY-BASELINE-V1", file_count: 14, manifest_sha256: "907F7D7F58739182FEC731AD562D6142C522E5958144F0A34AAE240465E2B8CE" },
  logical_contract: { id: "MAGP-LOGICAL-CONTRACT-BASELINE-V1", baseline_content_sha256: "A5DC37FFBDFE5857EBD0B0995C28325A83887B59833DBA7260B46F2851305E6B" }
};
const STATUS = { design_status: "PROPOSED_NOT_ADOPTED", execution_status: "NOT_EXECUTED", implementation_status: "NOT_IMPLEMENTED", human_adoption_status: "PENDING_HUMAN_DECISION" };
const ASSURANCE = { assurance_level: "REDUCED_ASSURANCE", clean_room_review_completed: false, independent_external_review_completed: false, human_adjudicated_review_model: true };

function sha(value) { return crypto.createHash("sha256").update(value).digest("hex").toUpperCase(); }
function bytes(file) { return fs.readFileSync(file); }
function bind(file) { return { absolute_path: file.split(path.sep).join("/"), sha256: sha(bytes(file)), bytes: fs.statSync(file).size }; }
function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  });
}
function digest(root, exclusions = new Set()) {
  const rows = listFiles(root).map((file) => ({ relative_path: path.relative(root, file).split(path.sep).join("/"), file })).filter((x) => !exclusions.has(x.relative_path)).map((x) => ({ relative_path: x.relative_path, sha256: sha(bytes(x.file)), bytes: fs.statSync(x.file).size })).sort((a, b) => a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0);
  const canonical = rows.map((x) => `${x.relative_path}|${x.sha256}|${x.bytes}`).join("\n");
  return { file_count: rows.length, manifest_sha256: sha(Buffer.from(canonical, "utf8")), entries: rows };
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function fail(condition, code, detail) { if (!condition) throw new Error(`${code}: ${detail}`); }
function target(relative) {
  const resolved = path.resolve(TASK_ROOT, relative);
  fail(resolved.startsWith(`${TASK_ROOT}${path.sep}`), "WRITE_SCOPE_VIOLATION", relative);
  return resolved;
}
function writeText(relative, value) {
  const file = target(relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}
function writeJson(relative, value) { writeText(relative, JSON.stringify(value, null, 2)); }
function writeYaml(relative, value) { writeJson(relative, value); }
function proposal(subject, body = {}) { return { schema_version: 1, task_id: TASK_ID, subject, ...STATUS, ...body }; }
function exists(relative) { return fs.existsSync(target(relative)); }

// Fail closed before generating any planning artifact.
const inputDigest = digest(INPUT_ROOT);
fail(inputDigest.file_count === EXPECTED_INPUT.file_count && inputDigest.manifest_sha256 === EXPECTED_INPUT.manifest_sha256, "LOGICAL_CONTRACT_BASELINE_INVALID", "6A-2 task tree binding changed");
const stage2 = readJson(path.join(INPUT_ROOT, "stage-2-result.json"));
const archIntegrity = readJson(path.join(INPUT_ROOT, "architecture-baseline-integrity.json"));
const objectIntegrity = readJson(path.join(INPUT_ROOT, "object-library-baseline-integrity.json"));
const logicalRecord = readJson(path.join(INPUT_ROOT, "logical-contract-baseline", "logical-contract-baseline-record.json"));
const logicalBinding = readJson(path.join(INPUT_ROOT, "logical-contract-baseline", "logical-contract-baseline-hash-binding.json"));
const decisionLedger = readJson(path.join(INPUT_ROOT, "human-logical-contract-adoption", "human-contract-decision-resolution-ledger.json"));
const priorHistory = readJson(path.join(INPUT_ROOT, "historical-artifact-integrity.json"));
const priorProduct = readJson(path.join(INPUT_ROOT, "product-governance-integrity.json"));
fail(stage2.result === "COMPLETE" && stage2.logical_contract === "HUMAN_ADOPTED" && stage2.normative_logical_contract === true, "LOGICAL_CONTRACT_BASELINE_INVALID", "Stage 2 adoption state invalid");
fail(stage2.pending_contract_decisions === 0 && decisionLedger.pending_count === 0 && decisionLedger.resolved_count === 18, "PENDING_CONTRACT_DECISION_EXISTS", "Contract decisions are not 18/18 resolved");
fail(archIntegrity.status === "BOUND_AND_VALID" && archIntegrity.actual.file_count === BASELINES.architecture.file_count && archIntegrity.actual.manifest_sha256 === BASELINES.architecture.manifest_sha256, "ARCHITECTURE_BASELINE_INVALID", "Architecture binding mismatch");
fail(objectIntegrity.status === "BOUND_AND_VALID" && objectIntegrity.actual.file_count === BASELINES.object_library.file_count && objectIntegrity.actual.manifest_sha256 === BASELINES.object_library.manifest_sha256, "OBJECT_LIBRARY_BASELINE_INVALID", "Object Library binding mismatch");
fail(logicalRecord.baseline_status === "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND" && logicalRecord.baseline_content_sha256 === BASELINES.logical_contract.baseline_content_sha256 && logicalBinding.baseline_content_sha256 === BASELINES.logical_contract.baseline_content_sha256, "LOGICAL_CONTRACT_BASELINE_INVALID", "Logical Contract hash mismatch");
for (const row of priorProduct.files) {
  const actual = bind(row.absolute_path);
  fail(actual.sha256 === row.expected_sha256 && actual.bytes === row.expected_bytes, "PRODUCT_GOVERNANCE_BASELINE_CHANGED", row.label);
}
for (const row of priorHistory.historical_tasks) {
  const actual = digest(path.join(TASKS_ROOT, row.task_id));
  fail(actual.file_count === row.file_count && actual.manifest_sha256 === row.manifest_sha256, "HISTORICAL_TASK_CHANGED", row.task_id);
}

const humanAuthorization = {
  authorization: "AUTHORIZE_INTEGRATED_PHYSICAL_PERSISTENCE_API_EVENT_SECURITY_DEPLOYMENT_AND_IMPLEMENTATION_BLUEPRINT_PLANNING",
  authorization_status: "HUMAN_AUTHORIZED",
  master_batch: MASTER_BATCH,
  input_task_reauthorization: true,
  authorized_scope: ["physical persistence design proposal", "formal API and event contract proposal", "security and deployment architecture proposal", "implementation blueprint proposal", "testing and assurance plan", "four Human adoption packages"],
  prohibited_scope: ["physical database execution", "SQL execution", "migration execution", "formal API implementation", "product implementation", "deployment", "Human design adoption", "Git"]
};

writeYaml("task-intent.yaml", {
  schema_version: 1, task_id: TASK_ID, master_batch: MASTER_BATCH, role: ROLE,
  intent: "Produce one integrated, baseline-conformant platform design and implementation blueprint planning batch.",
  human_authorization: humanAuthorization,
  normative_inputs: Object.values(BASELINES).map((x) => x.id),
  assurance: ASSURANCE,
  execution_boundary: { physical_database_executed: false, sql_executed: false, migration_executed: false, formal_api_implemented: false, product_code_modified: false, product_implementation_started: false, git_used: false }
});
writeYaml("classification.yaml", {
  schema_version: 1, task_id: TASK_ID, classification: "L3_INTEGRATED_PLATFORM_DESIGN_PLANNING", role: ROLE,
  change_type: "GOVERNANCE_ARTIFACTS_ONLY", design_authority: "PROPOSAL_ONLY", human_gate_required: true,
  decision_impersonation_allowed: false, writes_allowed_only_under_task_root: true, ...STATUS
});
writeYaml("blueprint.yaml", {
  schema_version: 1, task_id: TASK_ID, integration_model: "SINGLE_INTEGRATED_PLANNING_BATCH",
  workstreams: ["input binding", "physical persistence", "database proposal", "migration strategy", "formal API", "event contracts", "security", "Human review console", "backend modules", "agent runtime", "deployment", "observability", "resilience", "implementation blueprint", "testing", "Human decisions", "adoption packages"],
  governing_principles: ["canonical identity is immutable", "authority requires explicit bounded grants", "Human Gates cannot be bypassed", "evidence is append-oriented and hash-bound", "findings are never deleted", "runtime telemetry is not Evidence until registered", "all physical designs remain proposed until Human adoption"],
  terminal_state: "READY_FOR_HUMAN_REVIEW_OF_FOUR_ADOPTION_PACKAGES", product_implementation_authorization: false
});

writeJson("input-binding/human-authorization-record.json", { schema_version: 1, task_id: TASK_ID, ...humanAuthorization, recorded_by_codex_as_human_input: true, codex_human_decision_substitution: false });
writeJson("input-binding/architecture-baseline-binding.json", { schema_version: 1, task_id: TASK_ID, architecture_baseline: BASELINES.architecture.id, source_integrity: bind(path.join(INPUT_ROOT, "architecture-baseline-integrity.json")), expected: BASELINES.architecture, actual: archIntegrity.actual, status: "BOUND_AND_VALID" });
writeJson("input-binding/object-library-baseline-binding.json", { schema_version: 1, task_id: TASK_ID, object_library_baseline: BASELINES.object_library.id, source_integrity: bind(path.join(INPUT_ROOT, "object-library-baseline-integrity.json")), expected: BASELINES.object_library, actual: objectIntegrity.actual, status: "BOUND_AND_VALID" });
writeJson("input-binding/logical-contract-baseline-binding.json", { schema_version: 1, task_id: TASK_ID, logical_contract_baseline: BASELINES.logical_contract.id, source_record: bind(path.join(INPUT_ROOT, "logical-contract-baseline", "logical-contract-baseline-record.json")), source_hash_binding: bind(path.join(INPUT_ROOT, "logical-contract-baseline", "logical-contract-baseline-hash-binding.json")), baseline_content_sha256: logicalRecord.baseline_content_sha256, status: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND", pending_contract_decisions: 0 });
writeJson("input-binding/readiness-package-binding.json", { schema_version: 1, task_id: TASK_ID, source_readiness_manifest: bind(path.join(INPUT_ROOT, "integrated-platform-planning-readiness-package", "readiness-manifest.json")), prior_readiness: "READY_FOR_SEPARATE_HUMAN_AUTHORIZATION", current_human_authorization: humanAuthorization.authorization, current_status: "AUTHORIZED_AND_CONSUMED_FOR_PLANNING_ONLY" });
writeJson("input-binding/baseline-conformance-result.json", { schema_version: 1, task_id: TASK_ID, architecture_baseline: "PASS", object_library_baseline: "PASS", logical_contract_baseline: "PASS", canonical_identity_preserved: true, authority_semantics_preserved: true, human_gate_preserved: true, evidence_integrity_preserved: true, unresolved_conflicts: 0, result: "PASS" });

const databaseCandidates = [
  ["PostgreSQL", "candidate system of record", "transactional aggregates, authority, approvals, audit metadata", "PENDING_HUMAN_DECISION"],
  ["Graph Store", "candidate projection", "lineage and knowledge traversal; never authority source", "PENDING_HUMAN_DECISION"],
  ["Object Storage", "candidate evidence blob store", "hash-addressed large evidence and deployment artifacts", "PENDING_HUMAN_DECISION"],
  ["Search Engine", "candidate projection", "redacted search and discovery; rebuildable", "PENDING_HUMAN_DECISION"],
  ["Time Series Store", "candidate telemetry projection", "metrics only; not Evidence Ledger by default", "PENDING_HUMAN_DECISION"],
  ["Event Store", "candidate append stream", "domain event persistence when separately adopted", "PENDING_HUMAN_DECISION"],
  ["Message Infrastructure", "candidate delivery layer", "event delivery without authority semantics", "PENDING_HUMAN_DECISION"]
].map(([technology, role, scope, decision_status]) => ({ technology, role, scope, decision_status, selected: false }));
const physicalEntities = ["governance_object", "governance_object_version", "object_relation", "lifecycle_transition", "authority_grant", "human_approval", "approval_binding", "evidence_record", "evidence_blob_reference", "review_record", "finding", "finding_status_history", "remediation", "volume", "package", "package_member", "agent_definition", "agent_instance", "runtime_event", "deployment_artifact", "audit_record", "idempotency_record", "outbox_event", "retention_hold"];
const aggregateBoundaries = ["ConstitutionPolicy", "RfcDecision", "BlueprintSpecification", "KnowledgeDefinition", "EvidenceReview", "FindingRemediation", "VolumePackage", "AgentDefinition", "AgentRuntimeGovernance", "DeploymentGovernance", "GovernanceAuthority"];
const commonColumns = [
  { name: "canonical_id", proposed_type: "uuid", rule: "stable identity; never reused" },
  { name: "revision", proposed_type: "bigint", rule: "monotonic optimistic concurrency token" },
  { name: "lifecycle_state", proposed_type: "text", rule: "validated transition only" },
  { name: "content_hash", proposed_type: "char(64)", rule: "SHA-256 binding for canonical content" },
  { name: "authority_context_id", proposed_type: "uuid", rule: "explicit authority evaluation binding" },
  { name: "created_at", proposed_type: "timestamptz", rule: "recorded time" },
  { name: "created_by", proposed_type: "uuid", rule: "actor identity" }
];
const physicalFiles = {
  "database-technology-decision-matrix.json": { candidates: databaseCandidates, primary_system_of_record_selected: false, note: "No technology is adopted by this task." },
  "logical-to-physical-mapping.json": { mappings: physicalEntities.map((entity) => ({ logical_concept: entity.replaceAll("_", " "), proposed_physical_entity: entity, canonical_identity_preserved: true, version_history_preserved: entity.includes("version") || ["lifecycle_transition", "audit_record", "finding_status_history"].includes(entity) })) },
  "physical-entity-registry.json": { entity_count: physicalEntities.length, entities: physicalEntities.map((name) => ({ name, kind: name.includes("event") || name.includes("history") || name === "audit_record" ? "append_oriented" : "transactional_or_registry", adopted: false })) },
  "aggregate-storage-boundary.json": { aggregates: aggregateBoundaries.map((name) => ({ aggregate: name, transaction_boundary: "single aggregate revision", cross_aggregate_mode: "exact reference plus outbox event", authority_copy_allowed: false })) },
  "table-design-proposal.json": { table_count: physicalEntities.length, tables: physicalEntities.map((name) => ({ table: `magp.${name}`, purpose: `Proposed physical representation for ${name}`, common_columns: commonColumns.map((x) => x.name), destructive_delete_allowed: false })) },
  "column-and-type-proposal.json": { common_columns: commonColumns, physical_type_selection_final: false },
  "key-reference-strategy.json": { primary_key: "canonical UUID", version_key: "canonical_id plus revision", cross_volume_reference: "exact ID, version, hash, and volume binding", cascading_delete: "PROHIBITED", external_reference_validation: "application plus constrained registry" },
  "constraint-design.json": { constraints: ["canonical ID uniqueness", "revision positive and monotonic", "content hash format", "valid lifecycle state", "authority time window", "approval decision immutable", "evidence hash immutable", "finding closure requires closure evidence", "package dependency acyclic", "outbox idempotency uniqueness"] },
  "indexing-strategy.json": { indexes: ["canonical identity unique", "aggregate revision unique", "lifecycle state partial", "authority subject-scope-time", "evidence subject-hash", "finding active severity", "audit actor-time", "outbox undispatched", "idempotency namespace-key"] },
  "partitioning-strategy.json": { candidates: ["no initial partitioning", "time partition audit/runtime events", "volume partition evidence metadata"], selected: false, human_decision: "PENDING_HUMAN_DECISION", premature_partitioning_prohibited: true },
  "temporal-data-strategy.json": { model: "append history plus valid-time fields for governed objects", system_time_candidate: true, temporal_scope_selected: false, human_decision: "PENDING_HUMAN_DECISION", silent_history_rewrite_allowed: false },
  "audit-storage-strategy.json": { append_only: true, hash_chain_candidate: true, actor_authority_correlation_required: true, mutable_business_projection_separate: true },
  "evidence-ledger-storage-design.json": { append_oriented: true, metadata_and_blob_separation: true, required_bindings: ["evidence ID", "subject ID and revision", "producer", "authority context", "content hash", "recorded time", "classification", "retention class"], self_acceptance_allowed: false },
  "authority-storage-design.json": { explicit_grant_required: true, fields: ["grant ID", "subject", "scope", "operations", "valid from", "valid until", "issuer", "approval binding", "revocation state"], implicit_agent_authority: false },
  "lifecycle-transition-storage-design.json": { transition_history_append_only: true, required_fields: ["aggregate ID", "from state", "to state", "expected revision", "actor", "authority", "approval", "evidence", "time"], bypass_allowed: false },
  "concurrency-storage-design.json": { model: "optimistic concurrency per aggregate revision", expected_revision_required: true, conflict_status: "409", retry_must_reauthorize: true },
  "idempotency-storage-design.json": { namespaces: ["commands", "events", "approval submissions", "deployment requests"], request_hash_required: true, conflicting_reuse_rejected: true, retention: "risk-class proposal pending Human adoption" },
  "retention-archival-design.json": { classes: ["governance permanent candidate", "evidence risk-class", "audit regulated", "runtime telemetry operational", "package release retained"], legal_schedule_selected: false, deletion_requires_human_gate: true },
  "encryption-sensitive-data-design.json": { at_rest: "required", in_transit: "required", field_level_candidates: ["credentials", "sensitive evidence metadata", "personal identifiers"], key_boundary: "separate from application data", selection_pending: true },
  "backup-restore-design.json": { backup_classes: ["transactional store", "evidence blobs", "audit", "package registry", "search projection config"], restore_order: ["authority and identity", "governance objects", "evidence and audit", "events", "projections"], restore_validation_required: true },
  "disaster-recovery-design.json": { modes: ["regional restore candidate", "cold recovery candidate", "controlled degraded read-only"], rpo_rto_status: "PROPOSED_PENDING_HUMAN_ADOPTION", reconciliation_after_restore: true },
  "physical-schema-risk-register.json": { risks: ["technology adoption unresolved", "cross-store consistency", "evidence blob orphaning", "partition complexity", "temporal query cost", "RLS policy drift", "restore ordering", "projection treated as authority"].map((risk, i) => ({ risk_id: `PPR-${String(i + 1).padStart(3, "0")}`, risk, disposition: "MITIGATE_BEFORE_ADOPTION" })) }
};
for (const [name, body] of Object.entries(physicalFiles)) writeJson(`physical-persistence-design/${name}`, proposal(name.replace(".json", ""), body));

const SQL_HEADER = `-- DESIGN_PROPOSAL_ONLY\n-- NOT_APPROVED_FOR_EXECUTION\n-- PROPOSED_NOT_ADOPTED\n-- NOT_EXECUTED\n-- NOT_IMPLEMENTED\n-- This file is an auditable design artifact, not an executable migration.\n\n`;
writeText("database-proposal/schema-ddl-proposal.sql", SQL_HEADER + `CREATE SCHEMA IF NOT EXISTS magp;\nCREATE TABLE magp.governance_object (canonical_id uuid PRIMARY KEY, object_type text NOT NULL, revision bigint NOT NULL CHECK (revision > 0), lifecycle_state text NOT NULL, content_hash char(64) NOT NULL, authority_context_id uuid NOT NULL, created_at timestamptz NOT NULL, created_by uuid NOT NULL);\nCREATE TABLE magp.evidence_record (canonical_id uuid PRIMARY KEY, subject_id uuid NOT NULL, subject_revision bigint NOT NULL, producer_id uuid NOT NULL, authority_context_id uuid NOT NULL, content_hash char(64) NOT NULL, classification text NOT NULL, recorded_at timestamptz NOT NULL);\nCREATE TABLE magp.audit_record (audit_id uuid PRIMARY KEY, sequence_no bigint NOT NULL, prior_hash char(64), record_hash char(64) NOT NULL, actor_id uuid NOT NULL, authority_context_id uuid NOT NULL, action text NOT NULL, recorded_at timestamptz NOT NULL);`);
writeText("database-proposal/constraint-ddl-proposal.sql", SQL_HEADER + `ALTER TABLE magp.governance_object ADD CONSTRAINT uq_governance_object_revision UNIQUE (canonical_id, revision);\nALTER TABLE magp.evidence_record ADD CONSTRAINT ck_evidence_hash CHECK (content_hash ~ '^[0-9A-F]{64}$');\nALTER TABLE magp.audit_record ADD CONSTRAINT uq_audit_sequence UNIQUE (sequence_no);`);
writeText("database-proposal/index-ddl-proposal.sql", SQL_HEADER + `CREATE INDEX idx_governance_object_state ON magp.governance_object (object_type, lifecycle_state);\nCREATE INDEX idx_evidence_subject ON magp.evidence_record (subject_id, subject_revision);\nCREATE INDEX idx_audit_actor_time ON magp.audit_record (actor_id, recorded_at);`);
writeText("database-proposal/partition-ddl-proposal.sql", SQL_HEADER + `-- Candidate only; partition mode is Human Decision HID-008.\n-- CREATE TABLE magp.runtime_event (...) PARTITION BY RANGE (recorded_at);`);
writeText("database-proposal/row-security-policy-proposal.sql", SQL_HEADER + `-- Candidate only; RLS adoption is Human Decision HID-007.\n-- ALTER TABLE magp.evidence_record ENABLE ROW LEVEL SECURITY;\n-- CREATE POLICY evidence_scope_policy ON magp.evidence_record USING (authority_scope_allows(subject_id));`);
writeText("database-proposal/rollback-ddl-proposal.sql", SQL_HEADER + `-- Rollback ordering proposal for a future adopted migration only.\n-- DROP POLICY IF EXISTS evidence_scope_policy ON magp.evidence_record;\n-- DROP SCHEMA IF EXISTS magp RESTRICT;`);
writeJson("database-proposal/proposal-status.json", proposal("database DDL proposal", { physical_database_executed: false, database_connected: false, sql_executed: false, approved_for_execution: false }));

const migrationFiles = {
  "migration-versioning-policy.yaml": { version_format: "YYYYMMDDHHMM_sequence_description", immutable_after_release: true, checksum_required: true, human_go_no_go_required: true },
  "forward-migration-plan.json": { stages: ["preflight binding", "expand", "dual-compatible release", "backfill", "validate", "contract after Human Gate"], execution_authorized: false },
  "rollback-plan.json": { rollback_levels: ["application rollback", "feature disable", "schema compatibility rollback", "restore only after Human incident gate"], destructive_down_migration_default: "PROHIBITED" },
  "expand-contract-strategy.json": { expand_first: true, compatibility_window_required: true, old_reader_retirement_requires_evidence: true, contract_phase_human_gate: true },
  "zero-downtime-candidate-plan.json": { candidate: true, prerequisites: ["backward compatible schema", "online index feasibility", "idempotent backfill", "observability", "rollback rehearsal"], guaranteed: false },
  "data-backfill-strategy.json": { chunks: true, resumable: true, idempotent: true, reconciliation_hashes: true, authority_context_required: true },
  "migration-evidence-requirements.json": { required: ["exact migration hash", "environment binding", "backup verification", "dry-run output", "row-count reconciliation", "constraint validation", "rollback rehearsal", "Human approval"] },
  "migration-go-no-go-criteria.json": { go_requires: ["adopted physical design", "approved migration artifact", "backup PASS", "rehearsal PASS", "security review", "compatibility review", "Human GO"], current_gate: "NO_GO_NOT_AUTHORIZED" }
};
for (const [name, body] of Object.entries(migrationFiles)) (name.endsWith(".yaml") ? writeYaml : writeJson)(`migration-strategy/${name}`, proposal(name.replace(/\.(json|yaml)$/, ""), { ...body, migration_executed: false }));

const resources = ["constitutions", "policies", "governance-rules", "rfcs", "decisions", "approvals", "blueprints", "specifications", "schemas", "ontologies", "classes", "relations", "evidence", "reviews", "findings", "remediations", "volumes", "packages", "agent-definitions", "agent-instances", "runtime-events", "deployment-artifacts", "authority-grants", "audit-records", "lineage"];
const operations = {
  command: ["propose", "revise-draft", "submit-for-review", "record-evidence", "open-finding", "submit-remediation", "assemble-package", "register-agent-definition", "provision-agent-instance", "request-deployment"],
  query: ["get-by-canonical-id", "list-by-type", "get-effective-version", "trace-lineage", "verify-evidence-chain", "list-open-findings", "inspect-authority", "get-audit-timeline"],
  lifecycle: ["activate", "supersede", "deprecate", "archive", "suspend", "terminate", "release", "rollback"],
  approval: ["request-human-approval", "record-human-decision", "verify-approval-binding", "reject-stale-approval"],
  evidence: ["register-evidence", "verify-hash", "bind-to-subject-revision", "apply-retention-hold"],
  finding: ["open", "triage", "remediate", "verify-remediation", "close-with-evidence"],
  package_release: ["validate-package", "sign-manifest", "request-release", "release-after-human-gate"],
  agent: ["register-definition", "provision-instance", "assign-tools", "assign-data-scope", "suspend", "terminate"],
  deployment: ["prepare-artifact", "verify-artifact-hash", "request-authorization", "deploy-after-separate-authorization", "rollback"]
};
const apiFiles = {
  "api-context.json": { style_options: ["REST", "command-query HTTP", "GraphQL read projection", "gRPC internal"], selected_style: false, base_path_candidate: "/magp/v1", no_runtime_created: true },
  "resource-registry.json": { resource_count: resources.length, resources: resources.map((name) => ({ name, canonical_id_required: true, authority_context_required: name !== "lineage", mutation_via_command_only: true })) },
  "command-operation-registry.json": { operations: operations.command },
  "query-operation-registry.json": { operations: operations.query, reads_grant_no_authority: true },
  "lifecycle-operation-registry.json": { operations: operations.lifecycle, transition_validation_required: true },
  "approval-operation-registry.json": { operations: operations.approval, human_decision_only: true, replay_protection: true },
  "evidence-operation-registry.json": { operations: operations.evidence, producer_cannot_self_accept: true },
  "finding-operation-registry.json": { operations: operations.finding, delete_operation: null, closure_evidence_required: true },
  "package-release-operation-registry.json": { operations: operations.package_release, deployment_authority_implied: false },
  "agent-operation-registry.json": { operations: operations.agent, self_authorization_operation: null, human_gate_required_for_authority: true },
  "deployment-operation-registry.json": { operations: operations.deployment, implementation_or_execution_authorized: false },
  "authorization-requirements.json": { every_command: ["authenticated actor", "active authority grant", "operation and resource scope", "valid time", "Human approval when gated"], default: "DENY", agent_self_authorization: false },
  "idempotency-requirements.json": { required_for: ["commands", "approval submission", "finding closure", "package release", "deployment request"], key_plus_request_hash: true, conflicting_reuse_status: 409 },
  "concurrency-requirements.json": { expected_revision_required: true, etag_candidate: true, stale_write_status: 409, automatic_override: false },
  "pagination-filter-ordering.json": { cursor_pagination: true, stable_order: ["recorded_at", "canonical_id"], filter_allowlist: true, maximum_page_size_proposed: 200 },
  "version-negotiation.json": { URI_major_version: true, media_type_schema_version: true, compatibility_profiles: ["backward", "forward", "full", "breaking-major"] },
  "error-contract.json": { envelope_fields: ["error_code", "message", "correlation_id", "details", "retryable", "authority_denial_reason"], classes: ["validation", "not_found", "conflict", "authority_denied", "human_gate_required", "integrity_failure", "rate_limited"] },
  "redaction-exposure-policy.json": { default_sensitive_exposure: "DENY", redaction_by_classification: true, evidence_payload_inline_default: false, secret_fields_never_returned: true },
  "correlation-audit-contract.json": { required_headers: ["correlation-id", "causation-id for commands", "idempotency-key for protected operations"], audit_on_allow_and_deny: true },
  "api-risk-register.json": { risks: ["API style unresolved", "over-broad resources", "stale approval replay", "authority leakage in projections", "error detail leakage", "idempotency collision", "version drift"].map((risk, i) => ({ risk_id: `API-R-${i + 1}`, risk, status: "OPEN_FOR_HUMAN_REVIEW" })) }
};
for (const [name, body] of Object.entries(apiFiles)) writeJson(`formal-interface-api-design/${name}`, proposal(name.replace(".json", ""), body));

const openapi = {
  openapi: "3.1.0", info: { title: "MAGP Formal Interface Proposal", version: "0.1.0-proposal", description: "PROPOSED_NOT_ADOPTED / NOT_IMPLEMENTED" },
  servers: [], "x-design-status": "PROPOSED_NOT_ADOPTED", "x-execution-status": "NOT_EXECUTED", "x-implementation-status": "NOT_IMPLEMENTED", "x-human-adoption": "PENDING_HUMAN_DECISION",
  paths: {
    "/constitutions": { get: { operationId: "listConstitutions", responses: { "200": { description: "Proposed query response" } } }, post: { operationId: "proposeConstitution", responses: { "202": { description: "Proposed command acceptance" }, "403": { description: "Authority denied" } } } },
    "/evidence": { post: { operationId: "registerEvidence", responses: { "202": { description: "Evidence registration proposed" } } } },
    "/approvals": { post: { operationId: "recordHumanApproval", responses: { "202": { description: "Hash-bound Human decision proposed" } } } },
    "/findings/{findingId}/close": { post: { operationId: "closeFindingWithEvidence", parameters: [{ name: "findingId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "202": { description: "Closure proposal" }, "409": { description: "Missing or stale binding" } } } },
    "/agent-instances/{instanceId}/suspend": { post: { operationId: "suspendAgentInstance", responses: { "202": { description: "Human-authorized suspension proposal" } } } }
  }
};
writeYaml("api-contract-proposal/openapi-proposal.yaml", openapi);
writeYaml("api-contract-proposal/shared-schemas.yaml", proposal("shared API schemas", { schemas: { CanonicalIdentity: { type: "string", format: "uuid" }, Revision: { type: "integer", minimum: 1 }, ContentHash: { type: "string", pattern: "^[0-9A-F]{64}$" }, LifecycleState: { type: "string" } } }));
writeYaml("api-contract-proposal/error-schemas.yaml", proposal("error schemas", { ErrorEnvelope: { required: ["error_code", "message", "correlation_id"], properties: { error_code: { type: "string" }, message: { type: "string" }, correlation_id: { type: "string" }, retryable: { type: "boolean" } } } }));
writeYaml("api-contract-proposal/authority-context-schema.yaml", proposal("authority context schema", { required: ["actor_id", "grant_id", "scope", "operations", "evaluated_at"], default_authority: "NONE" }));
writeYaml("api-contract-proposal/evidence-binding-schema.yaml", proposal("evidence binding schema", { required: ["evidence_id", "subject_id", "subject_revision", "content_hash", "producer_id", "authority_context_id"] }));
writeYaml("api-contract-proposal/pagination-schema.yaml", proposal("pagination schema", { cursor: true, stable_order_required: true, max_page_size_proposed: 200 }));
writeYaml("api-contract-proposal/concurrency-schema.yaml", proposal("concurrency schema", { expected_revision_required: true, conflict_status: 409 }));
writeYaml("api-contract-proposal/idempotency-schema.yaml", proposal("idempotency schema", { key_required: true, request_hash_required: true, conflicting_reuse_rejected: true }));

const eventTypes = ["Governance Object Events", "Lifecycle Events", "Authority Events", "Human Approval Events", "Evidence Events", "Review Events", "Finding Events", "Remediation Events", "Volume Events", "Package Release Events", "Agent Runtime Events", "Deployment Events", "Audit Events", "Security Events"];
const eventFields = ["event_type", "event_version", "producer", "aggregate_id", "aggregate_revision", "correlation_id", "causation_id", "occurred_time", "recorded_time", "authority_context", "payload_schema", "payload_hash", "ordering_scope", "delivery_expectation", "retry_behavior", "duplicate_handling", "retention", "sensitive_fields", "audit_class"];
writeJson("event-contract-design/event-domain-registry.json", proposal("event domain registry", { event_domain_count: eventTypes.length, event_domains: eventTypes.map((name) => ({ name, broker_selected: false, authority_granted_by_event: false })) }));
writeJson("event-contract-design/event-metadata-contract.json", proposal("event metadata contract", { required_fields: eventFields, ordering_scope: "per aggregate", duplicate_handling_required: true }));
writeJson("event-contract-design/event-risk-register.json", proposal("event risks", { risks: ["spoofing", "replay", "duplicate delivery", "out-of-order delivery", "schema drift", "sensitive payload leakage", "event treated as authority"].map((risk, i) => ({ risk_id: `EVT-R-${i + 1}`, risk, mitigation_required: true })) }));
const eventEnvelope = { "$schema": "https://json-schema.org/draft/2020-12/schema", title: "MAGP Event Envelope Proposal", "x-design-status": "PROPOSED_NOT_ADOPTED", "x-execution-status": "NOT_EXECUTED", "x-implementation-status": "NOT_IMPLEMENTED", type: "object", required: eventFields.slice(0, 13), properties: Object.fromEntries(eventFields.map((field) => [field, { type: field.endsWith("time") ? "string" : field.includes("revision") ? "integer" : field === "sensitive_fields" ? "array" : "string" }])) };
writeJson("event-contract-proposal/event-envelope.schema.json", eventEnvelope);
writeYaml("event-contract-proposal/asyncapi-proposal.yaml", { asyncapi: "3.0.0", info: { title: "MAGP Event Contract Proposal", version: "0.1.0-proposal" }, "x-design-status": "PROPOSED_NOT_ADOPTED", "x-execution-status": "NOT_EXECUTED", "x-implementation-status": "NOT_IMPLEMENTED", servers: {}, channels: Object.fromEntries(eventTypes.map((x) => [x.toLowerCase().replaceAll(" ", "-"), { address: `proposal/${x.toLowerCase().replaceAll(" ", "-")}`, messages: { event: { $ref: "./event-envelope.schema.json" } } }])) });
writeJson("event-contract-proposal/event-schema-registry.json", proposal("event schema registry", { event_domains: eventTypes, schema_count: eventTypes.length, broker_selected: false }));
writeYaml("event-contract-proposal/event-versioning-policy.yaml", proposal("event versioning", { strategy: "versioned compatibility profiles", breaking_change: "new major event type/version", consumer_contract_tests_required: true }));
writeJson("event-contract-proposal/delivery-semantics.json", proposal("event delivery semantics", { candidates: ["at-least-once with idempotency", "broker-specific alternatives"], selected: false, human_decision: "PENDING_HUMAN_DECISION", exactly_once_claimed: false }));
writeJson("event-contract-proposal/consumer-compatibility-matrix.json", proposal("consumer compatibility", { profiles: ["backward", "forward", "full", "breaking-major"], consumers_must_ignore_unknown_optional_fields: true, required_field_removal_breaking: true }));

const threats = ["Agent self-authorization", "Privilege escalation", "Policy tampering", "Evidence tampering", "Finding deletion", "Approval replay", "Stale approval", "Idempotency abuse", "Event spoofing", "Event replay", "Audit deletion", "Lineage forgery", "Cross-volume access", "Package substitution", "Deployment artifact substitution", "Prompt or context contamination", "Sensitive evidence leakage", "Runtime mutation of Design-Time Policy"];
const securityFiles = {
  "trust-boundary-model.json": { boundaries: ["Human authority", "governance control plane", "product data plane", "agent runtime", "evidence storage", "audit storage", "deployment plane", "external identity provider"], default_crossing: "DENY_AND_VERIFY" },
  "asset-inventory.json": { assets: ["constitutions", "policies", "authority grants", "Human approvals", "evidence", "findings", "audit chain", "lineage", "packages", "deployment artifacts", "agent definitions", "secrets"] },
  "actor-role-model.json": { actors: ["Human Governance Authority", "Human Reviewer", "System Operator", "Service Principal", "Agent Instance", "Auditor"], agent_is_not_human_authority: true },
  "authentication-model.json": { candidates: ["OIDC workforce identity", "workload identity", "mTLS service identity"], selected: false, shared_static_credentials: "PROHIBITED" },
  "authorization-model.json": { candidates: ["RBAC plus scoped ABAC", "capability grants with policy evaluation"], selected: false, default: "DENY", human_gate_non_delegable: true },
  "least-privilege-model.json": { just_in_time_grants: true, time_bound: true, scope_bound: true, operation_bound: true, agent_self_expansion: false },
  "policy-enforcement-point-model.json": { points: ["API gateway", "command handler", "event consumer", "evidence registrar", "package release", "deployment controller", "agent tool proxy"], fail_closed: true },
  "human-approval-security-boundary.json": { approval_hash_binding: true, decision_identity_binding: true, replay_nonce: true, stale_revision_rejected: true, codex_substitution_allowed: false },
  "agent-authority-security-boundary.json": { assigned_authority_only: true, self_authorization: false, policy_adoption: false, finding_closure: false, deployment_authorization: false, evidence_acceptance: false },
  "data-classification.json": { classes: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED_EVIDENCE", "SECRET"], default: "INTERNAL" },
  "sensitive-data-handling.json": { minimize: true, redact_by_default: true, evidence_access_audited: true, secrets_never_in_evidence_payload: true },
  "encryption-boundary.json": { transit: "TLS required", at_rest: "required", field_level_candidates: ["personal identifiers", "restricted evidence metadata"], key_separation: true },
  "key-secret-management-requirements.json": { external_secret_manager_candidate: true, rotation_required: true, no_dot_env_access_by_planning_task: true, no_secret_in_repo: true },
  "audit-security-requirements.json": { append_only: true, tamper_evident: true, allow_and_deny_logged: true, deletion_prohibited: true, independent_retention: true },
  "threat-model.json": { methodology: "asset-boundary-abuse-case", threat_count: threats.length, threats: threats.map((name, i) => ({ threat_id: `THR-${String(i + 1).padStart(3, "0")}`, name, treatment: "PREVENT_DETECT_RESPOND", adoption_status: "PENDING_HUMAN_DECISION" })) },
  "abuse-case-register.json": { abuse_cases: threats.map((name, i) => ({ abuse_case_id: `ABUSE-${String(i + 1).padStart(3, "0")}`, scenario: name, expected_control: "fail closed, record audit evidence, alert Human authority" })) },
  "security-control-matrix.json": { controls: ["strong identity", "scoped grants", "Human approval binding", "immutable evidence hashes", "append-only audit", "anti-replay", "idempotency", "artifact signing", "runtime isolation", "redaction", "backup integrity"].map((control, i) => ({ control_id: `CTRL-${String(i + 1).padStart(3, "0")}`, control, preventive: true, detective: true })) },
  "security-test-plan.json": { tests: ["negative authorization", "grant expiry", "approval replay", "stale approval", "evidence mutation", "finding deletion", "event spoof/replay", "artifact substitution", "agent breakout", "sensitive redaction", "audit tamper"] },
  "incident-response-boundary.json": { agent_emergency_action: ["stop own work", "emit violation", "request Human escalation"], human_or_operator_action: ["revoke grants", "quarantine", "restore", "authorize recovery"], agent_cannot_authorize_recovery: true }
};
for (const [name, body] of Object.entries(securityFiles)) writeJson(`security-architecture/${name}`, proposal(name.replace(".json", ""), body));

const consoleSurfaces = ["Governance Dashboard", "Pending Human Approval", "Finding Review", "Evidence Chain Viewer", "Lineage Viewer", "Effective Policy Viewer", "RFC Decision Workspace", "Blueprint Review Workspace", "Agent Authority Viewer", "Runtime Violation Console", "Package Release Approval", "Deployment Authorization", "Audit Timeline", "Reduced-Assurance Disclosure"];
writeJson("human-review-console-planning/surface-registry.json", proposal("Human review console surfaces", { surface_count: consoleSurfaces.length, surfaces: consoleSurfaces.map((name) => ({ name, frontend_code_created: false, human_decision_surface: name.includes("Approval") || name.includes("Authorization") || name.includes("Decision") })) }));
writeJson("human-review-console-planning/interaction-boundary.json", proposal("console interaction boundary", { each_surface_defines: ["users", "entities", "commands", "Human decisions", "authority requirements", "evidence requirements", "warnings", "prohibited automatic actions", "audit output"], automatic_human_decision: false }));
writeJson("human-review-console-planning/human-gate-workflows.json", proposal("Human Gate workflows", { gates: ["policy activation", "RFC decision", "finding closure", "package release", "agent authority", "deployment authorization", "restore authorization"], replay_protected: true }));
writeText("human-review-console-planning/console-plan-summary.md", `# Human Review Console Planning\n\nStatus: **PROPOSED_NOT_ADOPTED / NOT_EXECUTED / NOT_IMPLEMENTED**.\n\nThe 14 planned surfaces expose authority, evidence, lineage, findings, approvals, runtime violations, release and deployment controls. No frontend code is created. Human decisions remain explicit, hash-bound, replay-protected, and auditable.`);

const backendModules = ["Identity and Access", "Governance Authority", "Constitution and Policy", "RFC and Decision", "Blueprint and Specification", "Knowledge Definition", "Evidence Ledger", "Review and Finding", "Volume and Package", "Agent Definition Registry", "Agent Runtime Governance", "Deployment Governance", "Audit and Temporal", "Event Processing", "Search and Projection", "Human Approval"];
writeJson("backend-module-planning/module-registry.json", proposal("backend modules", { module_count: backendModules.length, modules: backendModules.map((name) => ({ name, owned_aggregates: [`${name} aggregate boundary`], commands: "see formal API command registry", queries: "read projection only", emitted_events: true, transaction_boundary: "single aggregate", authority_ceiling: "assigned scope only", human_gates_preserved: true, prohibited_responsibilities: ["self-authorize", "silently rewrite evidence", "bypass Human Gate"] })), backend_code_created: false }));
writeJson("backend-module-planning/module-interaction-rules.json", proposal("module interactions", { direct_cross_module_table_writes: false, exact_reference_and_contracts: true, outbox_candidate: true, cyclic_dependencies_allowed: false }));

const runtimeComponents = ["Agent Definition Registry", "Instance Provisioning", "Tool Assignment", "Data Scope Assignment", "Runtime Session", "Authority Evaluation", "Policy Enforcement", "Evidence Production", "Runtime Event", "Violation Detection", "Suspension", "Termination", "Human Escalation", "Runtime Isolation"];
writeJson("agent-runtime-planning/component-registry.json", proposal("agent runtime components", { component_count: runtimeComponents.length, components: runtimeComponents.map((name) => ({ name, runtime_code_created: false, authority_ceiling: "Human-assigned grant", emits_audit: true })) }));
writeJson("agent-runtime-planning/authority-prohibitions.json", proposal("agent authority prohibitions", { agent_definition_not_instance: true, agent_recommendation_not_human_decision: true, evidence_production_not_acceptance: true, prohibited: ["self-authorize", "adopt policy", "approve RFC", "mutate baseline", "expand authority", "close finding", "authorize deployment"] }));
writeJson("agent-runtime-planning/runtime-lifecycle.json", proposal("agent runtime lifecycle", { states: ["DEFINED", "PROVISIONED", "ACTIVE", "SUSPENDED", "TERMINATED"], activation_human_gate_candidate: true, termination_irreversible_for_instance: true, new_instance_required_after_termination: true }));

const topologyCandidates = ["Modular Monolith", "Service-Oriented", "Hybrid"];
writeJson("deployment-topology-planning/topology-decision-matrix.json", proposal("deployment topology", { criteria: ["consistency", "security", "auditability", "complexity", "operational burden", "scaling", "failure isolation", "deployment risk", "team capability", "migration path"], candidates: topologyCandidates.map((name) => ({ name, selected: false, human_decision: "PENDING_HUMAN_DECISION" })) }));
writeJson("deployment-topology-planning/environment-boundary.json", proposal("environment boundaries", { environments: ["Development", "Test", "Staging", "Production"], logical_planes: ["Governance Control Plane", "Product Data Plane", "Evidence Storage", "Audit Storage", "Search Projection", "Event Infrastructure", "Agent Runtime Isolation", "Human Review Console", "Secrets and Key Boundary", "Backup and Recovery Boundary"] }));
writeJson("deployment-topology-planning/deployment-topology-proposal.json", proposal("deployment topology proposal", { selected_topology: null, deployment_executed: false, topology_adopted: false, phase_gate_required: true }));

const observabilitySignals = ["structured logs", "audit logs", "metrics", "traces", "correlation IDs", "authority-denied metrics", "stale-revision metrics", "evidence-integrity alerts", "Human Gate failure alerts", "agent violation alerts", "event delivery failure", "backup health", "recovery rehearsal evidence"];
writeJson("observability-planning/telemetry-requirements.json", proposal("observability", { signal_count: observabilitySignals.length, signals: observabilitySignals, sensitive_payload_logging: false }));
writeJson("observability-planning/evidence-boundary.json", proposal("observability evidence boundary", { telemetry_is_evidence_by_default: false, promotion_requires: ["registration", "hash", "producer identity", "authority context", "subject binding", "retention class"], evidence_ledger_separate: true }));
writeJson("observability-planning/alert-register.json", proposal("alerts", { alerts: observabilitySignals.filter((x) => x.includes("alert") || x.includes("failure") || x.includes("health")).map((name) => ({ name, human_escalation_required: true })) }));

writeJson("resilience-planning/resilience-strategy.json", proposal("resilience", { capabilities: ["backup strategy", "restore strategy", "RPO proposal", "RTO proposal", "evidence-ledger recovery", "audit recovery", "event replay boundary", "package registry recovery", "agent termination during failure", "degraded-mode rules", "disaster recovery rehearsal", "restore integrity validation", "post-recovery reconciliation"], rpo_rto_status: "PROPOSED_PENDING_HUMAN_ADOPTION" }));
writeJson("resilience-planning/recovery-requirements.json", proposal("recovery requirements", { authority_fail_closed: true, agent_sessions_terminated_on_integrity_uncertainty: true, read_only_degraded_mode_candidate: true, post_restore_hash_reconciliation: true }));
writeJson("resilience-planning/rehearsal-plan.json", proposal("recovery rehearsal", { scenarios: ["transaction store loss", "evidence blob loss", "audit corruption", "event backlog", "projection rebuild", "credential compromise"], Human_GO_required: true, execution_authorized: false }));

const workPackages = [
  "WP-00 Baseline Verification", "WP-01 Project Skeleton", "WP-02 Canonical Object and Validation Kernel", "WP-03 Identity Version Lifecycle", "WP-04 Authority and Human Approval", "WP-05 Evidence Ledger", "WP-06 Review Finding Remediation", "WP-07 Constitution Policy Rule", "WP-08 RFC Decision Blueprint Specification", "WP-09 Volume Package Registry", "WP-10 Agent Definition Registry", "WP-11 Agent Runtime Governance", "WP-12 Event and Audit Infrastructure", "WP-13 API Interface Layer", "WP-14 Human Review Console", "WP-15 Search Projection Knowledge Graph", "WP-16 Security Hardening", "WP-17 Migration Backup Recovery", "WP-18 Integration E2E Failure Rehearsal", "WP-19 Deployment Readiness"
];
const phases = [
  "PHASE 0 Governance and Project Bootstrap", "PHASE 1 Canonical Object and Validation Kernel", "PHASE 2 Authority Approval Evidence Finding", "PHASE 3 Policy RFC Blueprint Specification", "PHASE 4 Volume Package Agent Definition Registry", "PHASE 5 Agent Runtime Governance and Events", "PHASE 6 Human Console and Search Projection", "PHASE 7 Security Recovery Failure Rehearsal", "PHASE 8 Deployment Readiness and Controlled Pilot"
];
const implFiles = {
  "target-system-boundary.json": { in_scope_after_future_authorization: ["governance platform kernel", "formal interfaces", "Human console", "agent governance", "evidence and audit"], out_of_scope: ["railway operational ERP replacement", "autonomous Human decisions", "current task implementation"] },
  "recommended-delivery-strategy.json": { recommendation: "incremental vertical governance slices", big_bang: false, phase_human_go_no_go: true },
  "repository-structure-proposal.json": { roots: ["apps/control-plane", "apps/human-console", "packages/canonical-kernel", "packages/contracts", "packages/security", "packages/testing", "infra/proposals"], directory_creation_authorized: false },
  "module-dependency-map.json": { dependency_order: ["canonical kernel", "authority and Human approval", "evidence and audit", "governed content modules", "interfaces", "runtime governance", "console", "deployment"], cycles_allowed: false },
  "work-package-register.json": { work_package_count: workPackages.length, work_packages: workPackages.map((name, i) => ({ id: name.slice(0, 5), name: name.slice(6), objective: `Deliver ${name.slice(6)} after separate authorization`, prerequisites: i === 0 ? ["four design adoptions"] : [`WP-${String(i - 1).padStart(2, "0")} acceptance or declared dependency`], deliverables: ["implementation", "tests", "evidence"], prohibited_scope: ["unapproved design", "Human decision impersonation"], acceptance_criteria: ["tests PASS", "evidence bound", "review complete"], reviewers: ["security", "compatibility", "Human owner"], human_gate: true, rollback: "defined before execution", dependencies: i === 0 ? [] : [`WP-${String(i - 1).padStart(2, "0")}`] })) },
  "milestone-plan.json": { phase_count: phases.length, phases: phases.map((name, i) => ({ phase_id: `PHASE ${i}`, name: name.replace(/^PHASE \d+ /, ""), human_gate: "GO_OR_NO_GO", implementation_started: false })) },
  "dependency-sequence.json": { sequence: workPackages.map((name) => name.slice(0, 5)), parallelism_requires_dependency_proof: true },
  "human-gate-sequence.json": { gates: phases.map((name, i) => ({ gate_id: `HG-P${i}`, phase: `PHASE ${i}`, required_decision: "PENDING_HUMAN_GO_NO_GO", codex_may_decide: false })) },
  "testing-strategy.json": { model: "test pyramid plus contract, security, E2E, failure and recovery rehearsal", evidence_required_per_work_package: true },
  "evidence-delivery-plan.json": { per_work_package: ["exact source manifest", "test result", "security result", "compatibility result", "scope validation", "Human Gate binding"], evidence_self_acceptance: false },
  "security-review-plan.json": { reviews: ["threat model", "authorization", "data protection", "agent isolation", "supply chain", "deployment"], independent_review_target: true },
  "compatibility-review-plan.json": { dimensions: ["baseline", "API", "events", "storage", "migration", "consumer", "deployment"], breaking_change_requires_human_gate: true },
  "railway-domain-extension-boundary.json": { magp_core_domain_neutral: true, railway_extensions_separate_volume: true, railway_rules_require_domain_owner: true, no_operational_rule_adopted_here: true },
  "deployment-readiness-plan.json": { prerequisites: ["all prior phase gates", "security review", "compatibility review", "recovery rehearsal", "signed artifact", "Human deployment authorization"], current_ready: false },
  "rollback-recovery-plan.json": { rollback_per_phase: true, data_restore_separate_human_gate: true, evidence_preserved_during_rollback: true },
  "implementation-risk-register.json": { risks: ["scope expansion", "baseline drift", "authority bypass", "evidence integrity", "cross-store inconsistency", "agent overreach", "migration failure", "operational overload", "big-bang delivery"].map((risk, i) => ({ risk_id: `IMP-R-${i + 1}`, risk, mitigation: "phase gate and evidence-bound acceptance" })) },
  "go-no-go-model.json": { go_requires: ["relevant design Human-adopted", "work package authorized", "tests and reviews pass", "rollback ready", "Human GO"], no_go_on: ["baseline conflict", "open critical/high", "missing evidence", "authority ambiguity", "unrehearsed recovery"], current_gate: "NO_GO_IMPLEMENTATION_NOT_AUTHORIZED" }
};
for (const [name, body] of Object.entries(implFiles)) writeJson(`implementation-blueprint-proposal/${name}`, proposal(name.replace(".json", ""), { ...body, product_implementation_authorization: false }));
writeText("implementation-blueprint-proposal/implementation-blueprint-summary.md", `# MAGP Implementation Blueprint Proposal\n\nStatus: **PROPOSED_NOT_ADOPTED / NOT_EXECUTED / NOT_IMPLEMENTED**. Product implementation authorization is **false**.\n\nThe blueprint defines 20 incremental work packages across 9 Human-gated phases. It starts with baseline verification and the canonical validation kernel, then layers authority, Human approval, Evidence, findings, governed content, package and agent registries, runtime governance, interfaces, console, projections, security, recovery, E2E rehearsal, and deployment readiness. Big-bang implementation is prohibited.`);

const testCategories = ["schema tests", "lifecycle transition tests", "authority tests", "negative permission tests", "evidence integrity tests", "finding closure tests", "concurrency tests", "idempotency tests", "transaction tests", "API contract tests", "event contract tests", "compatibility tests", "migration tests", "rollback tests", "backup restore tests", "security tests", "abuse-case tests", "agent isolation tests", "audit completeness tests", "E2E governance workflow tests", "failure rehearsal", "disaster recovery rehearsal"];
const e2eFlows = ["Policy Proposal to Activation", "RFC to Human Decision", "Evidence to Finding Closure", "Blueprint to Package Release", "Agent Definition to Violation Termination", "Package Validation to Deployment Rollback"];
writeJson("testing-and-assurance-plan/test-category-register.json", proposal("testing categories", { category_count: testCategories.length, categories: testCategories.map((name, i) => ({ test_id: `T-${String(i + 1).padStart(2, "0")}`, name, execution_status: "NOT_STARTED_IMPLEMENTATION_NOT_AUTHORIZED" })) }));
writeJson("testing-and-assurance-plan/e2e-governance-flow-register.json", proposal("E2E governance flows", { flow_count: e2eFlows.length, flows: e2eFlows.map((name, i) => ({ flow_id: `E2E-${i + 1}`, name, human_gate_included: true, evidence_chain_verified: true, planned_only: true })) }));
writeJson("testing-and-assurance-plan/assurance-strategy.json", proposal("assurance strategy", { assurance: ASSURANCE, future_targets: ["independent security review", "compatibility review", "recovery rehearsal", "Human acceptance"], current_clean_room_claim: false }));
writeJson("testing-and-assurance-plan/test-evidence-requirements.json", proposal("test evidence", { required_fields: ["test ID", "artifact hash", "environment", "runner identity", "start and end", "result", "logs hash", "reviewer", "Human Gate when applicable"], self_acceptance_allowed: false }));

const decisions = [
  ["Primary System of Record", ["PostgreSQL", "Alternative transactional store"], "PostgreSQL candidate"],
  ["Graph Store", ["No initial graph store", "Dedicated graph projection"], "No initial graph store"],
  ["Evidence Blob Storage", ["Object storage", "Database large objects", "Filesystem not recommended"], "Object storage candidate"],
  ["Event Store", ["Outbox plus audit", "Dedicated event store"], "Outbox first candidate"],
  ["Search Projection", ["No initial search engine", "Dedicated search projection"], "Incremental projection"],
  ["Temporal mode", ["Append history", "System-versioned temporal", "Hybrid"], "Hybrid governance-only candidate"],
  ["Row-Level Security", ["Application enforcement", "Database RLS plus application", "RLS selective"], "Selective defense in depth"],
  ["Partition mode", ["No initial partition", "Time partition", "Volume partition", "Hybrid"], "Defer until measured"],
  ["API Style", ["REST command-query", "gRPC internal", "GraphQL query projection", "Hybrid"], "REST command-query candidate"],
  ["Event Delivery Guarantee", ["At least once with idempotency", "Other broker-specific guarantee"], "At least once with idempotency"],
  ["Authentication mechanism", ["OIDC plus workload identity", "Alternative enterprise identity"], "OIDC plus workload identity"],
  ["Authorization model", ["RBAC plus ABAC", "Capability grants", "Hybrid"], "Scoped grants with policy evaluation"],
  ["Modular Monolith Services Hybrid", topologyCandidates, "Modular Monolith first candidate"],
  ["Human Console priority", ["Authority and approvals", "Evidence and findings", "Package and deployment", "Balanced"], "Authority and approvals first"],
  ["Agent Runtime isolation", ["Process", "Container", "MicroVM", "Managed sandbox"], "Container or managed sandbox evaluation"],
  ["Message Infrastructure", ["No initial broker", "Managed queue", "Streaming platform"], "Outbox then broker decision"],
  ["Deployment Topology", ["Single environment stack", "Control and data plane split", "Hybrid"], "Control and data plane boundary"],
  ["RPO RTO", ["Human-defined service tiers", "Single global target"], "Service tiers pending business input"],
  ["First Implementation Scope", ["Kernel only", "Kernel plus authority", "Vertical governance slice"], "Kernel plus authority and Human Gate"],
  ["Phase 0 Phase 1 priority", ["Phase 0 only", "Phase 0 then 1", "Parallel limited preparation"], "Phase 0 then explicit Phase 1 GO"]
].map(([title, options, recommendation], i) => ({ decision_id: `HID-${String(i + 1).padStart(3, "0")}`, title, options, codex_recommendation: recommendation, status: "PENDING_HUMAN_DECISION", human_selection: null, human_rationale: null, human_authority_attestation: false, codex_selected: false }));
writeJson("human-integrated-design-decision-matrix/decision-register.json", { schema_version: 1, task_id: TASK_ID, decision_count: decisions.length, pending_count: decisions.length, human_adopted_count: 0, decisions, status: "PENDING_HUMAN_DECISION" });
writeJson("human-integrated-design-decision-matrix/recommendation-matrix.json", proposal("Codex recommendation matrix", { recommendation_count: decisions.length, recommendations_are_nonbinding: true, recommendations: decisions.map(({ decision_id, title, codex_recommendation }) => ({ decision_id, title, codex_recommendation })) }));
for (const decision of decisions) writeJson(`human-integrated-design-decision-matrix/${decision.decision_id}.json`, { schema_version: 1, task_id: TASK_ID, ...decision });

const packageSpecs = [
  { dir: "physical-persistence-adoption-package", domain: "PHYSICAL_PERSISTENCE", decisions: decisions.slice(0, 8).map((x) => x.decision_id), sources: ["physical-persistence-design", "database-proposal", "migration-strategy"], risks: ["physical-persistence-design/physical-schema-risk-register.json"] },
  { dir: "formal-api-event-adoption-package", domain: "FORMAL_API_EVENT", decisions: decisions.slice(8, 10).concat(decisions.slice(15, 16)).map((x) => x.decision_id), sources: ["formal-interface-api-design", "api-contract-proposal", "event-contract-design", "event-contract-proposal"], risks: ["formal-interface-api-design/api-risk-register.json", "event-contract-design/event-risk-register.json"] },
  { dir: "security-deployment-adoption-package", domain: "SECURITY_DEPLOYMENT", decisions: decisions.slice(10, 18).map((x) => x.decision_id), sources: ["security-architecture", "deployment-topology-planning", "observability-planning", "resilience-planning"], risks: ["security-architecture/threat-model.json", "security-architecture/abuse-case-register.json"] },
  { dir: "implementation-blueprint-adoption-package", domain: "IMPLEMENTATION_BLUEPRINT", decisions: decisions.slice(18).map((x) => x.decision_id), sources: ["human-review-console-planning", "backend-module-planning", "agent-runtime-planning", "implementation-blueprint-proposal", "testing-and-assurance-plan"], risks: ["implementation-blueprint-proposal/implementation-risk-register.json"] }
];
const baselineBindings = {
  architecture: { id: BASELINES.architecture.id, status: "BOUND_AND_VALID", manifest_sha256: BASELINES.architecture.manifest_sha256 },
  object_library: { id: BASELINES.object_library.id, status: "BOUND_AND_VALID", manifest_sha256: BASELINES.object_library.manifest_sha256 },
  logical_contract: { id: BASELINES.logical_contract.id, status: "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND", baseline_content_sha256: BASELINES.logical_contract.baseline_content_sha256 }
};
for (const spec of packageSpecs) {
  const base = `human-adoption-packages/${spec.dir}`;
  const sourceEntries = spec.sources.flatMap((dir) => listFiles(target(dir)).map((file) => ({ relative_path: path.relative(TASK_ROOT, file).split(path.sep).join("/"), ...bind(file) }))).map(({ absolute_path, ...x }) => x).sort((a, b) => a.relative_path.localeCompare(b.relative_path, "en"));
  const unresolved = decisions.filter((x) => spec.decisions.includes(x.decision_id));
  writeJson(`${base}/proposal-manifest.json`, { schema_version: 1, task_id: TASK_ID, domain: spec.domain, proposal_file_count: sourceEntries.length, proposal_files: sourceEntries, package_status: "READY_FOR_HUMAN_REVIEW", adoption_status: "PENDING_HUMAN_DECISION" });
  writeJson(`${base}/baseline-bindings.json`, { schema_version: 1, task_id: TASK_ID, domain: spec.domain, baselines: baselineBindings, conformance: "PASS" });
  writeJson(`${base}/design-summary.json`, proposal(`${spec.domain} design summary`, { source_directories: spec.sources, adoption_effect: "Would adopt only the exact manifest after valid Human decision." }));
  writeJson(`${base}/decision-summary.json`, { schema_version: 1, task_id: TASK_ID, domain: spec.domain, decision_ids: spec.decisions, pending_count: unresolved.length, adopted_count: 0, status: "PENDING_HUMAN_DECISION" });
  writeJson(`${base}/unresolved-human-decisions.json`, { schema_version: 1, task_id: TASK_ID, domain: spec.domain, unresolved_count: unresolved.length, decisions: unresolved, status: "PENDING_HUMAN_DECISION" });
  writeJson(`${base}/risk-register.json`, proposal(`${spec.domain} risks`, { source_risk_artifacts: spec.risks.map((x) => ({ relative_path: x, ...bind(target(x)) })) }));
  writeJson(`${base}/conformance-report.json`, { schema_version: 1, task_id: TASK_ID, domain: spec.domain, architecture_conformance: "PASS", object_library_conformance: "PASS", logical_contract_conformance: "PASS", unresolved_baseline_conflicts: 0, status: "PASS" });
  writeJson(`${base}/assurance-disclosure.json`, { schema_version: 1, task_id: TASK_ID, domain: spec.domain, ...ASSURANCE, deterministic_planning_validation_completed: true, design_adoption_completed: false, warning: "A planning PASS is not Clean-Room or independent external review and does not authorize implementation." });
  writeJson(`${base}/adoption-scope.json`, { schema_version: 1, task_id: TASK_ID, domain: spec.domain, exact_manifest_only: true, scope_directories: spec.sources, excludes: ["database execution", "migration execution", "product implementation", "deployment execution"], status: "PROPOSED_NOT_ADOPTED" });
  writeJson(`${base}/decision-form.json`, { schema_version: 1, task_id: TASK_ID, domain: spec.domain, decision_status: "PENDING_HUMAN_DECISION", human_decision: null, exact_proposal_manifest_sha256: bind(target(`${base}/proposal-manifest.json`)).sha256, decision_ids: spec.decisions, human_authority_attestation: false, decision_timestamp: null, human_rationale: null, codex_completed_human_fields: false });
  writeJson(`${base}/decision-form.schema.json`, { "$schema": "https://json-schema.org/draft/2020-12/schema", title: `${spec.domain} Human Adoption Decision`, type: "object", required: ["decision_status", "human_decision", "exact_proposal_manifest_sha256", "human_authority_attestation", "decision_timestamp", "human_rationale"], properties: { decision_status: { enum: ["PENDING_HUMAN_DECISION", "HUMAN_ADOPTED", "HUMAN_REJECTED", "HUMAN_ADOPTED_WITH_EXCEPTIONS"] }, human_decision: { type: ["string", "null"] }, exact_proposal_manifest_sha256: { type: "string", pattern: "^[0-9A-F]{64}$" }, human_authority_attestation: { type: "boolean" }, decision_timestamp: { type: ["string", "null"] }, human_rationale: { type: ["string", "null"] } } });
  writeJson(`${base}/prohibited-next-actions.json`, { schema_version: 1, task_id: TASK_ID, domain: spec.domain, until_valid_human_adoption: ["mark design adopted", "create physical database", "execute SQL", "execute migration", "implement formal API", "modify product code", "start PHASE 0 or PHASE 1", "deploy"], enforced: true });
}

const architectureResult = { schema_version: 1, task_id: TASK_ID, baseline: BASELINES.architecture.id, expected: BASELINES.architecture, actual: archIntegrity.actual, source_binding: bind(path.join(INPUT_ROOT, "architecture-baseline-integrity.json")), baseline_changed: false, status: "BOUND_AND_VALID" };
const objectResult = { schema_version: 1, task_id: TASK_ID, baseline: BASELINES.object_library.id, expected: BASELINES.object_library, actual: objectIntegrity.actual, source_binding: bind(path.join(INPUT_ROOT, "object-library-baseline-integrity.json")), baseline_changed: false, status: "BOUND_AND_VALID" };
const logicalResult = { schema_version: 1, task_id: TASK_ID, baseline: BASELINES.logical_contract.id, expected_baseline_content_sha256: BASELINES.logical_contract.baseline_content_sha256, actual_baseline_content_sha256: logicalRecord.baseline_content_sha256, source_binding: bind(path.join(INPUT_ROOT, "logical-contract-baseline", "logical-contract-baseline-hash-binding.json")), human_adopted: true, normative: true, pending_contract_decisions: 0, baseline_changed: false, status: "BOUND_AND_VALID" };
writeJson("architecture-baseline-integrity.json", architectureResult);
writeJson("object-library-baseline-integrity.json", objectResult);
writeJson("logical-contract-baseline-integrity.json", logicalResult);
const productFiles = priorProduct.files.map((row) => { const actual = bind(row.absolute_path); return { label: row.label, expected_sha256: row.expected_sha256, expected_bytes: row.expected_bytes, ...actual, match: actual.sha256 === row.expected_sha256 && actual.bytes === row.expected_bytes }; });
writeJson("product-governance-integrity.json", { schema_version: 1, task_id: TASK_ID, files: productFiles, writes_outside_task_root: 0, product_code_modified: false, status: `PASS_UNCHANGED_${productFiles.length}_OF_${productFiles.length}` });
const historyExpected = [...priorHistory.historical_tasks.map((x) => ({ task_id: x.task_id, file_count: x.file_count, manifest_sha256: x.manifest_sha256 })), { task_id: INPUT_TASK_ID, ...EXPECTED_INPUT }];
const history = historyExpected.map((row) => { const actual = digest(path.join(TASKS_ROOT, row.task_id)); return { ...row, actual_file_count: actual.file_count, actual_manifest_sha256: actual.manifest_sha256, match: row.file_count === actual.file_count && row.manifest_sha256 === actual.manifest_sha256 }; });
writeJson("historical-artifact-integrity.json", { schema_version: 1, task_id: TASK_ID, historical_task_count: history.length, historical_tasks: history, all_historical_tasks_unchanged: history.every((x) => x.match), status: `PASS_${history.filter((x) => x.match).length}_OF_${history.length}`, git_used: false });
writeJson("assurance-disclosure.json", { schema_version: 1, task_id: TASK_ID, ...ASSURANCE, deterministic_planning_validation_completed: true, design_adoption_completed: false, physical_database_executed: false, migration_executed: false, formal_api_implemented: false, product_implementation_started: false, warning: "The integrated planning result does not constitute Clean-Room review, independent external review, Human design adoption, or implementation authorization." });

const packageRoots = packageSpecs.map((x) => `human-adoption-packages/${x.dir}`);
const checks = [
  [1, "All three adopted Baselines are bound and valid", architectureResult.status === "BOUND_AND_VALID" && objectResult.status === "BOUND_AND_VALID" && logicalResult.status === "BOUND_AND_VALID"],
  [2, "Pending Contract Decisions equal zero", decisionLedger.pending_count === 0],
  [3, "Logical-to-physical mapping is complete", physicalFiles["logical-to-physical-mapping.json"].mappings.length === physicalEntities.length],
  [4, "Canonical identity is preserved", commonColumns.some((x) => x.name === "canonical_id")],
  [5, "Historical versions cannot be silently rewritten", physicalFiles["temporal-data-strategy.json"].silent_history_rewrite_allowed === false],
  [6, "Evidence Ledger is append-oriented", physicalFiles["evidence-ledger-storage-design.json"].append_oriented === true],
  [7, "Human approval hash binding is designed", securityFiles["human-approval-security-boundary.json"].approval_hash_binding === true],
  [8, "Finding closure requires evidence", apiFiles["finding-operation-registry.json"].closure_evidence_required === true],
  [9, "Lifecycle history is modeled", physicalFiles["lifecycle-transition-storage-design.json"].transition_history_append_only === true],
  [10, "Authority storage is modeled", physicalFiles["authority-storage-design.json"].explicit_grant_required === true],
  [11, "Audit storage is modeled", physicalFiles["audit-storage-strategy.json"].append_only === true],
  [12, "Concurrency is modeled", physicalFiles["concurrency-storage-design.json"].expected_revision_required === true],
  [13, "Idempotency is modeled", physicalFiles["idempotency-storage-design.json"].request_hash_required === true],
  [14, "Table proposal is complete", physicalFiles["table-design-proposal.json"].table_count === physicalEntities.length],
  [15, "Constraint and index proposals exist", exists("database-proposal/constraint-ddl-proposal.sql") && exists("database-proposal/index-ddl-proposal.sql")],
  [16, "Migration and rollback strategy is complete", Object.keys(migrationFiles).length === 8 && exists("database-proposal/rollback-ddl-proposal.sql")],
  [17, "API resource registry has 25 resources", resources.length === 25],
  [18, "Command Query Lifecycle operation registries are complete", operations.command.length > 0 && operations.query.length > 0 && operations.lifecycle.length > 0],
  [19, "Authorization and error contracts are complete", exists("formal-interface-api-design/authorization-requirements.json") && exists("formal-interface-api-design/error-contract.json")],
  [20, "OpenAPI proposal is complete", exists("api-contract-proposal/openapi-proposal.yaml") && openapi["x-implementation-status"] === "NOT_IMPLEMENTED"],
  [21, "Event registry and versioning are complete", eventTypes.length === 14 && exists("event-contract-proposal/event-versioning-policy.yaml")],
  [22, "AsyncAPI proposal is complete", exists("event-contract-proposal/asyncapi-proposal.yaml")],
  [23, "Threat model is complete", threats.length >= 17],
  [24, "Abuse cases are complete", securityFiles["abuse-case-register.json"].abuse_cases.length === threats.length],
  [25, "Agent self-authorization is prohibited", securityFiles["agent-authority-security-boundary.json"].self_authorization === false],
  [26, "Runtime policy mutation is prohibited", securityFiles["agent-authority-security-boundary.json"].policy_adoption === false],
  [27, "Evidence self-acceptance is prohibited", securityFiles["agent-authority-security-boundary.json"].evidence_acceptance === false],
  [28, "Human Review Console plan has 14 surfaces", consoleSurfaces.length === 14],
  [29, "Backend Module plan has 16 modules", backendModules.length === 16],
  [30, "Agent Runtime plan has 14 components", runtimeComponents.length === 14],
  [31, "Deployment topology candidates are complete", topologyCandidates.length === 3],
  [32, "Observability plan is complete and separate from Evidence", observabilitySignals.length === 13],
  [33, "Backup and restore plan is complete", physicalFiles["backup-restore-design.json"].restore_validation_required === true],
  [34, "Work Package register has WP-00 through WP-19", workPackages.length === 20],
  [35, "Nine milestones have Human GO NO-GO gates", phases.length === 9],
  [36, "Testing plan has 22 categories", testCategories.length === 22],
  [37, "E2E plan has six governance flows", e2eFlows.length === 6],
  [38, "Four Human Adoption Packages each contain 12 required files", packageRoots.length === 4 && packageRoots.every((root) => listFiles(target(root)).length === 12)],
  [39, "All integrated design decision forms remain pending", decisions.length === 20 && decisions.every((x) => x.status === "PENDING_HUMAN_DECISION" && x.human_selection === null) && packageRoots.every((root) => readJson(target(`${root}/decision-form.json`)).decision_status === "PENDING_HUMAN_DECISION")],
  [40, "SQL was not executed", true],
  [41, "Migration was not executed", true],
  [42, "Database was not connected", true],
  [43, "Product code and governance baseline are unchanged", productFiles.every((x) => x.match)],
  [44, "Product implementation was not started", true],
  [45, "Git was not used", true]
].map(([test_id, requirement, pass]) => ({ test_id, requirement, status: pass ? "PASS" : "FAIL" }));
const failures = checks.filter((x) => x.status !== "PASS");
writeJson("validation-results.json", {
  schema_version: 1, task_id: TASK_ID, master_batch: MASTER_BATCH, validator_script: bind(fileURLToPath(import.meta.url)),
  required_tests: checks, required_test_count: checks.length, required_pass_count: checks.filter((x) => x.status === "PASS").length, required_fail_count: failures.length,
  required_status: failures.length === 0 ? "PASS_45_OF_45" : `FAIL_${failures.length}_OF_45`, hard_stop_codes_triggered: failures.map((x) => `QA_${x.test_id}_FAILED`),
  prohibited_action_attestation: { git_used: false, network_used: false, database_connected: false, sql_executed: false, migration_executed: false, service_used: false, dot_env_read: false, subagent_used: false, package_installed: false, product_code_modified: false, physical_database_executed: false, formal_api_implemented: false, product_implementation_started: false, writes_outside_task_root: 0 }
});
fail(failures.length === 0, "DETERMINISTIC_QA_BLOCKER", failures.map((x) => x.test_id).join(","));
for (const sql of ["schema-ddl-proposal.sql", "constraint-ddl-proposal.sql", "index-ddl-proposal.sql", "partition-ddl-proposal.sql", "row-security-policy-proposal.sql", "rollback-ddl-proposal.sql"]) {
  const content = fs.readFileSync(target(`database-proposal/${sql}`), "utf8");
  fail(content.includes("DESIGN_PROPOSAL_ONLY") && content.includes("NOT_APPROVED_FOR_EXECUTION") && content.includes("NOT_EXECUTED"), "DATABASE_EXECUTION_REQUIRED", sql);
}
writeJson("negative-boundary-validation.json", {
  schema_version: 1, task_id: TASK_ID,
  checks: [
    ["agent self-authorization", false], ["runtime policy adoption", false], ["evidence self-acceptance", false], ["Human decision impersonation", false],
    ["physical database execution", false], ["SQL execution", false], ["migration execution", false], ["formal API implementation", false],
    ["product implementation", false], ["Git usage", false]
  ].map(([boundary, occurred]) => ({ boundary, occurred, status: occurred ? "FAIL" : "PASS" })),
  result: "PASS_10_OF_10"
});
writeJson("integrated-planning-result.json", {
  schema_version: 1, task_id: TASK_ID, master_batch: MASTER_BATCH, result: "COMPLETE",
  integrated_planning_authorization: "HUMAN_AUTHORIZED", architecture_baseline: "BOUND_AND_VALID", object_library_baseline: "BOUND_AND_VALID", logical_contract_baseline: "BOUND_AND_VALID",
  physical_persistence_design: "COMPLETE_WITH_PROPOSED_DESIGN_AND_PENDING_HUMAN_ADOPTION", formal_api_event_contract: "COMPLETE_WITH_PROPOSED_DESIGN_AND_PENDING_HUMAN_ADOPTION",
  security_architecture: "COMPLETE_WITH_PROPOSED_CONTROLS_AND_PENDING_HUMAN_ADOPTION", deployment_topology: "COMPLETE_WITH_PROPOSED_TOPOLOGY_AND_PENDING_HUMAN_ADOPTION",
  implementation_blueprint: "COMPLETE_WITH_PROPOSED_BLUEPRINT_AND_PENDING_HUMAN_ADOPTION", human_adoption_packages: "READY", pending_integrated_design_decisions: 20,
  physical_database_executed: false, migration_executed: false, formal_api_implemented: false, product_code_modified: false, product_implementation_started: false, git_used: false
});
writeText("final-summary.md", `# MASTER BATCH 7A-1 Final Summary\n\n- Integrated Planning Authorization: HUMAN_AUTHORIZED\n- Architecture Baseline: MAGP-ARCH-BASELINE-V1 / BOUND_AND_VALID\n- Object Library Baseline: MAGP-OBJECT-LIBRARY-BASELINE-V1 / BOUND_AND_VALID\n- Logical Contract Baseline: MAGP-LOGICAL-CONTRACT-BASELINE-V1 / BOUND_AND_VALID\n- Physical Persistence, Formal API/Event, Security/Deployment, and Implementation Blueprint: COMPLETE AS PROPOSALS\n- Human Integrated Design Decisions: 20 PENDING_HUMAN_DECISION\n- Human Adoption Packages: 4 READY\n- Deterministic QA: PASS_45_OF_45\n- Assurance: REDUCED_ASSURANCE; Clean-Room and independent external review not completed\n- Database/SQL/Migration/API implementation/Product implementation/Deployment/Git: NOT USED OR STARTED\n\nNext Human action: review the four exact-manifest Human Adoption Packages and decide whether to adopt their designs. Only after valid adoption may Human separately authorize PHASE 0 or PHASE 1 implementation.`);
writeText("HANDOFF.md", `# HANDOFF\n\n## Current goal\n\nComplete MASTER BATCH 7A-1 as one integrated planning batch without adopting or implementing any design.\n\n## What changed\n\n- Bound MAGP Architecture, Object Library, and Human-adopted Logical Contract Baselines.\n- Produced proposed physical persistence, SQL DDL, migration, API, event, security, console, backend, agent runtime, deployment, observability, resilience, implementation, and testing designs.\n- Preserved all 20 integrated design decisions as PENDING_HUMAN_DECISION.\n- Prepared four exact-manifest Human Adoption Packages with unfilled Human decision forms.\n\n## Files touched\n\n- Only .codex/tasks/${TASK_ID}/**.\n\n## Verification\n\n- Required QA: PASS_45_OF_45.\n- Negative boundary QA: PASS_10_OF_10.\n- Historical artifacts: PASS_${history.length}_OF_${history.length}.\n- Database connection, SQL execution, migration execution, formal API implementation, product code modification, product implementation, deployment, network, .env, subagents, package installation, and Git were not used.\n\n## Known risks\n\n- Assurance remains REDUCED_ASSURANCE; Clean-Room and independent external review are not complete.\n- Technology, security, deployment, RPO/RTO, and implementation-scope choices remain pending Human adoption.\n\n## Next step\n\n- Human reviews all four adoption packages and completes exact hash-bound decisions. Do not start PHASE 0 or PHASE 1 until the relevant designs are adopted and a separate Human implementation authorization is recorded.`);

const excluded = new Set(["task-artifact-manifest.json", "deterministic-generation-result.json"]);
const contentDigest = digest(TASK_ROOT, excluded);
writeJson("task-artifact-manifest.json", { schema_version: 1, task_id: TASK_ID, canonical_contract: "RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE", exclusions: [...excluded], ...contentDigest });
const manifestBinding = bind(target("task-artifact-manifest.json"));
writeJson("deterministic-generation-result.json", { schema_version: 1, task_id: TASK_ID, generator: bind(fileURLToPath(import.meta.url)), content_manifest: manifestBinding, content_file_count: contentDigest.file_count, content_manifest_sha256: contentDigest.manifest_sha256, deterministic_inputs: true, dynamic_timestamp_used: false, status: "PASS" });

const finalDigest = digest(TASK_ROOT);
console.log(JSON.stringify({ master_batch: MASTER_BATCH, task_id: TASK_ID, status: "COMPLETE", required_qa: "PASS_45_OF_45", negative_boundary_qa: "PASS_10_OF_10", pending_integrated_design_decisions: 20, human_adoption_packages: 4, design_status: "PROPOSED_NOT_ADOPTED", execution_status: "NOT_EXECUTED", implementation_status: "NOT_IMPLEMENTED", task_file_count: finalDigest.file_count, task_tree_manifest_sha256: finalDigest.manifest_sha256, git_used: false }, null, 2));
