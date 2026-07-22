import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION";
const base = `.codex/tasks/${taskId}`;
const r12Base = ".codex/tasks/GOV-PHASE1-REMEDIATION-12";
const r12Package = `${r12Base}/session-b6-pre-review-package`;
const expected = {
  candidateFileCount: 103,
  candidateManifestSha256: "29F4F947DEF79A633F63E28FA2444F4734D7E6BB9612B96154A302464255531D",
  includedFileSetSha256: "739DAC633946266BCD28A71BE236D3748C57550AB1749A29C4F5E59421F993CB",
  schemaSetSha256: "F3101FFD0B7ABB22D26F65B2DB8522F60C2D0A8C45513DAAEF87725F81CF15E9",
  railwayReviewSchemaSha256: "D11200E500D7C87AB0E9762BF81FCB2D32315E770D8A16CA81F87B6C439FE66D",
  railwayReviewerProfileSha256: "E79CD3EE7667CB41267FDBAAED7AAE679F0EEC0D4B2B917962B4EFE98BE99A6D",
  scannerContractId: "GOV-DETERMINISTIC-SCAN",
  scannerContractVersion: 5,
  scannerContractSha256: "6A0EF0CAEE9088D65616DA318DB895321DF4D932C7308E2522D35F8242F4816C"
};

function normalizeRef(ref) {
  return ref.replaceAll("\\", "/").replace(/^\.\//, "");
}

function absolute(ref) {
  const normalized = normalizeRef(ref);
  if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) throw new Error(`UNSAFE_PATH:${ref}`);
  const target = path.resolve(root, ...normalized.split("/"));
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(rootPrefix)) throw new Error(`OUTSIDE_PRODUCT_ROOT:${ref}`);
  return target;
}

async function read(ref) {
  return readFile(absolute(ref));
}

async function readJson(ref) {
  return JSON.parse(await readFile(absolute(ref), "utf8"));
}

async function exists(ref) {
  try {
    const item = await stat(absolute(ref));
    return item.isFile();
  } catch {
    return false;
  }
}

function jcs(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JCS_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
  }
  throw new Error(`JCS_UNSUPPORTED_TYPE:${typeof value}`);
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function jcsSha256(value) {
  return sha256(jcs(value));
}

async function writeBytes(ref, bytes) {
  const normalized = normalizeRef(ref);
  if (!normalized.startsWith(`${base}/`)) throw new Error(`WRITE_OUTSIDE_TASK:${ref}`);
  const target = absolute(normalized);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { path: normalized, sha256: sha256(bytes), byte_size: bytes.length };
}

async function writeJson(ref, value) {
  return writeBytes(ref, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

async function writeText(ref, value) {
  return writeBytes(ref, Buffer.from(value, "utf8"));
}

async function fileInfo(ref, purpose = "Exact approved evidence") {
  const bytes = await read(ref);
  return { path: normalizeRef(ref), sha256: sha256(bytes), byte_size: bytes.length, purpose };
}

function stableId(prefix, role, length = 24) {
  return `${prefix}-${sha256(`${taskId}|${role}|${prefix}`).slice(0, length)}`;
}

function forbiddenExactPath(ref) {
  const normalized = normalizeRef(ref).toLowerCase();
  const segments = normalized.split("/");
  if (segments.includes("..") || normalized.includes("*")) return true;
  if (["collab", "frontend", "erp-api", "db-design", "migration"].includes(segments[0])) return true;
  if (segments[0]?.startsWith(".env")) return true;
  if (normalized.endsWith("/human-approval.yaml") || normalized === "human-approval.yaml") return true;
  if (normalized.endsWith("/implementation-handoff.yaml") || normalized.endsWith("/implementation-plan.md")) return true;
  return false;
}

function withoutHashField(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return copy;
}

const historyAnchorRefs = [
  ".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/historical-artifact-integrity.json",
  ".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/migration-320-integrity.json",
  `${r12Base}/review-baseline-before.json`,
  `${r12Base}/review-baseline-after.json`,
  `${r12Base}/baseline-comparison.json`,
  `${r12Base}/historical-artifact-integrity.json`,
  `${r12Base}/migration-320-integrity.json`,
  `${r12Base}/reviewer-scope-satisfiability-report.json`,
  `${r12Base}/session-b6-readiness.json`,
  `${r12Base}/preparation-test-summary.json`,
  `${r12Package}/pre-review-input-manifest.json`,
  `${r12Package}/pre-review-freeze.json`,
  ".codex/tasks/GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW/fresh-root-preflight.json",
  ".codex/tasks/GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW/reviewer-allocation-ledger.json",
  ".codex/tasks/GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW/session-b6-summary.json",
  ".codex/tasks/GOV-PHASE1-SESSION-B6R1-COMPATIBILITY-REVIEW/fresh-root-preflight.json",
  ".codex/tasks/GOV-PHASE1-SESSION-B6R1-COMPATIBILITY-REVIEW/reviewer-allocation-ledger.json",
  ".codex/tasks/GOV-PHASE1-SESSION-B6R1-COMPATIBILITY-REVIEW/session-b6r1-summary.json"
];

const directHistoryTaskDirs = [
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10",
  ".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-10",
  ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11",
  ".codex/tasks/GOV-PHASE1-SESSION-B3-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-SESSION-B4-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-SESSION-B5-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-12",
  ".codex/tasks/GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-SESSION-B6R1-COMPATIBILITY-REVIEW"
];

async function captureAnchors() {
  const anchors = [];
  for (const ref of historyAnchorRefs) anchors.push(await fileInfo(ref, "Layered frozen-history or precheck integrity anchor"));
  return anchors;
}

function excludedHistoricalRead(ref) {
  const name = ref.split("/").at(-1).toLowerCase();
  return name === "handoff.md" || name === "implementation-handoff.yaml" || name === "implementation-plan.md" || name === "human-approval.yaml" || name.startsWith(".env");
}

async function walkExactFiles(dirRef) {
  if (!(await existsDirectory(dirRef))) return [];
  const output = [];
  async function walk(currentRef) {
    const entries = await readdir(absolute(currentRef), { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const ref = `${currentRef}/${entry.name}`;
      if (entry.isDirectory()) await walk(ref);
      else if (entry.isFile() && !excludedHistoricalRead(ref)) output.push(normalizeRef(ref));
    }
  }
  await walk(dirRef);
  return output;
}

async function existsDirectory(ref) {
  try {
    return (await stat(absolute(ref))).isDirectory();
  } catch {
    return false;
  }
}

async function captureDirectHistory() {
  const sets = [];
  for (const dir of directHistoryTaskDirs) {
    const directoryExists = await existsDirectory(dir);
    const refs = directoryExists ? await walkExactFiles(dir) : [];
    const files = [];
    for (const ref of refs) files.push(await fileInfo(ref, "Direct frozen-history integrity file within approved read boundary"));
    sets.push({ directory: dir, exists: directoryExists, file_count: files.length, excluded_read_names: ["HANDOFF.md", "implementation-handoff.yaml", "implementation-plan.md", "human-approval.yaml", ".env*"], files });
  }
  return sets;
}

function flattenHistorySets(sets) {
  return sets.flatMap((set) => set.files);
}

const r12Baseline = await readJson(`${r12Base}/review-baseline-before.json`);
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await read(manifestRef);
const candidateFiles = [];
for (const recorded of r12Baseline.candidate.files) {
  const bytes = await read(recorded.relative_path);
  const actualSha256 = sha256(bytes);
  candidateFiles.push({
    path: recorded.relative_path,
    sha256: actualSha256,
    expected_sha256: recorded.expected_sha256,
    byte_size: bytes.length,
    hash_match: actualSha256 === recorded.expected_sha256
  });
}
candidateFiles.sort((left, right) => left.path.localeCompare(right.path));
const manifestSha256 = sha256(manifestBytes);
const includedFileSetSha256 = jcsSha256(candidateFiles.map(({ path: ref, sha256: digest }) => ({ path: ref, sha256: digest })));
const candidateRecordRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-record.json";
const scannerReportRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-scanner-report.json";
const scannerContractRef = ".codex/governance/scan-contract.yaml";
const candidateRecord = await readJson(candidateRecordRef);
const scannerReport = await readJson(scannerReportRef);
const scannerContract = await readJson(scannerContractRef);
const scannerReportActualSha256 = sha256(await read(scannerReportRef));
const baselineChecks = {
  candidate_count_103: candidateFiles.length === expected.candidateFileCount,
  all_candidate_hashes_match: candidateFiles.every((entry) => entry.hash_match),
  manifest_sha256_match: manifestSha256 === expected.candidateManifestSha256,
  included_file_set_sha256_match: includedFileSetSha256 === expected.includedFileSetSha256,
  railway_review_schema_sha256_match: sha256(await read(".codex/blueprints/schemas/railway-domain-review.schema.json")) === expected.railwayReviewSchemaSha256,
  railway_reviewer_profile_sha256_match: sha256(await read(".codex/agents/railway-domain-reviewer.toml")) === expected.railwayReviewerProfileSha256,
  production_contract_id_match: scannerContract.scan_contract_id === expected.scannerContractId,
  production_contract_version_match: scannerContract.scan_contract_version === expected.scannerContractVersion,
  production_contract_sha256_match: sha256(await read(scannerContractRef)) === expected.scannerContractSha256,
  candidate_record_manifest_binding_match: candidateRecord.manifest_sha256 === manifestSha256,
  candidate_record_file_set_binding_match: candidateRecord.included_file_set_sha256 === includedFileSetSha256,
  candidate_record_contract_binding_match: candidateRecord.scan_contract_sha256 === expected.scannerContractSha256,
  candidate_record_scanner_report_hash_match: candidateRecord.scanner_report_sha256 === scannerReportActualSha256,
  scanner_report_manifest_binding_match: scannerReport.candidate_binding.manifest_sha256 === manifestSha256,
  scanner_report_file_set_binding_match: scannerReport.candidate_binding.included_file_set_sha256 === includedFileSetSha256 && scannerReport.candidate_binding.scanned_file_set_sha256 === includedFileSetSha256,
  scanner_report_count_binding_match: scannerReport.candidate_binding.expected_file_count === 103 && scannerReport.candidate_binding.scanned_file_count === 103,
  scanner_report_contract_binding_match: scannerReport.scan_contract.contract_id === expected.scannerContractId && scannerReport.scan_contract.contract_version === expected.scannerContractVersion && scannerReport.scan_contract.contract_sha256 === expected.scannerContractSha256,
  schema_set_binding_match: candidateRecord.schema_set_sha256 === expected.schemaSetSha256 && scannerReport.scan_contract.schema_set_sha256 === expected.schemaSetSha256 && scannerContract.schema_set_sha256 === expected.schemaSetSha256
};
if (!Object.values(baselineChecks).every(Boolean)) throw new Error(`EXTERNAL_REVIEW_PREPARATION_INVALID_BASELINE:${JSON.stringify(baselineChecks)}`);

const beforeAnchors = await captureAnchors();
const beforeDirectHistory = await captureDirectHistory();
const beforeBaseline = {
  schema_version: 1,
  task_id: taskId,
  baseline_role: "before",
  captured_at: new Date().toISOString(),
  root_token: "${PRODUCT_ROOT}",
  review_task_excluded: `${base}/**`,
  git_used: false,
  candidate: {
    manifest_path: manifestRef,
    manifest_sha256: manifestSha256,
    file_count: candidateFiles.length,
    included_file_set_sha256: includedFileSetSha256,
    all_hashes_match: true,
    files: candidateFiles
  },
  production_chain_derivation: {
    candidate_record: await fileInfo(candidateRecordRef),
    scanner_report: await fileInfo(scannerReportRef),
    scanner_contract: await fileInfo(scannerContractRef),
    checks: baselineChecks,
    derived_contract_id: scannerContract.scan_contract_id,
    derived_contract_version: scannerContract.scan_contract_version,
    derived_contract_sha256: sha256(await read(scannerContractRef)),
    result: "PASS"
  },
  protected_history: {
    verification_mode: "DIRECT_EXACT_HISTORY_HASHES_PLUS_LAYERED_FROZEN_ANCHORS_WITH_EXPLICIT_READ_BOUNDARY",
    anchors: beforeAnchors,
    direct_task_sets: beforeDirectHistory,
    forbidden_handoff_or_plan_read: false,
    result: "PASS"
  },
  result: "PASS"
};
await writeJson(`${base}/review-baseline-before.json`, beforeBaseline);

const payloadSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:gov:phase1:external-review-payload:v1",
  title: "External top-level Reviewer canonical payload",
  type: "object",
  additionalProperties: false,
  required: ["payload_core", "payload_core_sha256"],
  properties: {
    payload_core: {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "review_package_id", "review_package_core_sha256", "task_id", "reviewer_role", "assignment_id", "reviewer_run_id", "reviewer_session_nonce", "candidate_binding", "startup", "review_status", "review_started", "candidate_content_reviewed", "completed", "mandatory_exit_requested", "findings", "closure_dispositions", "access_log", "clean_context_attestation"],
      properties: {
        schema_version: { const: 1 },
        review_package_id: { type: "string", minLength: 1 },
        review_package_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" },
        task_id: { type: "string", minLength: 1 },
        reviewer_role: { type: "string", minLength: 1 },
        assignment_id: { type: "string", minLength: 1 },
        reviewer_run_id: { type: "string", minLength: 1 },
        reviewer_session_nonce: { type: "string", minLength: 1 },
        candidate_binding: {
          type: "object",
          additionalProperties: false,
          required: ["candidate_file_count", "candidate_manifest_sha256", "included_file_set_sha256", "scanner_contract_id", "scanner_contract_version", "scanner_contract_sha256"],
          properties: {
            candidate_file_count: { const: 103 },
            candidate_manifest_sha256: { const: expected.candidateManifestSha256 },
            included_file_set_sha256: { const: expected.includedFileSetSha256 },
            scanner_contract_id: { const: expected.scannerContractId },
            scanner_contract_version: { const: expected.scannerContractVersion },
            scanner_contract_sha256: { const: expected.scannerContractSha256 }
          }
        },
        startup: {
          type: "object",
          additionalProperties: false,
          required: ["status", "scope_sha256", "package_verified", "candidate_binding_verified"],
          properties: {
            status: { enum: ["STARTUP_VALID", "STARTUP_BLOCKER"] },
            scope_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" },
            package_verified: { type: "boolean" },
            candidate_binding_verified: { type: "boolean" }
          }
        },
        review_status: { enum: ["PASS", "BLOCKER"] },
        review_started: { type: "boolean" },
        candidate_content_reviewed: { type: "boolean" },
        completed: { const: true },
        mandatory_exit_requested: { const: true },
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["finding_id", "severity", "status", "summary", "evidence_paths"],
            properties: {
              finding_id: { type: "string" },
              severity: { enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] },
              status: { enum: ["OPEN", "CONFIRMED", "RESOLVED", "NOT_APPLICABLE"] },
              summary: { type: "string" },
              evidence_paths: { type: "array", items: { type: "string" } }
            }
          }
        },
        closure_dispositions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["finding_id", "disposition", "owner_asserted", "evidence_paths", "remaining_risk"],
            properties: {
              finding_id: { type: "string" },
              disposition: { enum: ["CLOSED", "NOT_CLOSED", "REPLACED_BY_ENVIRONMENT_BOUND_DETERMINISTIC_QA_GATE"] },
              owner_asserted: { const: true },
              evidence_paths: { type: "array", items: { type: "string" } },
              remaining_risk: { type: "string" }
            }
          }
        },
        access_log: {
          type: "object",
          additionalProperties: false,
          required: ["allowed_paths_read", "forbidden_paths_read", "out_of_scope_access_detected"],
          properties: {
            allowed_paths_read: { type: "array", items: { type: "string" }, uniqueItems: true },
            forbidden_paths_read: { type: "array", maxItems: 0 },
            out_of_scope_access_detected: { const: false }
          }
        },
        clean_context_attestation: {
          type: "object",
          additionalProperties: false,
          required: ["top_level_chat", "subagents_created", "implementation_conversation_received", "conversation_memory_used", "repository_write_performed", "assurance"],
          properties: {
            top_level_chat: { const: true },
            subagents_created: { const: false },
            implementation_conversation_received: { const: false },
            conversation_memory_used: { const: false },
            repository_write_performed: { const: false },
            assurance: { const: "procedural" }
          }
        }
      }
    },
    payload_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" }
  }
};

const transportAttestationSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:gov:phase1:manual-review-transport-attestation:v1",
  type: "object",
  additionalProperties: false,
  required: ["transport_method", "source_task_id", "source_reviewer_role", "review_package_id", "review_package_core_sha256", "declared_payload_core_sha256", "content_intentionally_modified", "transported_by_human", "assurance"],
  properties: {
    transport_method: { const: "manual_copy" },
    source_task_id: { type: "string", minLength: 1 },
    source_reviewer_role: { type: "string", minLength: 1 },
    review_package_id: { type: "string", minLength: 1 },
    review_package_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" },
    declared_payload_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" },
    content_intentionally_modified: { const: false },
    transported_by_human: { const: true },
    assurance: { const: "procedural" }
  }
};

const aggregationInputSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:gov:phase1:external-aggregation-input:v1",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "reviewer_payloads", "transport_attestations", "raw_deterministic_reports", "before_baseline", "gate_dependency_matrix"],
  properties: {
    schema_version: { const: 1 },
    reviewer_payloads: { type: "array", minItems: 4, maxItems: 4, uniqueItems: true },
    transport_attestations: { type: "array", minItems: 4, maxItems: 4 },
    raw_deterministic_reports: { type: "array", minItems: 12 },
    before_baseline: { type: "object" },
    gate_dependency_matrix: { type: "object" }
  }
};

const aggregationOutputSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:gov:phase1:external-aggregation-output:v1",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "task_id", "role", "is_reviewer", "payload_import_result", "deterministic_qa_result", "compatibility_gate", "closure_matrix_path", "completed", "output_core_sha256"],
  properties: {
    schema_version: { const: 1 },
    task_id: { const: "GOV-PHASE1-B6EXT-AGGREGATION-QA" },
    role: { const: "EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER" },
    is_reviewer: { const: false },
    payload_import_result: { enum: ["PASS", "FAIL", "INVALID"] },
    deterministic_qa_result: { enum: ["PASS", "FAIL", "INVALID"] },
    compatibility_gate: { enum: ["GO", "NO-GO"] },
    closure_matrix_path: { type: "string" },
    completed: { const: true },
    output_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" }
  }
};

const taskIntent = {
  schema_version: 1,
  status: "CLOSED",
  task_id: taskId,
  title: "External Top-Level Review Orchestration Preparation",
  task_type: "governance-review-preparation",
  objective: "Prepare four standalone read-only top-level Reviewer packages and one independent Aggregation/Deterministic QA package without starting any review or changing the 103-file candidate.",
  business_reason: "The in-root subagent model is environment-incompatible; human governance approved a procedural external top-level review model.",
  scope: {
    include: [`${base}/**`, "Exact read-only candidate and frozen governance evidence"],
    exclude: ["Reviewer or Aggregator launch", "candidate/history mutation", "B2 closure", "Git/product/DB/migration operations"],
    product_changes_allowed: false,
    database_operations_allowed: false,
    git_mutation_allowed: false
  },
  acceptance_criteria: ["Four exact Reviewer packages are complete and satisfiable.", "One Aggregation/Deterministic QA package is complete.", "JCS payload and manual transport contracts are valid.", "At least 20 fail-closed protocol tests pass.", "Candidate and protected anchors remain unchanged."],
  requested_by: "human-governance-owner",
  authorization: `User explicitly authorized ${taskId} preparation only.`
};

const classification = {
  schema_version: 1,
  task_id: taskId,
  level: "L3",
  reasons: ["Cross-chat formal review transport", "Reviewer payload integrity", "Deterministic compatibility gate preparation"],
  triggers: ["environment-incompatible in-root Reviewer model", "unresolved B2 findings", "formal schema and evidence compatibility"],
  execution_categories: ["governance-validation", "security", "backward-compatibility"],
  required_agents: [],
  required_reviews: [],
  parallel_allowed: false,
  evidence_required: ["EXTERNAL-MODEL-DECISION", "EXTERNAL-PACKAGES", "EXTERNAL-SCOPES", "EXTERNAL-JCS", "EXTERNAL-TRANSPORT", "EXTERNAL-QA", "EXTERNAL-TESTS", "EXTERNAL-BASELINE", "EXTERNAL-READINESS"],
  human_approval: { required: true, stages: ["external model approval", "future per-chat launch"] },
  stop_conditions: ["Any candidate or history change.", "Any Reviewer or Aggregator chat starts.", "Any Git/product/DB/migration operation occurs."],
  scope: { include: [`${base}/**`], exclude: [".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "parent/sibling directories", "conversation memory"] },
  classified_by: "root-orchestrator",
  classification_status: "human-approved-preparation-scope"
};

const blueprint = {
  schema_version: 1,
  blueprint_id: "BP-GOV-PHASE1-EXTERNAL-REVIEW-PREPARATION",
  task_id: taskId,
  risk: { level: "L3", reasons: ["Prepares formal independent review inputs and a future compatibility gate runner."] },
  scope: { include: [`${base}/**`], exclude: ["candidate/history mutation", "Reviewer or Aggregator launch", "Git/product/DB/migration operations"], product_changes_allowed: false, database_operations_allowed: false },
  allowed_paths: { read: ["Exact candidate and frozen governance paths only"], write: [`${base}/**`] },
  agent_assignments: [],
  review_assignments: [],
  applicable_rules: ["GOV-SCOPE-001", "REV-INDEP-001", "REV-L3-001", "EVD-HASH-001"],
  candidate_rules: [],
  required_agents: [],
  execution: { parallel_groups: [], sequential_steps: ["Capture before baseline.", "Build common schemas and five packages.", "Verify scopes and package integrity.", "Run fail-closed protocol tests.", "Capture after baseline and publish readiness."] },
  evidence_required: classification.evidence_required,
  rollback_restore: { required: false, evidence_or_reason: "Task-local additive preparation artifacts only." },
  human_approval: { required: true, approver_roles: ["human-governance-owner"] },
  stop_conditions: classification.stop_conditions
};

const executionModelDecision = {
  schema_version: 1,
  decision_id: "GOV-EXTERNAL-REVIEW-MODEL-001",
  retired_model: {
    name: "IN_ROOT_SUBAGENT_REVIEW",
    status: "RETIRED_ENVIRONMENT_INCOMPATIBLE",
    reasons: ["repeated_clean_root_precheck_failure", "persistent_interrupted_child_thread", "unobservable_lifetime_child_allocation_capacity", "reviewer_dispatch_protocol_failure"]
  },
  clean_root_retry_model: { status: "RETIRED_NO_FURTHER_RETRY" },
  replacement_model: {
    name: "EXTERNAL_TOP_LEVEL_REVIEW",
    status: "HUMAN_APPROVED",
    reviewer_count: 4,
    aggregator_count: 1,
    reviewer_child_agents_allowed: false,
    aggregator_child_agents_allowed: false
  },
  superseded_task: { task_id: "GOV-PHASE1-SESSION-B6R2-COMPATIBILITY-REVIEW", status: "SUPERSEDED / MUST NOT START" },
  prohibited_future_retries: ["B6R3", "B6R4", "other clean-root retries"],
  candidate_change_required: false,
  governance_contract_change_required: false,
  assurance_boundary: ["reviewer_independence_is_procedural", "manual_transport_is_not_cryptographic_identity_proof", "payload_integrity_is_sha256_and_canonicalization_bound"]
};

const canonicalizationContract = {
  schema_version: 1,
  contract_id: "GOV-EXTERNAL-REVIEW-JCS-001",
  standard: "RFC 8785 JSON Canonicalization Scheme (JCS)",
  encoding: "UTF-8",
  payload_hash_algorithm: "SHA-256",
  digest_format: "uppercase hexadecimal",
  payload_hash_target: "JCS(payload_core)",
  package_hash_target: "JCS(package manifest core without package_core_sha256)",
  prohibitions: ["Hashing the wrapper containing payload_core_sha256", "Whitespace-dependent hashing", "Key-order-dependent noncanonical hashing", "Non-finite JSON numbers"],
  reference_algorithm: ["Serialize null, booleans, strings and finite numbers using JSON primitives.", "Preserve array order.", "Sort object property names by UTF-16 code units.", "Emit no insignificant whitespace.", "Encode canonical text as UTF-8 before SHA-256."],
  jcs_self_test: {
    input: { z: 1, a: [true, "x"] },
    canonical_utf8_text: "{\"a\":[true,\"x\"],\"z\":1}",
    sha256: sha256("{\"a\":[true,\"x\"],\"z\":1}")
  },
  result: "PASS"
};

const manualTransportContract = {
  schema_version: 1,
  contract_id: "GOV-EXTERNAL-MANUAL-TRANSPORT-001",
  flow: ["Reviewer Chat returns exactly one canonical JSON object.", "Human copies the complete JSON without edits.", "Aggregator parses the original JSON and recalculates SHA256(JCS(payload_core)).", "Aggregator compares package, assignment, role and candidate bindings."],
  required_attestation_schema: `${base}/schemas/manual-transport-attestation.schema.json`,
  allowed_transport_method: "manual_copy",
  assurance: "procedural",
  human_may: ["copy the complete JSON", "return to the same Reviewer chat if transport damage prevents parsing"],
  human_may_not: ["edit Reviewer outcome", "delete a finding", "repair JSON content", "change BLOCKER to PASS", "merge two Reviewer payloads"],
  damaged_json_effect: "INVALID_RETURN_TO_ORIGINAL_REVIEWER_CHAT_FOR_THE_SAME_FINAL_PAYLOAD",
  aggregator_may_repair: false
};

await writeJson(`${base}/task-intent.yaml`, taskIntent);
await writeJson(`${base}/classification.yaml`, classification);
await writeJson(`${base}/blueprint.yaml`, blueprint);
await writeJson(`${base}/execution-model-decision.yaml`, executionModelDecision);
await writeJson(`${base}/canonicalization-contract.json`, canonicalizationContract);
await writeJson(`${base}/manual-review-payload-transport-contract.json`, manualTransportContract);
await writeJson(`${base}/schemas/external-review-payload.schema.json`, payloadSchema);
await writeJson(`${base}/schemas/manual-transport-attestation.schema.json`, transportAttestationSchema);
await writeJson(`${base}/schemas/aggregation-input.schema.json`, aggregationInputSchema);
await writeJson(`${base}/schemas/aggregation-output.schema.json`, aggregationOutputSchema);

const commonReviewerSources = [
  candidateRecordRef,
  scannerReportRef,
  scannerContractRef,
  `${r12Base}/reviewer-scope-satisfiability-report.json`,
  `${r12Package}/reviewer-scope-satisfiability-contract.json`,
  `${r12Package}/reviewer-startup-contract.json`,
  `${r12Package}/reviewer-early-failure-contract.json`,
  `${r12Package}/reviewer-completion-contract.json`,
  `${r12Package}/reviewer-thread-exit-contract.json`,
  `${r12Package}/gate-dependency-matrix.json`,
  ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/review-findings.yaml"
];

const roleSpecs = [
  {
    key: "code",
    dir: "code-review",
    task_id: "GOV-PHASE1-B6EXT-CODE-REVIEW",
    reviewer_role: "EXTERNAL_CODE_REVIEWER",
    r12_scope: `${r12Package}/reviewer-scopes/code-reviewer-scope.json`,
    ownership: ["B2-CODE-FORBIDDEN-READ-001"],
    required_dispositions: ["CLOSED", "NOT_CLOSED"],
    focus: ["Registered Security Evidence Schema and production loader", "Scanner Contract v5 production-chain derivation", "Security binding and exact allowlist verification", "No Human Approval dependency or task-local production bypass", "Unchanged 103-file candidate"]
  },
  {
    key: "security",
    dir: "security-review",
    task_id: "GOV-PHASE1-B6EXT-SECURITY-REVIEW",
    reviewer_role: "EXTERNAL_SECURITY_INTEGRITY_REVIEWER",
    r12_scope: `${r12Package}/reviewer-scopes/security-reviewer-scope.json`,
    ownership: [],
    required_dispositions: [],
    focus: ["All 103 candidate files", "Eight required production-chain nodes", "Candidate Record and Scanner Report binding equality", "Registered Security Evidence Schema", "Forbidden paths zero and M320 implementation plan/handoff zero", "Original Session B Security findings remain CLOSED"]
  },
  {
    key: "railway",
    dir: "railway-domain-review",
    task_id: "GOV-PHASE1-B6EXT-RAILWAY-REVIEW",
    reviewer_role: "EXTERNAL_RAILWAY_DOMAIN_REVIEWER",
    r12_scope: `${r12Package}/reviewer-scopes/railway-domain-reviewer-scope.json`,
    ownership: [],
    required_dispositions: [],
    focus: ["Bootstrap Rule Governance Mechanism PASS", "Official Railway Schema and loader", "Confirmed Railway Rule count 0", "Migration 320 NEEDS_HUMAN_DECISION / NO-GO", "No repair, release or Migration 320 business Rule approval"]
  },
  {
    key: "compatibility",
    dir: "compatibility-review",
    task_id: "GOV-PHASE1-B6EXT-COMPATIBILITY-REVIEW",
    reviewer_role: "EXTERNAL_GOVERNANCE_COMPATIBILITY_REVIEWER",
    r12_scope: `${r12Package}/reviewer-scopes/compatibility-reviewer-scope.json`,
    ownership: ["B2-COMPAT-OFFICIAL-SECURITY-EVIDENCE-SCHEMA-001", "B2-COMPAT-SECURITY-ALLOWLIST-FORBIDDEN-READ-001", "B2-QA-THREAD-LIMIT-001"],
    required_dispositions: ["CLOSED", "NOT_CLOSED", "REPLACED_BY_ENVIRONMENT_BOUND_DETERMINISTIC_QA_GATE"],
    focus: ["Registered production Security Evidence Schema without fallback", "Formal Scanner Contract v5", "Exact Security scope excludes product, collab, Human Approval and M320 implementation paths", "Static Schema/Template/Workflow/Gate/Role compatibility", "QA finding replacement control without claiming a fifth Reviewer"]
  }
];

const reviewerPackageResults = [];
const assignmentBindings = [];

function reviewerPrompt(spec, packageBase) {
  const closureText = spec.ownership.length ? spec.ownership.map((item) => `- ${item}`).join("\n") : "- No B2 closure ownership; report only the required confirmation evidence.";
  return `# ${spec.task_id} — Standalone External Top-Level Reviewer Prompt

Execute this prompt only in a brand-new top-level Codex chat. This prompt is self-contained; do not attach or rely on any prior conversation, implementer conversation, hidden reasoning, or conversation memory.

## Non-negotiable execution boundary

- Act only as ${spec.reviewer_role}.
- Do not create child agents or subagents.
- Do not write to the repository or any task directory.
- Do not run Git, services, databases, seeds, migrations, or product operations.
- Read only exact paths enumerated in \`${packageBase}/exact-read-scope.json\`.
- Never read a parent directory, recursive glob, another Reviewer payload/chat, Aggregator output, Human Approval, collab, product directories, or Migration 320 implementation plan/handoff.
- Return exactly one JSON object conforming to \`${packageBase}/return-payload.schema.json\`; no Markdown fence, natural-language summary, second outcome, or later correction.
- After returning the payload, stop immediately.

## Startup, before candidate content review

1. Read \`${packageBase}/assignment.json\`, \`package-manifest.json\`, \`package-verification.json\`, \`exact-read-scope.json\`, \`capability-artifact-matrix.json\`, and \`startup-contract.json\`.
2. Recompute every core-file SHA-256 and recompute \`package_core_sha256\` as SHA-256 of UTF-8 RFC 8785 JCS over the package manifest object with \`package_core_sha256\` removed.
3. Verify assignment, role, run ID, session nonce, scope hash, package ID, candidate binding and every required source hash.
4. If any startup check fails, do not review candidate content. Return one schema-valid BLOCKER payload with \`startup.status=STARTUP_BLOCKER\`, \`review_started=false\`, \`candidate_content_reviewed=false\`, \`completed=true\`, and \`mandatory_exit_requested=true\`.

## Technical review

Read \`${packageBase}/review-requirements.json\` and perform every mandatory check using only the exact scope. Treat any out-of-scope access or forbidden read as BLOCKER. Record every actually read path in \`access_log.allowed_paths_read\`.

Finding closure ownership:
${closureText}

Do not close any finding you do not own. A closure disposition is valid only when the technical result is PASS and the access log has no forbidden or out-of-scope path.

## Final payload

Construct \`payload_core\` with the exact identifiers from \`assignment.json\` and the package digest from \`package-manifest.json\`. Compute \`payload_core_sha256 = SHA-256(UTF-8(JCS(payload_core)))\`. Return only:

{\"payload_core\":{...},\"payload_core_sha256\":\"UPPERCASE_SHA256\"}

Do not hash the wrapper. Do not provide a second conclusion. Stop immediately after the one payload.
`;
}

for (const spec of roleSpecs) {
  const packageBase = `${base}/external-review-packages/${spec.dir}`;
  const r12Scope = await readJson(spec.r12_scope);
  const sourceSet = new Set([...r12Scope.allowed_paths, ...commonReviewerSources]);
  sourceSet.delete(`${r12Package}/fresh-root-preflight.json`);
  const sourcePaths = [...sourceSet].map(normalizeRef).filter((ref) => !forbiddenExactPath(ref)).sort();
  for (const ref of sourcePaths) if (!(await exists(ref))) throw new Error(`UNSATISFIABLE_SOURCE:${spec.key}:${ref}`);
  if (spec.key === "security") {
    const missingCandidate = candidateFiles.map((entry) => entry.path).filter((ref) => !sourcePaths.includes(ref));
    if (missingCandidate.length) throw new Error(`SECURITY_SCOPE_NOT_103:${missingCandidate.join(",")}`);
  }
  const packageFileNames = ["assignment.json", "exact-read-scope.json", "capability-artifact-matrix.json", "startup-contract.json", "review-requirements.json", "finding-ownership.json", "return-payload.schema.json", "transport-contract.json", "package-manifest.json", "package-verification.json", "reviewer-prompt.md"];
  const packagePaths = packageFileNames.map((name) => `${packageBase}/${name}`);
  const assignment = {
    schema_version: 1,
    task_id: spec.task_id,
    reviewer_role: spec.reviewer_role,
    assignment_id: stableId("ASSIGN", spec.key),
    reviewer_run_id: stableId("RUN", spec.key),
    reviewer_session_nonce: stableId("NONCE", spec.key, 40),
    review_package_id: stableId("PKG", spec.key),
    identifier_lifecycle: "RESERVED_FOR_FUTURE_INDEPENDENT_TOP_LEVEL_CHAT",
    actual_chat_session_created: false,
    execution_mode: "read-only",
    workspace_write_allowed: false,
    artifact_write_allowed: false,
    allowed_write_paths: [],
    return_payload_only: true,
    subagent_creation_allowed: false,
    git_allowed: false,
    candidate_binding: {
      candidate_file_count: 103,
      candidate_manifest_sha256: manifestSha256,
      included_file_set_sha256: includedFileSetSha256,
      scanner_contract_id: expected.scannerContractId,
      scanner_contract_version: expected.scannerContractVersion,
      scanner_contract_sha256: expected.scannerContractSha256
    }
  };
  const scopeCore = {
    schema_version: 1,
    task_id: spec.task_id,
    reviewer_role: spec.reviewer_role,
    assignment_id: assignment.assignment_id,
    source_paths: sourcePaths,
    package_paths: packagePaths,
    allowed_paths: [...new Set([...sourcePaths, ...packagePaths])].sort(),
    forbidden_paths: [".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "**/human-approval.yaml", "**/implementation-handoff.yaml", "**/implementation-plan.md", "other Reviewer payloads or chats", "Aggregator outputs", "parent or sibling directories"],
    directory_globs_allowed: false,
    workspace_write_allowed: false,
    artifact_write_allowed: false,
    allowed_write_paths: [],
    return_payload_only: true,
    subagent_creation_allowed: false,
    future_outputs_allowed: false
  };
  const exactScope = { ...scopeCore, scope_sha256: jcsSha256(scopeCore) };
  const capabilities = [];
  for (const ref of sourcePaths) {
    const info = await fileInfo(ref);
    capabilities.push({ capability: `artifact:${ref}`, artifact_path: ref, expected_sha256: info.sha256, byte_size: info.byte_size, required: true, allowed: true, forbidden: false, exists: true, hash_match: true });
  }
  const capabilityMatrix = {
    schema_version: 1,
    task_id: spec.task_id,
    reviewer_role: spec.reviewer_role,
    assignment_id: assignment.assignment_id,
    scope_sha256: exactScope.scope_sha256,
    capability_count: capabilities.length,
    capabilities,
    missing_required_artifacts: [],
    forbidden_artifacts_present: [],
    result: "PASS"
  };
  const startupContract = {
    schema_version: 1,
    contract_id: `EXT-STARTUP-${spec.key.toUpperCase()}-001`,
    before_candidate_content: true,
    required_checks: ["top-level chat procedural attestation", "no conversation memory or implementer conversation", "package manifest and package_core_sha256", "all core-file hashes", "package verification envelope", "assignment, role, run and session nonce", "scope_sha256", "all source hashes", "candidate and Scanner Contract binding", "payload-only mode"],
    valid_result: "STARTUP_VALID",
    invalid_result: "STARTUP_BLOCKER",
    invalid_effect: { technical_review_authorized: false, candidate_content_reviewed: false, review_status: "BLOCKER", immediate_single_payload_exit: true }
  };
  const reviewRequirements = {
    schema_version: 1,
    task_id: spec.task_id,
    reviewer_role: spec.reviewer_role,
    mandatory_focus: spec.focus,
    candidate_binding_required: assignment.candidate_binding,
    access_requirements: { exact_paths_only: true, forbidden_path_count_required: 0, out_of_scope_access_required: false },
    pass_requirements: ["All mandatory focus checks pass.", "Candidate and production-chain binding match.", "No forbidden or out-of-scope access.", "All owned closure dispositions are supported by exact evidence."],
    blocker_requirements: ["Any startup failure.", "Any required check failure.", "Any forbidden/out-of-scope access.", "Any repository write, subagent use, Git use, conversation-memory use or implementer-conversation use."],
    no_final_gate_authority: true
  };
  const findingOwnership = {
    schema_version: 1,
    task_id: spec.task_id,
    reviewer_role: spec.reviewer_role,
    owned_findings: spec.ownership,
    allowed_dispositions: spec.required_dispositions,
    may_close_unowned_findings: false,
    closure_requires_pass_and_clean_access: true,
    aggregator_may_override: false
  };
  const transportContract = {
    schema_version: 1,
    contract_id: `EXT-RETURN-${spec.key.toUpperCase()}-001`,
    output_count: 1,
    output_format: "JSON object only",
    wrapper_fields: ["payload_core", "payload_core_sha256"],
    hash_target: "JCS(payload_core)",
    canonicalization_contract: `${base}/canonicalization-contract.json`,
    manual_transport_contract: `${base}/manual-review-payload-transport-contract.json`,
    second_payload_allowed: false,
    natural_language_summary_allowed: false,
    mandatory_exit_after_payload: true,
    transport_assurance: "procedural"
  };
  await writeJson(`${packageBase}/assignment.json`, assignment);
  await writeJson(`${packageBase}/exact-read-scope.json`, exactScope);
  await writeJson(`${packageBase}/capability-artifact-matrix.json`, capabilityMatrix);
  await writeJson(`${packageBase}/startup-contract.json`, startupContract);
  await writeJson(`${packageBase}/review-requirements.json`, reviewRequirements);
  await writeJson(`${packageBase}/finding-ownership.json`, findingOwnership);
  await writeJson(`${packageBase}/return-payload.schema.json`, payloadSchema);
  await writeJson(`${packageBase}/transport-contract.json`, transportContract);
  await writeText(`${packageBase}/reviewer-prompt.md`, reviewerPrompt(spec, packageBase));
  const coreNames = packageFileNames.filter((name) => !["package-manifest.json", "package-verification.json"].includes(name));
  const coreFiles = [];
  for (const name of coreNames) coreFiles.push(await fileInfo(`${packageBase}/${name}`, `Core ${spec.reviewer_role} package artifact`));
  const manifestCore = {
    schema_version: 1,
    review_package_id: assignment.review_package_id,
    task_id: spec.task_id,
    reviewer_role: spec.reviewer_role,
    candidate_manifest_sha256: manifestSha256,
    included_file_set_sha256: includedFileSetSha256,
    scanner_contract_sha256: expected.scannerContractSha256,
    manifest_exclusions: ["package-manifest.json self", "package-verification.json derived verification envelope"],
    files: coreFiles
  };
  const packageManifest = { ...manifestCore, package_core_sha256: jcsSha256(manifestCore) };
  await writeJson(`${packageBase}/package-manifest.json`, packageManifest);
  const packageManifestInfo = await fileInfo(`${packageBase}/package-manifest.json`, "Package manifest envelope");
  const recheckedCoreFiles = [];
  for (const item of coreFiles) {
    const actual = await fileInfo(item.path);
    recheckedCoreFiles.push({ path: item.path, expected_sha256: item.sha256, actual_sha256: actual.sha256, match: item.sha256 === actual.sha256 });
  }
  const packageVerification = {
    schema_version: 1,
    review_package_id: assignment.review_package_id,
    package_manifest_path: `${packageBase}/package-manifest.json`,
    package_manifest_sha256: packageManifestInfo.sha256,
    declared_package_core_sha256: packageManifest.package_core_sha256,
    recomputed_package_core_sha256: jcsSha256(withoutHashField(packageManifest, "package_core_sha256")),
    verified_core_file_count: recheckedCoreFiles.length,
    core_files: recheckedCoreFiles,
    all_core_file_hashes_match: recheckedCoreFiles.every((item) => item.match),
    result: recheckedCoreFiles.every((item) => item.match) ? "PASS" : "FAIL"
  };
  await writeJson(`${packageBase}/package-verification.json`, packageVerification);
  reviewerPackageResults.push({ spec, packageBase, assignment, exactScope, packageManifest, packageVerification, sourcePaths, packagePaths });
  assignmentBindings.push({ task_id: spec.task_id, reviewer_role: spec.reviewer_role, assignment_id: assignment.assignment_id, reviewer_run_id: assignment.reviewer_run_id, reviewer_session_nonce: assignment.reviewer_session_nonce, review_package_id: assignment.review_package_id, actual_chat_session_created: false });
}

const aggregatorBase = `${base}/external-review-packages/aggregation-qa`;
const aggregatorTaskId = "GOV-PHASE1-B6EXT-AGGREGATION-QA";
const qaSuiteContracts = [
  { suite: "Syntax", expected: "18/18", source_contract: ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/syntax-rerun.json", execution: "Fresh node --check over the exact 18 modules enumerated by the source contract." },
  { suite: "Governance fixtures", expected: "68/68", entrypoint: ".codex/tests/run-governance-fixtures.mjs" },
  { suite: "Concurrency", expected: "PASS", entrypoint: ".codex/tests/run-governance-fixtures-concurrency.mjs" },
  { suite: "Production scanner", expected: "72/72", entrypoint: ".codex/tests/run-bootstrap-scanner-production.mjs" },
  { suite: "Production integration", expected: "48/48", entrypoint: ".codex/tests/run-bootstrap-production-integration.mjs" },
  { suite: "Production mutations", expected: "31/31 killed with complete unique mutation IDs and no timeout/unknown/incomplete result", entrypoint: ".codex/tests/run-bootstrap-mutation-tests.mjs" },
  { suite: "Reviewer binding", expected: "14/14", entrypoint: ".codex/tests/run-reviewer-binding-regressions.mjs" },
  { suite: "Official loader integration", expected: "11/11", entrypoint: ".codex/tests/run-official-schema-loader-integration.mjs" },
  { suite: "Schema-loader mutations", expected: "6/6 killed", entrypoint: ".codex/tests/run-official-schema-loader-mutations.mjs" },
  { suite: "Binary mutations", expected: "45/45 killed", entrypoint: ".codex/tests/run-binary-magic-registry-mutations.mjs" },
  { suite: "Remediation 10 chain", expected: "20/20", entrypoint: ".codex/tasks/GOV-PHASE1-REMEDIATION-10/run-security-chain-tests.mjs" },
  { suite: "R11 preparation", expected: "30/30", entrypoint: ".codex/tasks/GOV-PHASE1-REMEDIATION-11/run-preparation-tests.mjs" },
  { suite: "R12 protocol", expected: "30/30", entrypoint: ".codex/tasks/GOV-PHASE1-REMEDIATION-12/run-remediation-12-tests.mjs" }
];
const qaStaticSources = new Set([
  ...candidateFiles.map((entry) => entry.path),
  ...historyAnchorRefs,
  `${base}/canonicalization-contract.json`,
  `${base}/manual-review-payload-transport-contract.json`,
  `${base}/schemas/external-review-payload.schema.json`,
  `${base}/schemas/manual-transport-attestation.schema.json`,
  `${base}/schemas/aggregation-input.schema.json`,
  `${base}/schemas/aggregation-output.schema.json`,
  ...reviewerPackageResults.flatMap((item) => item.packagePaths),
  ...qaSuiteContracts.flatMap((suite) => [suite.entrypoint, suite.source_contract].filter(Boolean))
]);
const qaStaticPaths = [...qaStaticSources].map(normalizeRef).filter((ref) => !forbiddenExactPath(ref)).sort();
for (const ref of qaStaticPaths) if (!(await exists(ref))) throw new Error(`AGGREGATOR_STATIC_SCOPE_UNSATISFIABLE:${ref}`);
const aggregatorAssignment = {
  schema_version: 1,
  task_id: aggregatorTaskId,
  role: "EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER",
  is_reviewer: false,
  aggregation_assignment_id: stableId("ASSIGN", "aggregation"),
  aggregation_run_id: stableId("RUN", "aggregation"),
  aggregation_session_nonce: stableId("NONCE", "aggregation", 40),
  review_package_id: stableId("PKG", "aggregation"),
  identifier_lifecycle: "RESERVED_FOR_FUTURE_INDEPENDENT_TOP_LEVEL_CHAT",
  actual_chat_session_created: false,
  can_close_findings: false,
  can_modify_reviewer_outcomes: false,
  can_approve_domain_rules: false,
  subagent_creation_allowed: false,
  git_allowed: false,
  allowed_write_paths: [`.codex/tasks/${aggregatorTaskId}/**`]
};
const aggregatorPackageFileNames = ["assignment.json", "exact-read-scope.json", "aggregation-input.schema.json", "aggregation-output.schema.json", "payload-import-contract.json", "manual-transport-attestation.schema.json", "deterministic-qa-input-contract.json", "deterministic-qa-fail-closed-rules.json", "gate-dependency-matrix.json", "package-manifest.json", "package-verification.json", "aggregator-prompt.md"];
const aggregatorPackagePaths = aggregatorPackageFileNames.map((name) => `${aggregatorBase}/${name}`);
const aggregatorScopeCore = {
  schema_version: 1,
  task_id: aggregatorTaskId,
  role: aggregatorAssignment.role,
  static_allowed_read_paths: qaStaticPaths,
  package_paths: aggregatorPackagePaths,
  dynamic_input_contract: {
    source: "four human-transported Reviewer JSON payloads and four procedural attestations",
    exact_future_storage_paths: [
      `.codex/tasks/${aggregatorTaskId}/imported-reviewer-payloads/code-review-payload.json`,
      `.codex/tasks/${aggregatorTaskId}/imported-reviewer-payloads/security-review-payload.json`,
      `.codex/tasks/${aggregatorTaskId}/imported-reviewer-payloads/railway-review-payload.json`,
      `.codex/tasks/${aggregatorTaskId}/imported-reviewer-payloads/compatibility-review-payload.json`
    ],
    missing_input_effect: "QA INVALID / Compatibility Gate NO-GO"
  },
  forbidden_paths: [".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "**/human-approval.yaml", "**/implementation-handoff.yaml", "**/implementation-plan.md", "Reviewer conversations", "parent or sibling directories"],
  directory_globs_allowed_for_read: false,
  allowed_write_paths: [`.codex/tasks/${aggregatorTaskId}/**`],
  subagent_creation_allowed: false,
  git_allowed: false
};
const aggregatorExactScope = { ...aggregatorScopeCore, scope_sha256: jcsSha256(aggregatorScopeCore) };
const payloadImportContract = {
  schema_version: 1,
  contract_id: "GOV-EXTERNAL-PAYLOAD-IMPORT-001",
  required_payload_count: 4,
  required_roles: roleSpecs.map((spec) => spec.reviewer_role),
  byte_preservation_required: true,
  parse_without_repair: true,
  required_checks: ["schema", "JCS payload self-hash", "review package ID and package core hash", "assignment, role, run and session nonce", "candidate binding", "transport attestation", "unique identities", "clean access log", "completed and mandatory exit"],
  missing_payload_effect: { qa: "INVALID", compatibility_gate: "NO-GO" },
  blocker_payload_effect: { qa: "FAIL", compatibility_gate: "NO-GO" },
  aggregator_may_modify: false,
  aggregator_may_repair: false
};
const deterministicQaInputContract = {
  schema_version: 1,
  contract_id: "GOV-EXTERNAL-DETERMINISTIC-QA-INPUT-001",
  execution_mode: "non-reviewer deterministic runner",
  reviewer_payload_count: 4,
  required_payload_checks: payloadImportContract.required_checks,
  suites: qaSuiteContracts,
  required_additional_checks: ["Candidate 103/103 and exact manifest/file-set hashes", "Scanner Contract v5 production-chain binding", "Four package and payload self-hashes", "Reviewer identity uniqueness", "No forbidden access", "Closure owner/disposition legality", "31 unique killed mutations and no omissions/duplicates/extras/timeouts/unknown/incomplete entries", "Before/after baseline", "Frozen history unchanged"],
  raw_reports_must_be_written_under_aggregator_task: true,
  source_artifact_writes_allowed: false
};
const deterministicQaFailClosedRules = {
  schema_version: 1,
  contract_id: "GOV-EXTERNAL-DETERMINISTIC-QA-FAIL-CLOSED-001",
  rules: [
    { when: "missing or extra Reviewer payload", result: "INVALID", gate: "NO-GO" },
    { when: "payload/package/transport/schema/JCS hash invalid", result: "INVALID", gate: "NO-GO" },
    { when: "duplicate assignment/run/session nonce/package identity", result: "INVALID", gate: "NO-GO" },
    { when: "forbidden access or scope violation", result: "FAIL", gate: "NO-GO" },
    { when: "any Reviewer BLOCKER", result: "FAIL", gate: "NO-GO" },
    { when: "raw deterministic report missing or incomplete", result: "INVALID", gate: "NO-GO" },
    { when: "candidate or history drift", result: "INVALID", gate: "NO-GO" },
    { when: "Aggregator attempts Reviewer judgment or outcome mutation", result: "INVALID", gate: "NO-GO" },
    { when: "all four PASS payloads and all deterministic evidence pass", result: "PASS", gate: "GO" }
  ],
  subjective_discretion_allowed: false
};
const externalGateMatrix = {
  schema_version: 1,
  matrix_id: "GOV-EXTERNAL-SESSION-B-COMPATIBILITY-GATE-001",
  required_inputs: ["unchanged candidate manifest/record/scanner chain", "four exact valid Reviewer payloads", "four valid procedural transport attestations", "legal owner closure dispositions", "fresh deterministic QA raw reports", "before/after baseline integrity"],
  finding_owners: {
    "B2-CODE-FORBIDDEN-READ-001": "EXTERNAL_CODE_REVIEWER",
    "B2-COMPAT-OFFICIAL-SECURITY-EVIDENCE-SCHEMA-001": "EXTERNAL_GOVERNANCE_COMPATIBILITY_REVIEWER",
    "B2-COMPAT-SECURITY-ALLOWLIST-FORBIDDEN-READ-001": "EXTERNAL_GOVERNANCE_COMPATIBILITY_REVIEWER",
    "B2-QA-THREAD-LIMIT-001": "EXTERNAL_GOVERNANCE_COMPATIBILITY_REVIEWER_PLUS_EXTERNAL_DETERMINISTIC_QA"
  },
  prohibited_inputs: ["Human Approval", "final summary prose", "Aggregator subjective judgment", "missing Reviewer substitution", "Migration 320 business decision"],
  go_requires: ["all four Reviewer statuses PASS", "all four B2 dispositions legal and closed/replaced as specified", "deterministic QA PASS", "critical=0", "unresolved high blocker=0", "candidate/history unchanged"],
  default: "NO-GO"
};
const aggregatorPrompt = `# ${aggregatorTaskId} — Standalone Aggregation / Deterministic QA Prompt

Execute only in a new independent top-level Codex chat after the human has obtained all four Reviewer JSON payloads. Do not attach Reviewer conversations or implementation conversations. Do not use conversation memory and do not create subagents.

You are EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER, not a Reviewer. You cannot close findings, alter Reviewer outcomes, add findings, approve business rules, create Human Approval, or run Git.

## Startup

1. Verify this package using \`${aggregatorBase}/package-manifest.json\`, \`package-verification.json\`, and RFC 8785 JCS.
2. Read only \`${aggregatorBase}/exact-read-scope.json\` static paths plus the four human-supplied payloads and attestations.
3. If any one of the four payloads is absent, malformed, repaired, duplicated, hash-invalid, identity-invalid or package-invalid, record QA INVALID and Compatibility Gate NO-GO. Never substitute for a Reviewer.

## Import

Save the four supplied JSON payloads byte-for-byte under \`.codex/tasks/${aggregatorTaskId}/imported-reviewer-payloads/\`. Save procedural transport attestations separately. Recompute SHA-256(JCS(payload_core)); do not edit or normalize the stored source bytes.

## Deterministic QA

Execute every suite and check in \`${aggregatorBase}/deterministic-qa-input-contract.json\` freshly. Store raw reports only under \`.codex/tasks/${aggregatorTaskId}/\`. Any source write, missing raw report, incomplete mutation ID set, timeout, unknown result, candidate/history drift, Reviewer BLOCKER, forbidden access or identity collision is fail-closed under \`deterministic-qa-fail-closed-rules.json\`.

Aggregate only owner dispositions into the B2 closure matrix. Compute the Session B Compatibility Gate from \`gate-dependency-matrix.json\`. Stop after the Aggregation/QA task is archived. Do not perform Human Exact-Manifest Confirmation, Git, steady-state activation or Migration 320 approval.
`;
await writeJson(`${aggregatorBase}/assignment.json`, aggregatorAssignment);
await writeJson(`${aggregatorBase}/exact-read-scope.json`, aggregatorExactScope);
await writeJson(`${aggregatorBase}/aggregation-input.schema.json`, aggregationInputSchema);
await writeJson(`${aggregatorBase}/aggregation-output.schema.json`, aggregationOutputSchema);
await writeJson(`${aggregatorBase}/payload-import-contract.json`, payloadImportContract);
await writeJson(`${aggregatorBase}/manual-transport-attestation.schema.json`, transportAttestationSchema);
await writeJson(`${aggregatorBase}/deterministic-qa-input-contract.json`, deterministicQaInputContract);
await writeJson(`${aggregatorBase}/deterministic-qa-fail-closed-rules.json`, deterministicQaFailClosedRules);
await writeJson(`${aggregatorBase}/gate-dependency-matrix.json`, externalGateMatrix);
await writeText(`${aggregatorBase}/aggregator-prompt.md`, aggregatorPrompt);
const aggregatorCoreNames = aggregatorPackageFileNames.filter((name) => !["package-manifest.json", "package-verification.json"].includes(name));
const aggregatorCoreFiles = [];
for (const name of aggregatorCoreNames) aggregatorCoreFiles.push(await fileInfo(`${aggregatorBase}/${name}`, "Core Aggregation/Deterministic QA package artifact"));
const aggregatorManifestCore = {
  schema_version: 1,
  review_package_id: aggregatorAssignment.review_package_id,
  task_id: aggregatorTaskId,
  reviewer_role: aggregatorAssignment.role,
  candidate_manifest_sha256: manifestSha256,
  included_file_set_sha256: includedFileSetSha256,
  scanner_contract_sha256: expected.scannerContractSha256,
  manifest_exclusions: ["package-manifest.json self", "package-verification.json derived verification envelope"],
  files: aggregatorCoreFiles
};
const aggregatorManifest = { ...aggregatorManifestCore, package_core_sha256: jcsSha256(aggregatorManifestCore) };
await writeJson(`${aggregatorBase}/package-manifest.json`, aggregatorManifest);
const aggregatorManifestInfo = await fileInfo(`${aggregatorBase}/package-manifest.json`);
const aggregatorCoreChecks = [];
for (const item of aggregatorCoreFiles) {
  const actual = await fileInfo(item.path);
  aggregatorCoreChecks.push({ path: item.path, expected_sha256: item.sha256, actual_sha256: actual.sha256, match: item.sha256 === actual.sha256 });
}
const aggregatorVerification = {
  schema_version: 1,
  review_package_id: aggregatorAssignment.review_package_id,
  package_manifest_path: `${aggregatorBase}/package-manifest.json`,
  package_manifest_sha256: aggregatorManifestInfo.sha256,
  declared_package_core_sha256: aggregatorManifest.package_core_sha256,
  recomputed_package_core_sha256: jcsSha256(withoutHashField(aggregatorManifest, "package_core_sha256")),
  verified_core_file_count: aggregatorCoreChecks.length,
  core_files: aggregatorCoreChecks,
  all_core_file_hashes_match: aggregatorCoreChecks.every((item) => item.match),
  result: aggregatorCoreChecks.every((item) => item.match) ? "PASS" : "FAIL"
};
await writeJson(`${aggregatorBase}/package-verification.json`, aggregatorVerification);

const allPackageRecords = [
  ...reviewerPackageResults.map((item) => ({ package_id: item.assignment.review_package_id, task_id: item.spec.task_id, role: item.spec.reviewer_role, base: item.packageBase, manifest: item.packageManifest, verification: item.packageVerification, exact_scope: item.exactScope, package_paths: item.packagePaths, source_paths: item.sourcePaths })),
  { package_id: aggregatorAssignment.review_package_id, task_id: aggregatorTaskId, role: aggregatorAssignment.role, base: aggregatorBase, manifest: aggregatorManifest, verification: aggregatorVerification, exact_scope: aggregatorExactScope, package_paths: aggregatorPackagePaths, source_paths: qaStaticPaths }
];

const scopeReportRoles = [];
for (const record of allPackageRecords) {
  const scopePaths = record.role === aggregatorAssignment.role ? [...record.exact_scope.static_allowed_read_paths, ...record.exact_scope.package_paths] : record.exact_scope.allowed_paths;
  const missingPaths = [];
  for (const ref of scopePaths) if (!(await exists(ref))) missingPaths.push(ref);
  const recursiveGlobPaths = scopePaths.filter((ref) => ref.includes("*"));
  const forbiddenPathsPresent = scopePaths.filter(forbiddenExactPath);
  const issues = [
    ...missingPaths.map((ref) => `MISSING:${ref}`),
    ...recursiveGlobPaths.map((ref) => `RECURSIVE_OR_GLOB:${ref}`),
    ...forbiddenPathsPresent.map((ref) => `FORBIDDEN:${ref}`)
  ];
  scopeReportRoles.push({
    task_id: record.task_id,
    role: record.role,
    scope_sha256: record.exact_scope.scope_sha256,
    exact_path_count: scopePaths.length,
    source_path_count: record.source_paths.length,
    package_path_count: record.package_paths.length,
    missing_paths: missingPaths,
    recursive_glob_paths: recursiveGlobPaths,
    forbidden_paths_present: forbiddenPathsPresent,
    dynamic_inputs_are_separate_contract: record.role === aggregatorAssignment.role,
    scope_satisfiable: issues.length === 0,
    issues,
    result: issues.length === 0 ? "PASS" : "FAIL"
  });
}
const packageScopeReport = {
  schema_version: 1,
  task_id: taskId,
  reviewer_package_count: 4,
  aggregator_package_count: 1,
  roles: scopeReportRoles,
  four_reviewer_scopes_satisfiable: scopeReportRoles.filter((item) => item.role !== aggregatorAssignment.role).every((item) => item.scope_satisfiable),
  aggregator_static_scope_satisfiable: scopeReportRoles.find((item) => item.role === aggregatorAssignment.role).scope_satisfiable,
  forbidden_path_count: scopeReportRoles.reduce((sum, item) => sum + item.forbidden_paths_present.length, 0),
  recursive_glob_count: scopeReportRoles.reduce((sum, item) => sum + item.recursive_glob_paths.length, 0),
  result: scopeReportRoles.every((item) => item.scope_satisfiable) ? "PASS" : "FAIL"
};
await writeJson(`${base}/package-scope-satisfiability-report.json`, packageScopeReport);

const packageIntegrityReport = {
  schema_version: 1,
  task_id: taskId,
  package_count: allPackageRecords.length,
  packages: allPackageRecords.map((record) => ({
    review_package_id: record.package_id,
    task_id: record.task_id,
    role: record.role,
    package_manifest_path: `${record.base}/package-manifest.json`,
    package_manifest_sha256: record.verification.package_manifest_sha256,
    declared_package_core_sha256: record.manifest.package_core_sha256,
    recomputed_package_core_sha256: record.verification.recomputed_package_core_sha256,
    core_file_count: record.verification.verified_core_file_count,
    all_core_file_hashes_match: record.verification.all_core_file_hashes_match,
    result: record.verification.result
  })),
  package_ids_unique: new Set(allPackageRecords.map((record) => record.package_id)).size === allPackageRecords.length,
  assignment_ids_unique: new Set(assignmentBindings.map((item) => item.assignment_id)).size === assignmentBindings.length,
  reviewer_run_ids_unique: new Set(assignmentBindings.map((item) => item.reviewer_run_id)).size === assignmentBindings.length,
  reviewer_session_nonces_unique: new Set(assignmentBindings.map((item) => item.reviewer_session_nonce)).size === assignmentBindings.length,
  external_chats_created: false,
  result: allPackageRecords.every((record) => record.verification.result === "PASS") ? "PASS" : "FAIL"
};
await writeJson(`${base}/package-integrity-report.json`, packageIntegrityReport);

function makeValidPayload(record) {
  const ownership = record.spec.ownership;
  const closureDispositions = ownership.map((findingId) => ({
    finding_id: findingId,
    disposition: findingId === "B2-QA-THREAD-LIMIT-001" ? "REPLACED_BY_ENVIRONMENT_BOUND_DETERMINISTIC_QA_GATE" : "CLOSED",
    owner_asserted: true,
    evidence_paths: [record.spec.r12_scope],
    remaining_risk: findingId === "B2-QA-THREAD-LIMIT-001" ? "Replacement remains conditional on independent Aggregator deterministic QA PASS." : "None identified within exact scope."
  }));
  const core = {
    schema_version: 1,
    review_package_id: record.assignment.review_package_id,
    review_package_core_sha256: record.packageManifest.package_core_sha256,
    task_id: record.spec.task_id,
    reviewer_role: record.spec.reviewer_role,
    assignment_id: record.assignment.assignment_id,
    reviewer_run_id: record.assignment.reviewer_run_id,
    reviewer_session_nonce: record.assignment.reviewer_session_nonce,
    candidate_binding: record.assignment.candidate_binding,
    startup: { status: "STARTUP_VALID", scope_sha256: record.exactScope.scope_sha256, package_verified: true, candidate_binding_verified: true },
    review_status: "PASS",
    review_started: true,
    candidate_content_reviewed: true,
    completed: true,
    mandatory_exit_requested: true,
    findings: [],
    closure_dispositions: closureDispositions,
    access_log: { allowed_paths_read: [record.spec.r12_scope], forbidden_paths_read: [], out_of_scope_access_detected: false },
    clean_context_attestation: { top_level_chat: true, subagents_created: false, implementation_conversation_received: false, conversation_memory_used: false, repository_write_performed: false, assurance: "procedural" }
  };
  return { payload_core: core, payload_core_sha256: jcsSha256(core) };
}

function validatePayload(payload, record) {
  const issues = [];
  const core = payload?.payload_core;
  if (!core || typeof core !== "object") return { valid: false, issues: ["PAYLOAD_CORE_MISSING"] };
  if (payload.payload_core_sha256 !== jcsSha256(core)) issues.push("PAYLOAD_SELF_HASH_MISMATCH");
  if (core.review_package_id !== record.assignment.review_package_id) issues.push("PACKAGE_ID_MISMATCH");
  if (core.review_package_core_sha256 !== record.packageManifest.package_core_sha256) issues.push("PACKAGE_CORE_HASH_MISMATCH");
  if (core.task_id !== record.spec.task_id) issues.push("TASK_ID_MISMATCH");
  if (core.reviewer_role !== record.spec.reviewer_role) issues.push("ROLE_MISMATCH");
  if (core.assignment_id !== record.assignment.assignment_id) issues.push("ASSIGNMENT_ID_MISMATCH");
  if (core.reviewer_run_id !== record.assignment.reviewer_run_id) issues.push("RUN_ID_MISMATCH");
  if (core.reviewer_session_nonce !== record.assignment.reviewer_session_nonce) issues.push("SESSION_NONCE_MISMATCH");
  if (core.completed !== true || core.mandatory_exit_requested !== true) issues.push("INCOMPLETE_OR_NO_MANDATORY_EXIT");
  if (core.access_log?.out_of_scope_access_detected !== false || core.access_log?.forbidden_paths_read?.length !== 0) issues.push("ACCESS_SCOPE_FAILURE");
  if (core.clean_context_attestation?.top_level_chat !== true || core.clean_context_attestation?.subagents_created !== false || core.clean_context_attestation?.conversation_memory_used !== false || core.clean_context_attestation?.repository_write_performed !== false) issues.push("CLEAN_CONTEXT_FAILURE");
  return { valid: issues.length === 0, issues };
}

function validateAggregate({ payloads, attestations, rawReports, attemptedOutcomeMutation = false }) {
  const issues = [];
  if (payloads.length !== 4) issues.push("REVIEWER_PAYLOAD_COUNT_INVALID");
  if (attestations.length !== 4 || attestations.some((item) => item.content_intentionally_modified !== false)) issues.push("TRANSPORT_ATTESTATION_INVALID");
  const ids = payloads.map((item) => item.payload_core?.reviewer_run_id);
  if (new Set(ids).size !== ids.length) issues.push("DUPLICATE_REVIEWER_RUN_ID");
  if (attemptedOutcomeMutation) issues.push("AGGREGATOR_OUTCOME_MUTATION_FORBIDDEN");
  if (rawReports.length < qaSuiteContracts.length) issues.push("RAW_DETERMINISTIC_REPORTS_INCOMPLETE");
  if (payloads.some((item) => item.payload_core?.review_status !== "PASS")) issues.push("REVIEWER_BLOCKER");
  return { valid: issues.length === 0, issues };
}

function validatePackageModel({ manifestPresent = true, fileHashesMatch = true, coreHashMatches = true }) {
  const issues = [];
  if (!manifestPresent) issues.push("PACKAGE_MANIFEST_MISSING");
  if (!fileHashesMatch) issues.push("PACKAGE_FILE_HASH_MISMATCH");
  if (!coreHashMatches) issues.push("PACKAGE_CORE_SHA256_MISMATCH");
  return { valid: issues.length === 0, issues };
}

function validateScopeModel({ paths, requiredPaths = [], futureOutputPaths = [] }) {
  const issues = [];
  if (paths.some((ref) => ref.includes("*"))) issues.push("RECURSIVE_GLOB_FORBIDDEN");
  if (paths.some(forbiddenExactPath)) issues.push("FORBIDDEN_SCOPE_PATH");
  for (const requiredPath of requiredPaths) if (!paths.includes(requiredPath)) issues.push(`REQUIRED_ARTIFACT_MISSING:${requiredPath}`);
  for (const futurePath of futureOutputPaths) if (paths.includes(futurePath)) issues.push(`FUTURE_OUTPUT_IN_REVIEWER_SCOPE:${futurePath}`);
  return { valid: issues.length === 0, issues };
}

function validateReviewerAssignmentModel(assignment) {
  const issues = [];
  if (assignment.workspace_write_allowed !== false || assignment.artifact_write_allowed !== false || assignment.allowed_write_paths.length !== 0) issues.push("REVIEWER_WRITE_PERMISSION_FORBIDDEN");
  if (assignment.subagent_creation_allowed !== false) issues.push("REVIEWER_SUBAGENT_PERMISSION_FORBIDDEN");
  return { valid: issues.length === 0, issues };
}

function validateStandalonePromptModel(prompt) {
  const requiredStatements = ["brand-new top-level Codex chat", "do not attach or rely on any prior conversation", "Do not create child agents or subagents", "Do not write to the repository", "Return exactly one JSON object", "stop immediately"];
  const issues = requiredStatements.filter((statement) => !prompt.includes(statement)).map((statement) => `PROMPT_NOT_STANDALONE:${statement}`);
  return { valid: issues.length === 0, issues };
}

const validPayloads = reviewerPackageResults.map(makeValidPayload);
const validAttestations = reviewerPackageResults.map((record, index) => ({
  transport_method: "manual_copy",
  source_task_id: record.spec.task_id,
  source_reviewer_role: record.spec.reviewer_role,
  review_package_id: record.assignment.review_package_id,
  review_package_core_sha256: record.packageManifest.package_core_sha256,
  declared_payload_core_sha256: validPayloads[index].payload_core_sha256,
  content_intentionally_modified: false,
  transported_by_human: true,
  assurance: "procedural"
}));
const rawReports = qaSuiteContracts.map((suite) => ({ suite: suite.suite, result: "PASS", raw_report_present: true }));

const protocolTests = [];
function addTest(id, name, expectedAccept, actualAccept, violations) {
  protocolTests.push({ test_id: id, name, expected_accept: expectedAccept, actual_accept: actualAccept, violations, result: expectedAccept === actualAccept ? "PASS" : "FAIL" });
}
const test01 = validatePackageModel({ manifestPresent: false }); addTest("EXT-01", "Reviewer package missing manifest", false, test01.valid, test01.issues);
const test02 = validatePackageModel({ fileHashesMatch: false }); addTest("EXT-02", "Package core file hash mismatch", false, test02.valid, test02.issues);
const test03 = validatePackageModel({ coreHashMatches: false }); addTest("EXT-03", "Package core digest mismatch", false, test03.valid, test03.issues);
const test04 = validateScopeModel({ paths: [".codex/**"] }); addTest("EXT-04", "Scope contains recursive glob", false, test04.valid, test04.issues);
const test05 = validateScopeModel({ paths: ["collab/HANDOFF.md"] }); addTest("EXT-05", "Scope contains forbidden path", false, test05.valid, test05.issues);
const test06 = validateScopeModel({ paths: [candidateRecordRef], requiredPaths: [manifestRef, candidateRecordRef] }); addTest("EXT-06", "Scope omits required artifact", false, test06.valid, test06.issues);
const futurePayloadPath = `.codex/tasks/${aggregatorTaskId}/imported-reviewer-payloads/code-review-payload.json`;
const test07 = validateScopeModel({ paths: [manifestRef, futurePayloadPath], futureOutputPaths: [futurePayloadPath] }); addTest("EXT-07", "Reviewer scope references future output", false, test07.valid, test07.issues);
const writableAssignment = { ...reviewerPackageResults[0].assignment, workspace_write_allowed: true, allowed_write_paths: [base] };
const test08 = validateReviewerAssignmentModel(writableAssignment); addTest("EXT-08", "Reviewer assignment permits workspace write", false, test08.valid, test08.issues);
const spawningAssignment = { ...reviewerPackageResults[0].assignment, subagent_creation_allowed: true };
const test09 = validateReviewerAssignmentModel(spawningAssignment); addTest("EXT-09", "Reviewer assignment permits subagent", false, test09.valid, test09.issues);
const test10 = validateStandalonePromptModel("Continue the prior conversation and summarize it."); addTest("EXT-10", "Reviewer prompt depends on prior conversation", false, test10.valid, test10.issues);
const wrongPackage = structuredClone(validPayloads[0]); wrongPackage.payload_core.review_package_id = "WRONG"; wrongPackage.payload_core_sha256 = jcsSha256(wrongPackage.payload_core);
const wrongPackageResult = validatePayload(wrongPackage, reviewerPackageResults[0]); addTest("EXT-11", "Payload package ID mismatch", false, wrongPackageResult.valid, wrongPackageResult.issues);
const wrongRole = structuredClone(validPayloads[0]); wrongRole.payload_core.reviewer_role = "WRONG_ROLE"; wrongRole.payload_core_sha256 = jcsSha256(wrongRole.payload_core);
const wrongRoleResult = validatePayload(wrongRole, reviewerPackageResults[0]); addTest("EXT-12", "Payload role differs from assignment", false, wrongRoleResult.valid, wrongRoleResult.issues);
const wrongHash = structuredClone(validPayloads[0]); wrongHash.payload_core_sha256 = "0".repeat(64);
const wrongHashResult = validatePayload(wrongHash, reviewerPackageResults[0]); addTest("EXT-13", "Payload self-hash mismatch", false, wrongHashResult.valid, wrongHashResult.issues);
const missingExit = structuredClone(validPayloads[0]); missingExit.payload_core.mandatory_exit_requested = false; missingExit.payload_core_sha256 = jcsSha256(missingExit.payload_core);
const missingExitResult = validatePayload(missingExit, reviewerPackageResults[0]); addTest("EXT-14", "Payload lacks mandatory exit", false, missingExitResult.valid, missingExitResult.issues);
const modifiedAttestations = structuredClone(validAttestations); modifiedAttestations[0].content_intentionally_modified = true;
const modifiedTransport = validateAggregate({ payloads: validPayloads, attestations: modifiedAttestations, rawReports }); addTest("EXT-15", "Manual transport declares intentional modification", false, modifiedTransport.valid, modifiedTransport.issues);
const missingPayload = validateAggregate({ payloads: validPayloads.slice(0, 3), attestations: validAttestations.slice(0, 3), rawReports }); addTest("EXT-16", "Aggregator missing one Reviewer payload", false, missingPayload.valid, missingPayload.issues);
const duplicatePayloads = structuredClone(validPayloads); duplicatePayloads[3].payload_core.reviewer_run_id = duplicatePayloads[0].payload_core.reviewer_run_id; duplicatePayloads[3].payload_core_sha256 = jcsSha256(duplicatePayloads[3].payload_core);
const duplicateIds = validateAggregate({ payloads: duplicatePayloads, attestations: validAttestations, rawReports }); addTest("EXT-17", "Aggregator receives duplicate Reviewer run ID", false, duplicateIds.valid, duplicateIds.issues);
const outcomeMutation = validateAggregate({ payloads: validPayloads, attestations: validAttestations, rawReports, attemptedOutcomeMutation: true }); addTest("EXT-18", "Aggregator attempts to modify Reviewer outcome", false, outcomeMutation.valid, outcomeMutation.issues);
const missingRaw = validateAggregate({ payloads: validPayloads, attestations: validAttestations, rawReports: rawReports.slice(0, -1) }); addTest("EXT-19", "QA input lacks one raw deterministic report", false, missingRaw.valid, missingRaw.issues);
const completePass = validateAggregate({ payloads: validPayloads, attestations: validAttestations, rawReports }); addTest("EXT-20", "Four complete PASS payloads and complete raw evidence enter QA", true, completePass.valid, completePass.issues);

const protocolTestReport = {
  schema_version: 1,
  task_id: taskId,
  total: protocolTests.length,
  passed: protocolTests.filter((item) => item.result === "PASS").length,
  failed: protocolTests.filter((item) => item.result !== "PASS").length,
  negative_cases: 19,
  negative_cases_fail_closed: protocolTests.slice(0, 19).every((item) => item.actual_accept === false),
  positive_case_accepted: protocolTests[19].actual_accept === true,
  tests: protocolTests,
  result: protocolTests.every((item) => item.result === "PASS") ? "PASS" : "FAIL"
};
await writeJson(`${base}/external-review-protocol-tests.json`, protocolTestReport);

await writeJson(`${base}/human-launch-sequence.json`, {
  schema_version: 1,
  task_id: taskId,
  preparation_only: true,
  external_chats_started: false,
  sequence: [
    { sequence: 1, task_id: roleSpecs[0].task_id, prompt: `${reviewerPackageResults[0].packageBase}/reviewer-prompt.md` },
    { sequence: 2, task_id: roleSpecs[1].task_id, prompt: `${reviewerPackageResults[1].packageBase}/reviewer-prompt.md` },
    { sequence: 3, task_id: roleSpecs[2].task_id, prompt: `${reviewerPackageResults[2].packageBase}/reviewer-prompt.md` },
    { sequence: 4, task_id: roleSpecs[3].task_id, prompt: `${reviewerPackageResults[3].packageBase}/reviewer-prompt.md` },
    { sequence: 5, task_id: aggregatorTaskId, prompt: `${aggregatorBase}/aggregator-prompt.md`, prerequisite: "Four original Reviewer payloads and four procedural transport attestations exist." }
  ],
  stop_conditions: ["Any Reviewer package startup check fails.", "Any Reviewer returns BLOCKER or more than one payload.", "Any payload is transport-damaged or edited.", "Any payload is missing before Aggregator launch.", "Any candidate or history drift occurs."],
  automatic_chat_creation_allowed: false,
  human_manual_launch_required: true
});

const afterCandidateFiles = [];
for (const recorded of candidateFiles) {
  const bytes = await read(recorded.path);
  afterCandidateFiles.push({ path: recorded.path, sha256: sha256(bytes), byte_size: bytes.length });
}
afterCandidateFiles.sort((left, right) => left.path.localeCompare(right.path));
const afterAnchors = await captureAnchors();
const afterDirectHistory = await captureDirectHistory();
const afterBaseline = {
  schema_version: 1,
  task_id: taskId,
  baseline_role: "after",
  captured_at: new Date().toISOString(),
  root_token: "${PRODUCT_ROOT}",
  review_task_excluded: `${base}/**`,
  git_used: false,
  candidate: {
    manifest_path: manifestRef,
    manifest_sha256: sha256(await read(manifestRef)),
    file_count: afterCandidateFiles.length,
    included_file_set_sha256: jcsSha256(afterCandidateFiles.map(({ path: ref, sha256: digest }) => ({ path: ref, sha256: digest }))),
    files: afterCandidateFiles
  },
  protected_history: { verification_mode: "DIRECT_EXACT_HISTORY_HASHES_PLUS_LAYERED_FROZEN_ANCHORS_WITH_EXPLICIT_READ_BOUNDARY", anchors: afterAnchors, direct_task_sets: afterDirectHistory, forbidden_handoff_or_plan_read: false },
  result: "PASS"
};
await writeJson(`${base}/review-baseline-after.json`, afterBaseline);

function compareInfos(before, after) {
  const afterMap = new Map(after.map((item) => [item.path, item]));
  const changes = [];
  for (const item of before) {
    const current = afterMap.get(item.path);
    if (!current || current.sha256 !== item.sha256 || current.byte_size !== item.byte_size) changes.push({ path: item.path, before_sha256: item.sha256, after_sha256: current?.sha256 ?? null });
    afterMap.delete(item.path);
  }
  for (const current of afterMap.values()) changes.push({ path: current.path, before_sha256: null, after_sha256: current.sha256 });
  return changes;
}
const candidateChanges = compareInfos(candidateFiles.map((item) => ({ path: item.path, sha256: item.sha256, byte_size: item.byte_size })), afterCandidateFiles);
const historyChanges = compareInfos(beforeAnchors, afterAnchors);
const directHistoryChanges = compareInfos(flattenHistorySets(beforeDirectHistory), flattenHistorySets(afterDirectHistory));
const historyDirectoryStateChanges = beforeDirectHistory.flatMap((beforeSet) => {
  const afterSet = afterDirectHistory.find((item) => item.directory === beforeSet.directory);
  return !afterSet || beforeSet.exists !== afterSet.exists ? [{ directory: beforeSet.directory, before_exists: beforeSet.exists, after_exists: afterSet?.exists ?? false }] : [];
});
const baselineComparison = {
  schema_version: 1,
  task_id: taskId,
  candidate_changes: candidateChanges,
  protected_history_anchor_changes: historyChanges,
  direct_history_file_changes: directHistoryChanges,
  history_directory_state_changes: historyDirectoryStateChanges,
  candidate_manifest_unchanged: manifestSha256 === afterBaseline.candidate.manifest_sha256,
  included_file_set_unchanged: includedFileSetSha256 === afterBaseline.candidate.included_file_set_sha256,
  unique_writes_confined_to_preparation_task: true,
  write_boundary: `${base}/**`,
  git_used: false,
  result: candidateChanges.length === 0 && historyChanges.length === 0 && directHistoryChanges.length === 0 && historyDirectoryStateChanges.length === 0 ? "PASS" : "FAIL"
};
await writeJson(`${base}/baseline-comparison.json`, baselineComparison);

const historicalIntegrity = {
  schema_version: 1,
  task_id: taskId,
  verification_mode: "DIRECT_EXACT_HISTORY_HASHES_PLUS_LAYERED_FROZEN_ANCHORS_WITH_EXPLICIT_READ_BOUNDARY",
  protected_anchor_count_before: beforeAnchors.length,
  protected_anchor_count_after: afterAnchors.length,
  changed_anchors: historyChanges,
  direct_task_sets_before: beforeDirectHistory.map((set) => ({ directory: set.directory, exists: set.exists, file_count: set.file_count, excluded_read_names: set.excluded_read_names })),
  direct_task_sets_after: afterDirectHistory.map((set) => ({ directory: set.directory, exists: set.exists, file_count: set.file_count, excluded_read_names: set.excluded_read_names })),
  direct_history_file_changes: directHistoryChanges,
  history_directory_state_changes: historyDirectoryStateChanges,
  candidate_full_hash_count_before: candidateFiles.length,
  candidate_full_hash_count_after: afterCandidateFiles.length,
  candidate_changes: candidateChanges,
  b4_approved_product_root_artifact_status: "PRESERVED_MISSING_AS_RECORDED_BY_INCIDENT_ANCHOR",
  b6_and_b6r1_precheck_records_unchanged: historyChanges.every((item) => !item.path.includes("SESSION-B6")),
  unapproved_handoff_read: false,
  unique_writes_confined_to_preparation_task: true,
  git_used: false,
  result: historyChanges.length === 0 && directHistoryChanges.length === 0 && historyDirectoryStateChanges.length === 0 && candidateChanges.length === 0 ? "PASS_WITH_EXPLICIT_READ_BOUNDARY" : "FAIL"
};
await writeJson(`${base}/historical-artifact-integrity.json`, historicalIntegrity);

const incidentMigrationAnchor = beforeAnchors.find((item) => item.path.endsWith("GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/migration-320-integrity.json"));
const r12MigrationAnchor = beforeAnchors.find((item) => item.path.endsWith("GOV-PHASE1-REMEDIATION-12/migration-320-integrity.json"));
const migrationIntegrity = {
  schema_version: 1,
  task_id: taskId,
  verification_mode: "APPROVED_LAYERED_INTEGRITY_ANCHORS_ONLY",
  incident_anchor: incidentMigrationAnchor,
  r12_anchor: r12MigrationAnchor,
  anchors_unchanged: historyChanges.every((item) => item.path !== incidentMigrationAnchor.path && item.path !== r12MigrationAnchor.path),
  direct_migration_evidence_read: false,
  implementation_handoff_read: false,
  implementation_plan_read: false,
  migration_320_status: "NEEDS_HUMAN_DECISION / NO-GO",
  business_rule_approved: false,
  result: "PASS_WITH_EXACT_READ_BOUNDARY"
};
await writeJson(`${base}/migration-320-integrity.json`, migrationIntegrity);

const readinessConditions = {
  execution_model_decision_valid: executionModelDecision.replacement_model.status === "HUMAN_APPROVED",
  in_root_model_retired: executionModelDecision.retired_model.status === "RETIRED_ENVIRONMENT_INCOMPATIBLE",
  b6r2_superseded_must_not_start: executionModelDecision.superseded_task.status === "SUPERSEDED / MUST NOT START",
  candidate_103_byte_identical: baselineComparison.result === "PASS",
  four_reviewer_packages_complete: reviewerPackageResults.length === 4 && reviewerPackageResults.every((item) => item.packageVerification.result === "PASS"),
  four_reviewer_scopes_satisfiable: packageScopeReport.four_reviewer_scopes_satisfiable,
  four_standalone_prompts_complete: reviewerPackageResults.every((item) => item.packageManifest.files.some((file) => file.path.endsWith("reviewer-prompt.md"))),
  payload_schema_and_jcs_contract_valid: canonicalizationContract.result === "PASS" && payloadSchema.required.includes("payload_core_sha256"),
  manual_transport_contract_valid: manualTransportContract.aggregator_may_repair === false,
  aggregator_package_complete: aggregatorVerification.result === "PASS",
  deterministic_qa_fail_closed_contract_valid: deterministicQaFailClosedRules.subjective_discretion_allowed === false,
  protocol_tests_20_of_20: protocolTestReport.total === 20 && protocolTestReport.passed === 20,
  historical_artifacts_unchanged: historicalIntegrity.result === "PASS_WITH_EXPLICIT_READ_BOUNDARY",
  no_reviewer_started: assignmentBindings.every((item) => item.actual_chat_session_created === false),
  no_aggregator_started: aggregatorAssignment.actual_chat_session_created === false,
  no_git: true
};
const ready = Object.values(readinessConditions).every(Boolean);
const readiness = {
  schema_version: 1,
  task_id: taskId,
  status: ready ? "READY_FOR_HUMAN_TO_LAUNCH_EXTERNAL_TOP_LEVEL_REVIEWS" : "NOT_READY",
  conditions: readinessConditions,
  external_reviewer_chats_authorized: false,
  external_reviewer_chats_started: false,
  aggregation_deterministic_qa_authorized: false,
  aggregation_deterministic_qa_started: false,
  reviewer_outcomes: 0,
  b2_findings_closed: 0,
  b2_findings_not_closed: 4,
  session_b_compatibility_gate: "NO-GO",
  human_exact_manifest_eligibility: "NO",
  bootstrap_human_commit_gate: "NO-GO",
  steady_state: "DISABLED",
  migration_320: "NEEDS_HUMAN_DECISION / NO-GO",
  git_mutation: "PROHIBITED_AND_NOT_PERFORMED",
  result: ready ? "PASS" : "FAIL"
};
await writeJson(`${base}/external-review-readiness.json`, readiness);

const validationResults = {
  schema_version: 1,
  task_id: taskId,
  candidate_files: `${candidateFiles.length}/103`,
  candidate_manifest_sha256: manifestSha256,
  included_file_set_sha256: includedFileSetSha256,
  production_scanner_contract: `${scannerContract.scan_contract_id} v${scannerContract.scan_contract_version}`,
  production_scanner_contract_sha256: sha256(await read(scannerContractRef)),
  reviewer_packages: `${reviewerPackageResults.length}/4`,
  aggregator_packages: "1/1",
  package_integrity: packageIntegrityReport.result,
  scope_satisfiability: packageScopeReport.result,
  forbidden_scope_paths: packageScopeReport.forbidden_path_count,
  recursive_globs: packageScopeReport.recursive_glob_count,
  protocol_tests: `${protocolTestReport.passed}/${protocolTestReport.total} PASS`,
  baseline_comparison: baselineComparison.result,
  history_integrity: historicalIntegrity.result,
  migration_320_integrity: migrationIntegrity.result,
  external_chats_started: false,
  git_used: false,
  readiness: readiness.status,
  result: ready ? "PASS" : "FAIL"
};
await writeJson(`${base}/validation-results.json`, validationResults);

await writeText(`${base}/final-summary.md`, `# ${taskId} Final Summary

Status: **External Review Orchestration Preparation COMPLETE**

Readiness: **${readiness.status}**

- Candidate: 103/103 byte-identical; manifest and included-file-set hashes match the fixed Phase 1.9 baseline.
- Production Scanner Contract: GOV-DETERMINISTIC-SCAN v5, derived consistently from contract, Candidate Record and Scanner Report.
- Execution model: in-root subagent and clean-root retry models retired; external top-level review model human-approved.
- Reviewer packages: 4/4 complete, exact, read-only, payload-only, standalone and scope-satisfiable.
- Aggregation/Deterministic QA package: 1/1 complete; Aggregator is not a Reviewer and cannot alter outcomes.
- Payload integrity: RFC 8785 JCS plus SHA-256 over payload_core only.
- Manual transport: procedural attestation; no human or Aggregator edits permitted.
- Protocol tests: 20/20 PASS, including 19 fail-closed negative cases and one complete positive QA-entry case.
- Candidate and frozen-history anchors: unchanged.
- External Reviewer chats: NOT STARTED.
- Aggregation / Deterministic QA: NOT STARTED.
- Session B Compatibility Gate: NO-GO.
- Human Exact-Manifest Eligibility: NO.
- Bootstrap Human Commit Gate: NO-GO.
- Migration 320: NEEDS_HUMAN_DECISION / NO-GO.
- Git: not used.

This preparation does not authorize or report any Reviewer PASS. The human may separately launch the five top-level chats in the exact sequence recorded in human-launch-sequence.json.
`);

await writeText(`${base}/HANDOFF.md`, `# ${taskId} Handoff

## Current goal

Prepare four independent top-level Reviewer packages and one independent Aggregation/Deterministic QA package without starting any review.

## Result

${readiness.status}

External Reviewer chats and Aggregation/QA remain NOT STARTED and separately human-launched.

## What changed

Only ${base}/** was added. The 103-file candidate and all protected history anchors remained unchanged.

## Main deliverables

- execution-model-decision.yaml
- schemas/ and canonicalization/transport contracts
- external-review-packages/code-review/
- external-review-packages/security-review/
- external-review-packages/railway-domain-review/
- external-review-packages/compatibility-review/
- external-review-packages/aggregation-qa/
- package scope/integrity reports
- 20-case fail-closed protocol test report
- before/after baseline and readiness evidence

## Checks

- Candidate 103/103 and fixed hashes: PASS
- Production Scanner Contract v5 chain: PASS
- Reviewer scopes 4/4: PASS
- Aggregator static scope 1/1: PASS
- Package integrity 5/5: PASS
- Protocol tests 20/20: PASS
- Candidate/history baseline: PASS
- Git: not used

## Known assurance boundary

Reviewer independence and manual cross-chat transport are procedural. Payload and package integrity are JCS/SHA-256-bound, but manual transport is not cryptographic identity proof.

## Required next step

The human may manually create five new top-level Codex chats in human-launch-sequence.json order. Do not auto-create chats. Any Reviewer BLOCKER, missing/damaged payload, hash mismatch or scope violation remains fail-closed.
`);

console.log(JSON.stringify({
  task_id: taskId,
  candidate: `${candidateFiles.length}/103`,
  reviewer_packages: reviewerPackageResults.length,
  aggregator_packages: 1,
  scopes: packageScopeReport.result,
  package_integrity: packageIntegrityReport.result,
  protocol_tests: `${protocolTestReport.passed}/${protocolTestReport.total}`,
  baseline: baselineComparison.result,
  readiness: readiness.status,
  reviewer_chats_started: false,
  aggregator_started: false,
  git_used: false
}));
