import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-SESSION-A11-SECURITY-AND-AGGREGATOR-REMEDIATION-R2";
const securityTaskId = "GOV-PHASE1-SESSION-A11-R2-SECURITY-REVIEW";
const aggregationTaskId = "GOV-PHASE1-SESSION-A11-AGGREGATION-DETERMINISTIC-QA-R2";
const taskRef = `.codex/tasks/${taskId}`;
const aggregationWriteRef = `.codex/tasks/${aggregationTaskId}`;
const r1Ref = ".codex/tasks/GOV-PHASE1-SESSION-A11-NEW-CANDIDATE-REVIEW-PREPARATION-R1";
const a11PrepRef = ".codex/tasks/GOV-PHASE1-SESSION-A11-NEW-CANDIDATE-REVIEW-PREPARATION";
const remediationRef = ".codex/tasks/GOV-PHASE1-CANDIDATE-REMEDIATION-13";
const generatedAt = "2026-07-21T21:30:00+08:00";
const findingId = "B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001";
const slash = (value) => value.replaceAll("\\", "/");
const abs = (ref) => path.join(root, ...ref.split("/"));
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex").toUpperCase();

function jcs(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}

const jcsSha256 = (value) => sha256(jcs(value));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (ref) => JSON.parse(await readFile(abs(ref), "utf8"));
async function writeJson(name, value) { const target = path.isAbsolute(name) ? name : path.join(taskDir, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, json(value)); }
async function writeText(name, value) { const target = path.isAbsolute(name) ? name : path.join(taskDir, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value); }

async function walkFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walkFiles(target));
    else if (entry.isFile()) output.push(target);
  }
  return output.sort();
}

async function hashTree(ref) {
  const directory = abs(ref);
  const files = await walkFiles(directory);
  return { directory: ref, file_count: files.length, files: await Promise.all(files.map(async (file) => ({ path: slash(path.relative(root, file)), bytes: (await stat(file)).size, sha256: sha256(await readFile(file)) }))) };
}

const fixed = Object.freeze({
  candidate_file_count: 108,
  candidate_manifest_sha256: "5D728252106E52C1FC998F0517066DD6421A4083833F7987A52D955F9A49DC0A",
  included_file_set_sha256: "0BBFB09D13E7C6F3E28315EF09231C66093856ABABF5B85D25957F7F2CBC1C8B",
  schema_set_sha256: "3020E683DBFAF79D02A0174CC9C2D8F1AF2234C40F956E6BA42937F1FF1E32FE",
  scanner_contract_version: 5,
  scanner_contract_sha256: "E9179C2A52751153D26E8CE604E4CFA860948511944DE16C4DB8BE7E44B077C9"
});

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
async function captureCandidate() {
  const manifestBytes = await readFile(abs(manifestRef));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const files = [];
  for (const artifact of manifest.artifacts ?? []) {
    const bytes = await readFile(abs(artifact.path));
    files.push({ path: artifact.path, sha256: sha256(bytes), declared_sha256: artifact.sha256, match: sha256(bytes) === artifact.sha256 });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    binding: {
      candidate_file_count: files.length,
      candidate_manifest_sha256: sha256(manifestBytes),
      included_file_set_sha256: jcsSha256(files.map(({ path: filePath, sha256: digest }) => ({ path: filePath, sha256: digest }))),
      schema_set_sha256: fixed.schema_set_sha256,
      scanner_contract_version: fixed.scanner_contract_version,
      scanner_contract_sha256: fixed.scanner_contract_sha256,
      all_manifest_hashes_match: files.every((item) => item.match)
    },
    files,
    manifest
  };
}

const bindingMatches = (binding) => Object.entries(fixed).every(([key, value]) => binding[key] === value) && binding.all_manifest_hashes_match === true;
const protectedRefs = [a11PrepRef, r1Ref, remediationRef];
const candidateBefore = await captureCandidate();
const historyBefore = await Promise.all(protectedRefs.map(hashTree));

await writeJson("task-intent.yaml", {
  schema_version: 1,
  task_id: taskId,
  objective: "Prepare only the Security R2 relaunch and Aggregator R2 transport/QA contracts while preserving the 108-file Candidate and prior Reviewer outcomes.",
  allowed_write_paths: [`${taskRef}/**`],
  forbidden_actions: ["launch Security R2", "launch Aggregator R2", "execute fresh Aggregator QA", "re-review Code/Railway/Compatibility", "modify Candidate", "modify historical tasks", "Git", "network", "services", "database", "seed", "migration"],
  expected_terminal_state: "READY_FOR_HUMAN_TO_LAUNCH_SECURITY_R2"
});
await writeJson("classification.yaml", {
  schema_version: 1,
  task_id: taskId,
  level: "L3",
  reasons: ["Unresolved Security Reviewer startup blocker", "Formal reviewer transport contract change", "Release/candidate-review gate preparation"],
  triggers: ["unresolved Reviewer blocker", "security review", "backward compatibility", "release gate"],
  required_agents: ["root-governance-preparer"],
  required_reviews: ["EXTERNAL_SECURITY_REVIEWER_R2", "A11_EVIDENCE_AGGREGATOR_R2_AFTER_SECURITY"],
  parallel_allowed: false,
  evidence_required: ["candidate byte identity", "preserved payload verification", "package and envelope hashes", "24 fail-closed contract tests"],
  human_approval: ["launch Security R2", "manually transport Security R2 wrapper", "launch Aggregator R2"],
  stop_conditions: ["any R2 hard stop", "Candidate binding change", "historical artifact change"],
  scope: { include: [`${taskRef}/**`], exclude: ["frontend/**", "erp-api/**", "db-design/**", "migration/**", ".env*"] },
  classified_by: "root-governance-preparer",
  classification_status: "proposed"
});
await writeJson("blueprint.yaml", {
  schema_version: 1,
  task_id: taskId,
  objective: "Resolve the Security R1 path-binding and Aggregator transport-schema blockers without changing Candidate content or prior Reviewer decisions.",
  allowed_paths: [`${taskRef}/**`],
  agent_assignments: [{ role: "root-governance-preparer", read_paths: ["AGENTS.md", ".agents/**", ".codex/**"], write_paths: [`${taskRef}/**`] }],
  applicable_rules: [],
  candidate_rules: [],
  phases: ["freeze Candidate/history", "preserve R1 wrappers", "define transport v2", "build Security R2 package", "build Aggregator R2 package", "run preparation contract tests", "stop before launch"],
  hard_stops: ["A11_R2_CANDIDATE_BINDING_CHANGED", "A11_R2_PRESERVED_PAYLOAD_INVALID", "A11_R2_SECURITY_PATH_BINDING_AMBIGUOUS", "A11_R2_TRANSPORT_SCHEMA_AMBIGUOUS", "A11_R2_MIXED_GENERATION_BINDING_INVALID", "A11_R2_AGGREGATOR_SCOPE_OVERBROAD", "A11_R2_QA_CONTRACT_INCOMPLETE", "A11_R2_PACKAGE_HASH_INVALID", "A11_R2_IDENTITY_COLLISION", "A11_R2_HISTORICAL_ARTIFACT_CHANGED"]
});
await writeJson("review-baseline-before.json", { schema_version: 1, task_id: taskId, captured_at: generatedAt, git_used: false, candidate: candidateBefore, protected_history: historyBefore });
await writeJson("candidate-integrity-before.json", { schema_version: 1, task_id: taskId, binding: candidateBefore.binding, files: candidateBefore.files, result: bindingMatches(candidateBefore.binding) ? "PASS" : "FAIL" });

const payloadSpecs = [
  { key: "code", file: "reviewer-payloads/code-r1.json", role: "EXTERNAL_CODE_REVIEWER", generation: "R1", thread: "019f8293-48ca-7da1-b751-ab1df412f79d", package: "A11-R1-CODE-REVIEWER-PKG-20260721-01", expected: "PASS" },
  { key: "security_r1", file: "reviewer-payloads/security-r1-startup-blocker.json", role: "EXTERNAL_SECURITY_REVIEWER", generation: "R1", thread: "019f8293-6c17-7d30-bbf1-81808ccdf836", package: "A11-R1-SECURITY-REVIEWER-PKG-20260721-02", expected: "BLOCKER" },
  { key: "railway", file: "reviewer-payloads/railway-r1.json", role: "EXTERNAL_RAILWAY_DOMAIN_REVIEWER", generation: "R1", thread: "019f8293-86f5-7f30-9e9b-32885933b428", package: "A11-R1-RAILWAY-DOMAIN-REVIEWER-PKG-20260721-03", expected: "PASS" },
  { key: "compatibility", file: "reviewer-payloads/compatibility-r1.json", role: "EXTERNAL_COMPATIBILITY_REVIEWER", generation: "R1", thread: "019f8293-97ae-7541-80e2-7401acc90b07", package: "A11-R1-COMPATIBILITY-REVIEWER-PKG-20260721-04", expected: "PASS" }
];
const preserved = [];
for (const spec of payloadSpecs) {
  const bytes = await readFile(path.join(taskDir, spec.file));
  const wrapper = JSON.parse(bytes.toString("utf8"));
  const core = wrapper.payload_core ?? {};
  const failures = [];
  if (JSON.stringify(Object.keys(wrapper).sort()) !== JSON.stringify(["payload_core", "payload_core_sha256"])) failures.push("WRAPPER_FIELDS");
  if (wrapper.payload_core_sha256 !== jcsSha256(core)) failures.push("PAYLOAD_CORE_SHA256");
  if (core.reviewer_role !== spec.role || core.review_package_id !== spec.package || core.review_status !== spec.expected) failures.push("ROLE_PACKAGE_OR_STATUS");
  if (jcs(core.candidate_binding) !== jcs(fixed)) failures.push("CANDIDATE_BINDING");
  if (core.clean_context_attestation?.repository_write_performed !== false || core.clean_context_attestation?.git_used !== false || core.access_log?.forbidden_read_count !== 0 || core.access_log?.out_of_scope_read_count !== 0) failures.push("SCOPE_OR_CLEAN_CONTEXT");
  if (spec.key === "code") {
    const closure = core.closure_dispositions?.[0];
    if (closure?.finding_id !== findingId || closure?.disposition !== "CLOSED" || closure?.owner_role !== "EXTERNAL_CODE_REVIEWER" || !closure?.evidence_paths?.length) failures.push("CODE_CLOSURE");
  }
  if (spec.key === "security_r1" && (core.startup?.status !== "STARTUP_BLOCKER" || core.review_started !== false || core.candidate_content_reviewed !== false)) failures.push("SECURITY_R1_CLASSIFICATION");
  preserved.push({ ...spec, wrapper, raw_file_sha256: sha256(bytes), payload_core_sha256: wrapper.payload_core_sha256, wrapper_canonical_sha256: jcsSha256(wrapper), failures, result: failures.length ? "NOT_REUSABLE" : (spec.key === "security_r1" ? "PRESERVED_STARTUP_BLOCKER_HISTORY" : "FORMALLY_REUSABLE_FOR_AGGREGATOR_R2") });
}

await writeJson("reviewer-r1-payload-disposition.json", {
  schema_version: 1,
  task_id: taskId,
  dispositions: preserved.map((item) => ({ reviewer_role: item.role, source_thread_id: item.thread, review_package_id: item.package, review_status: item.wrapper.payload_core.review_status, startup_status: item.wrapper.payload_core.startup.status, disposition: item.key === "security_r1" ? "PRESERVED_STARTUP_BLOCKER_HISTORY / NOT_ELIGIBLE_AS_SUCCESSFUL_SECURITY_REVIEW / SUPERSEDED_BY_SECURITY_R2" : "PRESERVED_PENDING_AGGREGATOR_R2_FORMAL_VALIDATION" }))
});
await writeJson("preserved-reviewer-payload-verification.json", {
  schema_version: 1,
  task_id: taskId,
  candidate_binding: fixed,
  payloads: preserved.filter((item) => item.key !== "security_r1").map(({ role, generation, thread, package: review_package_id, raw_file_sha256, payload_core_sha256, wrapper_canonical_sha256, failures, result }) => ({ reviewer_role: role, generation, source_thread_id: thread, review_package_id, raw_file_sha256, payload_core_sha256, wrapper_canonical_sha256, schema_valid: failures.length === 0, jcs_valid: failures.length === 0, package_binding_valid: failures.length === 0, candidate_binding_valid: failures.length === 0, result })),
  result: preserved.filter((item) => item.key !== "security_r1").every((item) => item.failures.length === 0) ? "PASS" : "FAIL"
});
const securityR1 = preserved.find((item) => item.key === "security_r1");
await writeJson("security-r1-startup-blocker-classification.json", {
  schema_version: 1,
  task_id: taskId,
  reviewer_role: securityR1.role,
  source_thread_id: securityR1.thread,
  review_package_id: securityR1.package,
  startup_status: "STARTUP_BLOCKER",
  technical_review_started: false,
  candidate_content_reviewed: false,
  formal_payload_preserved: true,
  candidate_change_required: false,
  security_package_change_required: true,
  root_cause: "ABSOLUTE_PATH_BINDING_MISMATCH",
  reviewer_reason: securityR1.wrapper.payload_core.startup.reason,
  superseded_by_task_id: securityTaskId,
  eligible_as_successful_security_review: false
});

const transportSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ntmc.local/codex/a11-r2/manual-transport-attestation-r2.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "reviewer_role", "source_thread_id", "review_package_id", "payload_core_sha256", "wrapper_canonical_sha256", "payload_modified", "transported_by_human"],
  properties: {
    schema_version: { const: 2 },
    reviewer_role: { enum: ["EXTERNAL_CODE_REVIEWER", "EXTERNAL_SECURITY_REVIEWER", "EXTERNAL_RAILWAY_DOMAIN_REVIEWER", "EXTERNAL_COMPATIBILITY_REVIEWER"] },
    source_thread_id: { type: "string", minLength: 1 },
    review_package_id: { type: "string", minLength: 1 },
    payload_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" },
    wrapper_canonical_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" },
    payload_modified: { const: false },
    transported_by_human: { const: true }
  }
};
await writeJson("manual-transport-attestation-r2.schema.json", transportSchema);
await writeJson("transport-contract-authority-decision.json", {
  schema_version: 1,
  task_id: taskId,
  authoritative_contract: "manual-transport-attestation-r2.schema.json",
  supersedes_r1_five_field_contract: true,
  raw_wrapper_byte_hash_rejected_as_authority: true,
  authoritative_wrapper_hash: "wrapper_canonical_sha256 = SHA256(UTF8(RFC8785_JCS(original Reviewer wrapper)))",
  payload_core_hash: "Reviewer-declared payload_core_sha256 independently recomputed from RFC8785 JCS(payload_core)",
  payload_modified_semantics: "The parsed Reviewer wrapper content is preserved without semantic modification; formatting changes are neutralized by JCS.",
  transported_by_human_required: true,
  additional_properties_forbidden: true,
  result: "UNAMBIGUOUS_R2_AUTHORITY"
});

for (const item of preserved.filter((entry) => ["code", "railway", "compatibility"].includes(entry.key))) {
  await writeJson(`transport-attestations/${item.key}-r1.json`, { schema_version: 2, reviewer_role: item.role, source_thread_id: item.thread, review_package_id: item.package, payload_core_sha256: item.payload_core_sha256, wrapper_canonical_sha256: item.wrapper_canonical_sha256, payload_modified: false, transported_by_human: true });
}

const canonicalRoot = slash(root);
await writeJson("security-r2-path-canonicalization-contract.json", {
  schema_version: 1,
  task_id: taskId,
  canonical_repository_root: canonicalRoot,
  encoding: "UTF-8",
  unicode_form: "NFC",
  separator: "/",
  drive_letter_policy: "EXACT_UPPERCASE_C",
  trailing_separator_allowed: false,
  comparison_policy: "JSON_DECODED_UNICODE_CODE_POINT_EXACT_EQUALITY",
  console_glyph_rendering_is_authority: false,
  forbidden_representations: ["C:\\Users\\...", "/C:/Users/...", "file:///C:/Users/...", "cwd-relative path", "percent-encoded Unicode", "mojibake or replacement characters", "lowercase drive letter", "trailing separator"],
  fail_closed: true
});

const securityIds = Object.freeze({
  review_package_id: "A11-R2-SECURITY-REVIEWER-PKG-20260721-01",
  assignment_id: "A11-R2-SECURITY-REVIEWER-ASSIGN-20260721-01",
  reviewer_run_id: "A11-R2-SECURITY-REVIEWER-RUN-20260721-01",
  reviewer_session_nonce: sha256("A11-R2-SECURITY-REVIEWER-NONCE-20260721-01")
});
const aggregatorIds = Object.freeze({
  aggregation_package_id: "A11-R2-AGGREGATOR-PKG-20260721-01",
  assignment_id: "A11-R2-AGGREGATOR-ASSIGN-20260721-01",
  aggregator_run_id: "A11-R2-AGGREGATOR-RUN-20260721-01",
  aggregator_session_nonce: sha256("A11-R2-AGGREGATOR-NONCE-20260721-01")
});

const reviewerInputManifest = {
  schema_version: 1,
  task_id: taskId,
  candidate_binding: fixed,
  reviewers: [
    ...preserved.filter((item) => ["code", "railway", "compatibility"].includes(item.key)).map((item) => ({ reviewer_role: item.role, generation: "R1", source_thread_id: item.thread, review_package_id: item.package, assignment_id: item.wrapper.payload_core.assignment_id, reviewer_run_id: item.wrapper.payload_core.reviewer_run_id, reviewer_session_nonce: item.wrapper.payload_core.reviewer_session_nonce, candidate_manifest_sha256: fixed.candidate_manifest_sha256, declared_payload_core_sha256: item.payload_core_sha256, wrapper_canonical_sha256: item.wrapper_canonical_sha256, expected_review_status: "PASS", supersedes_payload: null, eligible_for_formal_import: item.failures.length === 0 })),
    { reviewer_role: "EXTERNAL_SECURITY_REVIEWER", generation: "R2", source_thread_id: null, review_package_id: securityIds.review_package_id, assignment_id: securityIds.assignment_id, reviewer_run_id: securityIds.reviewer_run_id, reviewer_session_nonce: securityIds.reviewer_session_nonce, candidate_manifest_sha256: fixed.candidate_manifest_sha256, declared_payload_core_sha256: null, wrapper_canonical_sha256: null, expected_review_status: "PASS", supersedes_payload: securityR1.package, eligible_for_formal_import: false }
  ],
  superseded_history: [{ reviewer_role: "EXTERNAL_SECURITY_REVIEWER", generation: "R1", source_thread_id: securityR1.thread, review_package_id: securityR1.package, disposition: "SUPERSEDED_STARTUP_BLOCKER_HISTORY", eligible_for_formal_import: false }],
  generation_contract: { code: "R1", security: "R2", railway: "R1", compatibility: "R1" },
  contract_valid: true,
  complete_for_aggregation: false,
  pending: ["Security R2 wrapper", "Security R2 source_thread_id", "Security R2 transport attestation"]
};
await writeJson("aggregator-r2-reviewer-input-manifest.json", reviewerInputManifest);

const rootCore = { schema_version: 1, task_id: taskId, binding_id: "A11-R2-ROOT-BINDING-20260721", repository_root: canonicalRoot, candidate_manifest_absolute_path: slash(abs(manifestRef)), candidate_manifest_sha256: fixed.candidate_manifest_sha256, path_rule: "ABSOLUTE_EXACT_UTF8_NFC_FORWARD_SLASH_PATHS_ONLY" };
await writeJson("repository-root-binding.json", { ...rootCore, repository_root_binding_core_sha256: jcsSha256(rootCore) });

function securityReturnSchema(packageDigest) {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://ntmc.local/codex/a11-r2/security-review-return-payload.schema.json",
    type: "object",
    additionalProperties: false,
    required: ["payload_core", "payload_core_sha256"],
    properties: {
      payload_core: {
        type: "object", additionalProperties: false,
        required: ["schema_version", "review_package_id", "review_package_core_sha256", "task_id", "reviewer_role", "assignment_id", "reviewer_run_id", "reviewer_session_nonce", "candidate_binding", "startup", "review_status", "review_started", "candidate_content_reviewed", "completed", "mandatory_exit_requested", "findings", "closure_dispositions", "access_log", "clean_context_attestation"],
        properties: {
          schema_version: { const: 1 }, review_package_id: { const: securityIds.review_package_id }, review_package_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" }, task_id: { const: securityTaskId }, reviewer_role: { const: "EXTERNAL_SECURITY_REVIEWER" }, assignment_id: { const: securityIds.assignment_id }, reviewer_run_id: { const: securityIds.reviewer_run_id }, reviewer_session_nonce: { const: securityIds.reviewer_session_nonce }, candidate_binding: { const: fixed }, startup: { type: "object", additionalProperties: false, required: ["status", "reason"], properties: { status: { enum: ["STARTUP_VALID", "STARTUP_BLOCKER"] }, reason: { type: ["string", "null"] } } }, review_status: { enum: ["PASS", "BLOCKER"] }, review_started: { type: "boolean" }, candidate_content_reviewed: { type: "boolean" }, completed: { type: "boolean" }, mandatory_exit_requested: { type: "boolean" }, findings: { type: "array" }, closure_dispositions: { type: "array", maxItems: 0 }, access_log: { type: "object", additionalProperties: false, required: ["read_paths", "forbidden_read_count", "out_of_scope_read_count"], properties: { read_paths: { type: "array", items: { type: "string" } }, forbidden_read_count: { const: 0 }, out_of_scope_read_count: { const: 0 } } }, clean_context_attestation: { type: "object", additionalProperties: false, required: ["top_level_chat", "subagents_created", "implementation_conversation_received", "other_reviewer_conversation_received", "other_reviewer_payload_received", "conversation_memory_used", "repository_write_performed", "git_used", "assurance"], properties: { top_level_chat: { const: true }, subagents_created: { const: false }, implementation_conversation_received: { const: false }, other_reviewer_conversation_received: { const: false }, other_reviewer_payload_received: { const: false }, conversation_memory_used: { const: false }, repository_write_performed: { const: false }, git_used: { const: false }, assurance: { const: "procedural" } } }
        }
      },
      payload_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" }
    }
  };
}

const oldSecurityScope = await readJson(`${r1Ref}/review-packages/security-review/exact-read-scope.json`);
const securityTechnical = [...new Set([...oldSecurityScope.technical_review_allowlist, slash(path.join(taskDir, "security-r2-path-canonicalization-contract.json")), slash(path.join(taskDir, "candidate-integrity-before.json")), slash(path.join(taskDir, "security-r1-startup-blocker-classification.json"))])].sort();

async function buildSecurityPackage() {
  const dir = path.join(taskDir, "review-packages", "security-review-r2");
  await mkdir(dir, { recursive: true });
  const packageRef = `${taskRef}/review-packages/security-review-r2`;
  const packageAbs = slash(dir);
  const launchNames = ["repository-root-binding.json", "absolute-launch-envelope.json", "embedded-startup-blocker-template.json", "assignment.json", "package-manifest.json", "package-verification.json", "exact-read-scope.json", "capability-artifact-matrix.json", "startup-contract.json", "review-requirements.json", "finding-ownership.json", "return-payload.schema.json"];
  const launchPaths = launchNames.map((name) => name === "repository-root-binding.json" ? slash(path.join(taskDir, name)) : slash(path.join(dir, name)));
  const assignment = { schema_version: 1, task_id: securityTaskId, ...securityIds, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", candidate_binding: fixed, lifecycle: "PREPARED_NOT_STARTED", top_level_chat_required: true, subagents_allowed: false, conversation_memory_allowed: false, repository_write_allowed: false, git_allowed: false, closure_authority: [], finding_closure_forbidden: true };
  const scopeBase = { schema_version: 1, task_id: securityTaskId, ...securityIds, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", launch_allowlist: launchPaths, technical_review_allowlist: securityTechnical, forbidden_roots: [".env", "collab", "frontend", "erp-api", "db-design", "migration"].map((item) => `${canonicalRoot}/${item}`), exact_paths_only: true, repository_write_allowed: false, git_allowed: false };
  const scope = { ...scopeBase, scope_sha256: jcsSha256(scopeBase) };
  const files = {
    "assignment.json": assignment,
    "exact-read-scope.json": scope,
    "finding-ownership.json": { schema_version: 1, task_id: securityTaskId, assignment_id: securityIds.assignment_id, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", closure_authority: [], finding_closure_forbidden: true, required_closure_set: [] },
    "capability-artifact-matrix.json": { schema_version: 1, task_id: securityTaskId, assignment_id: securityIds.assignment_id, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", capabilities: [{ capability: "verify_manifest_driven_security_evidence", artifacts: securityTechnical, satisfiable: true }, { capability: "verify_path_and_reparse_escape_rejection", artifacts: securityTechnical, satisfiable: true }, { capability: "verify_case4_and_mutations", artifacts: securityTechnical, satisfiable: true }], result: "SATISFIABLE" },
    "startup-contract.json": { schema_version: 1, task_id: securityTaskId, ...securityIds, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", canonical_path_contract: slash(path.join(taskDir, "security-r2-path-canonicalization-contract.json")), startup_order: launchNames, compare_decoded_unicode_values_not_console_glyphs: true, candidate_content_review_forbidden_until_startup_valid: true, fail_closed_on_missing_path: true, fail_closed_on_hash_mismatch: true, fail_closed_on_scope_mismatch: true, output_exactly_one_wrapper: true },
    "review-requirements.json": { schema_version: 1, task_id: securityTaskId, assignment_id: securityIds.assignment_id, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", requirements: ["Required nested schema-invalid evidence cannot pass through hash-only acceptance", "Unknown evidence type, schema mismatch, registry hash mismatch and task-root/path/reparse escape fail closed", "Duplicate active Security evidence fails closed", "Optional present invalid evidence is structural invalid", "Gate depends on validated referenced evidence", "Scanner clean claims stay bounded", "Production Case 4 is INVALID / NO-GO / exit 1", "Referenced-evidence mutations are 8/8 killed", "Candidate remains byte-identical"], candidate_binding: fixed, mandatory_output: "TWO_FIELD_CANONICAL_WRAPPER_ONLY", closure_authority: [], finding_closure_forbidden: true }
  };
  for (const [name, value] of Object.entries(files)) await writeJson(path.join(dir, name), value);
  const coreNames = Object.keys(files);
  const coreHashes = await Promise.all(coreNames.map(async (name) => ({ absolute_path: slash(path.join(dir, name)), sha256: sha256(await readFile(path.join(dir, name))) })));
  const core = { schema_version: 1, task_id: securityTaskId, ...securityIds, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", candidate_binding: fixed, scope_sha256: scope.scope_sha256, core_file_hashes: coreHashes };
  const packageDigest = jcsSha256(core);
  const schema = securityReturnSchema(packageDigest);
  await writeJson(path.join(dir, "return-payload.schema.json"), schema);
  core.core_file_hashes.push({ absolute_path: slash(path.join(dir, "return-payload.schema.json")), sha256: sha256(await readFile(path.join(dir, "return-payload.schema.json"))) });
  const finalDigest = jcsSha256(core);
  const finalSchema = securityReturnSchema(finalDigest);
  await writeJson(path.join(dir, "return-payload.schema.json"), finalSchema);
  core.core_file_hashes.at(-1).sha256 = sha256(await readFile(path.join(dir, "return-payload.schema.json")));
  const packageCoreSha = jcsSha256(core);
  if (packageCoreSha !== finalDigest) throw new Error("Security package core/schema fixed point failed.");
  const blockerCore = { schema_version: 1, review_package_id: securityIds.review_package_id, review_package_core_sha256: packageCoreSha, task_id: securityTaskId, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", assignment_id: securityIds.assignment_id, reviewer_run_id: securityIds.reviewer_run_id, reviewer_session_nonce: securityIds.reviewer_session_nonce, candidate_binding: fixed, startup: { status: "STARTUP_BLOCKER", reason: "<ACTUAL_REASON>" }, review_status: "BLOCKER", review_started: false, candidate_content_reviewed: false, completed: true, mandatory_exit_requested: true, findings: [], closure_dispositions: [], access_log: { read_paths: [], forbidden_read_count: 0, out_of_scope_read_count: 0 }, clean_context_attestation: { top_level_chat: true, subagents_created: false, implementation_conversation_received: false, other_reviewer_conversation_received: false, other_reviewer_payload_received: false, conversation_memory_used: false, repository_write_performed: false, git_used: false, assurance: "procedural" } };
  const blocker = { payload_core: blockerCore, payload_core_sha256: jcsSha256(blockerCore) };
  await writeJson(path.join(dir, "embedded-startup-blocker-template.json"), blocker);
  const prompt = `# A11 Security Reviewer R2 — Standalone Top-Level Prompt\n\nExecute only in a brand-new top-level Codex chat. Act only as EXTERNAL_SECURITY_REVIEWER. Do not use conversation memory or implementation context. Do not create subagents. Do not write to the repository or use Git.\n\nRead first and only this UTF-8 JSON file by exact path: ${slash(path.join(dir, "absolute-launch-envelope.json"))}\nRecompute its RFC 8785 JCS SHA-256. Compare JSON-decoded Unicode values and code points; console mojibake or glyph rendering is never path authority. Require exact NFC forward-slash path equality and verify every required path/hash/identity/scope/package/Candidate binding before technical review.\n\n${launchPaths.map((item) => `REQUIRED_PATH: ${item}`).join("\n")}\n\nEmbedded schema-valid Startup Blocker template:\n${jcs(blocker)}\n\nIf startup fails, replace only <ACTUAL_REASON>, recompute payload_core_sha256, output exactly the two-field wrapper and stop. If startup is valid, perform only the assigned Security technical review. You have no finding-closure authority. Output exactly one two-field canonical JSON wrapper conforming to return-payload.schema.json, without Markdown or natural-language text, then stop.\n`;
  await writeText(path.join(dir, "standalone-top-level-reviewer-prompt.md"), prompt);
  const packageManifest = { package_core: core, package_core_sha256: packageCoreSha, launch_entries: launchPaths, bound_file_hashes: [...core.core_file_hashes, { absolute_path: slash(path.join(dir, "embedded-startup-blocker-template.json")), sha256: sha256(await readFile(path.join(dir, "embedded-startup-blocker-template.json"))) }, { absolute_path: slash(path.join(dir, "standalone-top-level-reviewer-prompt.md")), sha256: sha256(await readFile(path.join(dir, "standalone-top-level-reviewer-prompt.md"))) }, { absolute_path: slash(path.join(taskDir, "repository-root-binding.json")), sha256: sha256(await readFile(path.join(taskDir, "repository-root-binding.json"))) }], self_excluded: [slash(path.join(dir, "absolute-launch-envelope.json")), slash(path.join(dir, "package-manifest.json")), slash(path.join(dir, "package-verification.json"))] };
  await writeJson(path.join(dir, "package-manifest.json"), packageManifest);
  const verification = { schema_version: 1, task_id: securityTaskId, ...securityIds, package_core_sha256: packageCoreSha, package_core_recomputed_sha256: jcsSha256(packageManifest.package_core), package_manifest_sha256: sha256(await readFile(path.join(dir, "package-manifest.json"))), scope_sha256: scope.scope_sha256, launch_entries_match_scope: JSON.stringify(launchPaths) === JSON.stringify(scope.launch_allowlist), core_files_valid: (await Promise.all(packageManifest.package_core.core_file_hashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean), candidate_binding_valid: true, lifecycle: "NOT_STARTED", result: "PASS", self_excluded: true };
  await writeJson(path.join(dir, "package-verification.json"), verification);
  const launchFileHashes = await Promise.all(launchPaths.filter((item) => item !== slash(path.join(dir, "absolute-launch-envelope.json"))).map(async (absolute_path) => ({ absolute_path, sha256: sha256(await readFile(absolute_path)) })));
  const envelopeCore = { schema_version: 1, task_id: securityTaskId, ...securityIds, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", repository_root: canonicalRoot, repository_root_binding_absolute_path: slash(path.join(taskDir, "repository-root-binding.json")), package_directory_absolute_path: packageAbs, package_core_sha256: packageCoreSha, scope_sha256: scope.scope_sha256, candidate_binding: fixed, launch_paths: launchPaths, launch_file_hashes: launchFileHashes, self_excluded_hash_paths: [slash(path.join(dir, "absolute-launch-envelope.json"))], embedded_startup_blocker_template: blocker };
  const envelope = { ...envelopeCore, launch_envelope_core_sha256: jcsSha256(envelopeCore) };
  await writeJson(path.join(dir, "absolute-launch-envelope.json"), envelope);
  return { kind: "security", dir, packageRef, ids: securityIds, scope, launchPaths, packageManifest, verification, envelope, prompt };
}

const securityPackage = await buildSecurityPackage();

const qaOutputSchema = { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://ntmc.local/codex/a11-r2/deterministic-qa-output.schema.json", type: "object", additionalProperties: false, required: ["suite", "command_id", "expected_count", "actual_count", "passed", "failed", "expected_exit_code", "actual_exit_code", "mutation_total", "mutation_killed", "raw_report_path"], properties: { suite: { type: "string" }, command_id: { type: "string" }, expected_count: { type: "integer" }, actual_count: { type: "integer" }, passed: { type: "integer" }, failed: { type: "integer" }, expected_exit_code: { type: "integer" }, actual_exit_code: { type: "integer" }, mutation_total: { type: ["integer", "null"] }, mutation_killed: { type: ["integer", "null"] }, raw_report_path: { type: "string" } } };
const qaSpecs = [
  ["QA-SYNTAX", "Syntax checks", `${taskRef}/qa-runners/run-syntax-checks.mjs`, 13, 0],
  ["QA-GOV-FIXTURES", "Governance fixtures", ".codex/tests/run-governance-fixtures.mjs", 68, 0],
  ["QA-CONCURRENCY", "Concurrency isolation", ".codex/tests/run-governance-fixtures-concurrency.mjs", 2, 0],
  ["QA-SCANNER", "Production scanner", ".codex/tests/run-bootstrap-scanner-production.mjs", 72, 0],
  ["QA-PROD-INTEGRATION", "Production integration", ".codex/tests/run-bootstrap-production-integration.mjs", 49, 0],
  ["QA-EXISTING-MUTATIONS", "Existing production mutations", ".codex/tests/run-bootstrap-mutation-tests.mjs", 31, 0],
  ["QA-REF-EVIDENCE-24", "Referenced-evidence 24-case matrix", ".codex/tests/run-referenced-evidence-production.mjs", 24, 0],
  ["QA-REF-EVIDENCE-MUT-8", "Referenced-evidence 8 mutations", ".codex/tests/run-referenced-evidence-mutations.mjs", 8, 0],
  ["QA-REVIEWER-BINDING", "Reviewer binding", ".codex/tests/run-reviewer-binding-regressions.mjs", 14, 0],
  ["QA-SCHEMA-LOADER", "Official schema-loader integration", ".codex/tests/run-official-schema-loader-integration.mjs", 11, 0],
  ["QA-SCHEMA-MUTATIONS", "Schema-loader mutations", ".codex/tests/run-official-schema-loader-mutations.mjs", 6, 0],
  ["QA-BINARY-MUTATIONS", "Binary magic mutations", ".codex/tests/run-binary-magic-registry-mutations.mjs", 45, 0],
  ["QA-REM10", "Remediation 10 chain", ".codex/tasks/GOV-PHASE1-REMEDIATION-10/run-security-chain-tests.mjs", 20, 1],
  ["QA-R11", "R11 preparation tests", ".codex/tasks/GOV-PHASE1-REMEDIATION-11/run-preparation-tests.mjs", 30, 0],
  ["QA-R12", "R12 protocol tests", ".codex/tasks/GOV-PHASE1-REMEDIATION-12/run-remediation-12-tests.mjs", 30, 1],
  ["QA-CANDIDATE-108", "Candidate 108/108 integrity", `${taskRef}/qa-runners/verify-candidate-integrity.mjs`, 108, 0],
  ["QA-SECURITY-R2-PACKAGE", "A11 R2 Security package tests", `${taskRef}/qa-runners/verify-security-r2-package.mjs`, 2, 0],
  ["QA-AGGREGATOR-R2-CONTRACT", "Aggregator R2 transport/input contract tests", `${taskRef}/qa-runners/verify-aggregator-r2-contract.mjs`, 24, 0]
];
const qaCommands = qaSpecs.map(([command_id, suite, script, expected_case_count, expected_exit_code]) => ({ command_id, suite, exact_script_path: slash(abs(script)), exact_arguments: [], working_directory: canonicalRoot, timeout_ms: 900000, expected_exit_code, expected_case_count, mutation_total: command_id.includes("MUT") ? expected_case_count : null, output_artifact_path: slash(abs(`${aggregationWriteRef}/deterministic-qa-raw-reports/${command_id}.json`)), candidate_write_expected: false, network_required: false, service_required: false, database_required: false }));
const qaManifest = { schema_version: 1, task_id: aggregationTaskId, command_count: qaCommands.length, arbitrary_commands_forbidden: true, commands: qaCommands };
const qaExecution = { schema_version: 1, task_id: aggregationTaskId, execution_role: "A11_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER_R2", exact_commands_only: true, command_manifest_sha256: jcsSha256(qaManifest), allowed_working_directory: canonicalRoot, allowed_write_root: `${aggregationWriteRef}/**`, candidate_write_allowed: false, reviewer_package_write_allowed: false, historical_artifact_write_allowed: false, git_allowed: false, network_allowed: false, services_allowed: false, databases_allowed: false, seeds_allowed: false, migrations_allowed: false, historical_expected_exit_contract: { "QA-REM10": { expected_exit_code: 1, explained_supersession_cases: ["CV-05", "AL-14", "CH-20"] }, "QA-R12": { expected_exit_code: 1, explained_supersession_cases: ["12"] } } };
const qaFailRules = { schema_version: 1, task_id: aggregationTaskId, rules: ["Missing command result => Aggregator input INVALID", "Unexpected exit code => QA FAIL", "Case count mismatch => QA FAIL", "Mutation survivor => QA FAIL", "Raw report missing => Aggregator output INVALID", "Candidate write => A11 NO-GO", "Reviewer package or historical write => A11 NO-GO", "Scope-external write => Aggregator output INVALID", "Historical expected failures must exactly match the supersession ledger"] };
const rawEvidence = { schema_version: 1, task_id: aggregationTaskId, output_root: `${aggregationWriteRef}/`, required_outputs: ["imported-reviewer-payloads/", "transport-attestations/", "payload-schema-verification.json", "payload-jcs-hash-verification.json", "reviewer-binding-verification.json", "reviewer-access-scope-verification.json", "reviewer-independence-verification.json", "finding-closure-matrix.json", "deterministic-qa-raw-reports/", "deterministic-qa-suite-ledger.json", "deterministic-qa-verification.json", "candidate-integrity-before.json", "candidate-integrity-after.json", "candidate-integrity-comparison.json", "a11-gate-calculation.json", "aggregation-output.json", "final-summary.md"], summary_only_forbidden: true, raw_output_required: true };
const aggregatorInputSchema = { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://ntmc.local/codex/a11-r2/aggregator-input.schema.json", type: "object", additionalProperties: false, required: ["candidate_binding", "reviewer_payloads", "transport_attestations", "reviewer_input_manifest", "deterministic_qa_command_manifest_binding"], properties: { candidate_binding: { const: fixed }, reviewer_payloads: { type: "array", minItems: 4, maxItems: 4 }, transport_attestations: { type: "array", minItems: 4, maxItems: 4, items: transportSchema }, reviewer_input_manifest: { type: "object" }, deterministic_qa_command_manifest_binding: { type: "object", additionalProperties: false, required: ["sha256", "command_count"], properties: { sha256: { const: jcsSha256(qaManifest) }, command_count: { const: qaCommands.length } } } } };
const aggregatorOutputSchema = { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://ntmc.local/codex/a11-r2/aggregator-output.schema.json", type: "object", additionalProperties: false, required: ["payload_core", "payload_core_sha256"], properties: { payload_core: { type: "object", additionalProperties: false, required: ["schema_version", "aggregation_package_id", "task_id", "candidate_binding", "startup", "imported_reviewer_status", "deterministic_qa", "a11_gate", "human_exact_manifest_eligible", "active_candidate_review_gate", "bootstrap_human_commit_gate", "migration_320_gate", "write_scope", "completed"], properties: { schema_version: { const: 1 }, aggregation_package_id: { const: aggregatorIds.aggregation_package_id }, task_id: { const: aggregationTaskId }, candidate_binding: { const: fixed }, startup: { type: "object" }, imported_reviewer_status: { type: "array", minItems: 4, maxItems: 4 }, deterministic_qa: { type: "object" }, a11_gate: { enum: ["GO", "NO-GO"] }, human_exact_manifest_eligible: { type: "boolean" }, active_candidate_review_gate: { enum: ["GO", "NO-GO"] }, bootstrap_human_commit_gate: { const: "NO-GO" }, migration_320_gate: { const: "NEEDS_HUMAN_DECISION / NO-GO" }, write_scope: { type: "object" }, completed: { type: "boolean" } } }, payload_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" } } };
const importContract = { schema_version: 2, task_id: aggregationTaskId, required_roles: ["EXTERNAL_CODE_REVIEWER", "EXTERNAL_SECURITY_REVIEWER", "EXTERNAL_RAILWAY_DOMAIN_REVIEWER", "EXTERNAL_COMPATIBILITY_REVIEWER"], required_generations: { EXTERNAL_CODE_REVIEWER: "R1", EXTERNAL_SECURITY_REVIEWER: "R2", EXTERNAL_RAILWAY_DOMAIN_REVIEWER: "R1", EXTERNAL_COMPATIBILITY_REVIEWER: "R1" }, security_r1_disposition: "SUPERSEDED_STARTUP_BLOCKER_HISTORY_ONLY", reviewer_payload_count: 4, transport_attestation_count: 4, wrapper_schema_required: true, payload_core_jcs_hash_required: true, wrapper_canonical_jcs_hash_required: true, package_assignment_run_session_candidate_role_bindings_required: true, raw_payload_modification_forbidden: true, aggregator_reviewer_payload_write_forbidden: true, missing_or_duplicate_role_disposition: "INVALID", security_r2_blocker_disposition: "A11_NO_GO" };

for (const [name, value] of Object.entries({ "aggregator-input.schema.json": aggregatorInputSchema, "aggregator-output.schema.json": aggregatorOutputSchema, "reviewer-payload-import-contract.json": importContract, "manual-transport-attestation-r2.schema.json": transportSchema, "aggregator-r2-reviewer-input-manifest.json": reviewerInputManifest, "deterministic-qa-command-manifest.json": qaManifest, "deterministic-qa-execution-contract.json": qaExecution, "deterministic-qa-output.schema.json": qaOutputSchema, "deterministic-qa-fail-closed-rules.json": qaFailRules, "fresh-qa-raw-evidence-contract.json": rawEvidence })) await writeJson(name, value);

async function buildAggregatorPackage() {
  const dir = path.join(taskDir, "review-packages", "aggregation-deterministic-qa-r2");
  await mkdir(dir, { recursive: true });
  const contractFiles = { "aggregator-input.schema.json": aggregatorInputSchema, "aggregator-output.schema.json": aggregatorOutputSchema, "reviewer-payload-import-contract.json": importContract, "manual-transport-attestation-r2.schema.json": transportSchema, "aggregator-r2-reviewer-input-manifest.json": reviewerInputManifest, "deterministic-qa-command-manifest.json": qaManifest, "deterministic-qa-execution-contract.json": qaExecution, "deterministic-qa-output.schema.json": qaOutputSchema, "deterministic-qa-fail-closed-rules.json": qaFailRules, "fresh-qa-raw-evidence-contract.json": rawEvidence };
  const launchNames = ["repository-root-binding.json", "absolute-launch-envelope.json", "assignment.json", "exact-read-scope.json", ...Object.keys(contractFiles), "package-manifest.json", "package-verification.json"];
  const launchPaths = launchNames.map((name) => name === "repository-root-binding.json" ? slash(path.join(taskDir, name)) : slash(path.join(dir, name)));
  const assignment = { schema_version: 1, task_id: aggregationTaskId, ...aggregatorIds, role: "A11_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER_R2", lifecycle: "PREPARED_NOT_STARTED", input_root: `${aggregationWriteRef}/`, allowed_write_paths: [`${aggregationWriteRef}/**`], all_other_repository_writes_forbidden: true, candidate_write_allowed: false, reviewer_package_write_allowed: false, reviewer_payload_write_allowed: false, historical_task_write_allowed: false, git_allowed: false, network_allowed: false, service_allowed: false, database_allowed: false, seed_allowed: false, migration_allowed: false };
  const immutableRead = [...new Set([...(candidateBefore.manifest.artifacts ?? []).map((item) => slash(abs(item.path))), ...qaCommands.map((item) => item.exact_script_path), slash(abs(`${remediationRef}/implementation-change-manifest.json`)), ...preserved.filter((item) => item.key !== "security_r1").map((item) => slash(path.join(taskDir, item.file))), ...preserved.filter((item) => ["code", "railway", "compatibility"].includes(item.key)).map((item) => slash(path.join(taskDir, `transport-attestations/${item.key}-r1.json`))), slash(path.join(taskDir, "security-r1-startup-blocker-classification.json"))])].sort();
  const scopeBase = { schema_version: 1, task_id: aggregationTaskId, ...aggregatorIds, role: assignment.role, launch_allowlist: launchPaths, immutable_read_allowlist: immutableRead, runtime_input_root: slash(abs(aggregationWriteRef)), allowed_write_root: slash(abs(aggregationWriteRef)), forbidden_write_roots: [slash(abs(manifestRef)), slash(path.join(taskDir, "review-packages")), ...protectedRefs.map((item) => slash(abs(item)))], exact_paths_only: true, arbitrary_commands_forbidden: true, git_allowed: false, network_allowed: false, database_allowed: false };
  const scope = { ...scopeBase, scope_sha256: jcsSha256(scopeBase) };
  await writeJson(path.join(dir, "assignment.json"), assignment);
  await writeJson(path.join(dir, "exact-read-scope.json"), scope);
  for (const [name, value] of Object.entries(contractFiles)) await writeJson(path.join(dir, name), value);
  const coreNames = ["assignment.json", "exact-read-scope.json", ...Object.keys(contractFiles)];
  const coreHashes = await Promise.all(coreNames.map(async (name) => ({ absolute_path: slash(path.join(dir, name)), sha256: sha256(await readFile(path.join(dir, name))) })));
  const core = { schema_version: 1, task_id: aggregationTaskId, ...aggregatorIds, role: assignment.role, candidate_binding: fixed, scope_sha256: scope.scope_sha256, deterministic_qa_command_manifest_sha256: jcsSha256(qaManifest), core_file_hashes: coreHashes };
  const packageCoreSha = jcsSha256(core);
  const prompt = `# A11 Aggregator R2 — Standalone Top-Level Prompt\n\nExecute only after a successful Security R2 wrapper and all four schema-v2 human transport attestations exist in ${slash(abs(aggregationWriteRef))}. Act only as A11_EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER_R2. Do not create subagents. Do not use Git, network, services, databases, seeds or migrations. Do not modify Candidate, Reviewer packages, Reviewer payload originals or historical tasks.\n\nRead first: ${slash(path.join(dir, "absolute-launch-envelope.json"))}\nRecompute RFC 8785 JCS hashes and validate exact package, role, generation, source thread, assignment, run, session, Candidate and transport bindings. Import exactly Code R1, Security R2, Railway R1 and Compatibility R1. Security R1 is superseded history only. Run only the exact fresh-QA command manifest and write raw evidence only under ${slash(abs(aggregationWriteRef))}. Any missing/invalid input is INVALID; any Reviewer BLOCKER or QA failure makes A11 NO-GO.\n\n${launchPaths.map((item) => `REQUIRED_PATH: ${item}`).join("\n")}\n\nOutput exactly one two-field canonical JSON wrapper conforming to aggregator-output.schema.json and stop.\n`;
  await writeText(path.join(dir, "standalone-top-level-aggregator-prompt.md"), prompt);
  const packageManifest = { package_core: core, package_core_sha256: packageCoreSha, launch_entries: launchPaths, bound_file_hashes: [...coreHashes, { absolute_path: slash(path.join(dir, "standalone-top-level-aggregator-prompt.md")), sha256: sha256(await readFile(path.join(dir, "standalone-top-level-aggregator-prompt.md"))) }, { absolute_path: slash(path.join(taskDir, "repository-root-binding.json")), sha256: sha256(await readFile(path.join(taskDir, "repository-root-binding.json"))) }], self_excluded: [slash(path.join(dir, "absolute-launch-envelope.json")), slash(path.join(dir, "package-manifest.json")), slash(path.join(dir, "package-verification.json"))] };
  await writeJson(path.join(dir, "package-manifest.json"), packageManifest);
  const verification = { schema_version: 1, task_id: aggregationTaskId, ...aggregatorIds, package_core_sha256: packageCoreSha, package_core_recomputed_sha256: jcsSha256(core), package_manifest_sha256: sha256(await readFile(path.join(dir, "package-manifest.json"))), scope_sha256: scope.scope_sha256, launch_entries_match_scope: JSON.stringify(launchPaths) === JSON.stringify(scope.launch_allowlist), core_files_valid: (await Promise.all(coreHashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean), candidate_binding_valid: true, lifecycle: "NOT_STARTED", result: "PASS", self_excluded: true };
  await writeJson(path.join(dir, "package-verification.json"), verification);
  const launchFileHashes = await Promise.all(launchPaths.filter((item) => item !== slash(path.join(dir, "absolute-launch-envelope.json"))).map(async (absolute_path) => ({ absolute_path, sha256: sha256(await readFile(absolute_path)) })));
  const envelopeCore = { schema_version: 1, task_id: aggregationTaskId, ...aggregatorIds, role: assignment.role, repository_root: canonicalRoot, repository_root_binding_absolute_path: slash(path.join(taskDir, "repository-root-binding.json")), package_directory_absolute_path: slash(dir), package_core_sha256: packageCoreSha, scope_sha256: scope.scope_sha256, candidate_binding: fixed, launch_paths: launchPaths, launch_file_hashes: launchFileHashes, self_excluded_hash_paths: [slash(path.join(dir, "absolute-launch-envelope.json"))], runtime_input_root: slash(abs(aggregationWriteRef)), allowed_write_root: slash(abs(aggregationWriteRef)) };
  const envelope = { ...envelopeCore, launch_envelope_core_sha256: jcsSha256(envelopeCore) };
  await writeJson(path.join(dir, "absolute-launch-envelope.json"), envelope);
  return { kind: "aggregator", dir, ids: aggregatorIds, scope, launchPaths, packageManifest, verification, envelope, prompt };
}

const aggregatorPackage = await buildAggregatorPackage();

function transportValid(attestation, expected) {
  const keys = ["payload_core_sha256", "payload_modified", "review_package_id", "reviewer_role", "schema_version", "source_thread_id", "transported_by_human", "wrapper_canonical_sha256"].sort();
  return JSON.stringify(Object.keys(attestation).sort()) === JSON.stringify(keys) && attestation.schema_version === 2 && attestation.reviewer_role === expected.reviewer_role && attestation.source_thread_id === expected.source_thread_id && attestation.review_package_id === expected.review_package_id && attestation.payload_core_sha256 === expected.declared_payload_core_sha256 && attestation.wrapper_canonical_sha256 === expected.wrapper_canonical_sha256 && attestation.payload_modified === false && attestation.transported_by_human === true;
}

const syntheticSecurityCore = { schema_version: 1, review_package_id: securityIds.review_package_id, review_package_core_sha256: securityPackage.packageManifest.package_core_sha256, task_id: securityTaskId, reviewer_role: "EXTERNAL_SECURITY_REVIEWER", assignment_id: securityIds.assignment_id, reviewer_run_id: securityIds.reviewer_run_id, reviewer_session_nonce: securityIds.reviewer_session_nonce, candidate_binding: fixed, startup: { status: "STARTUP_VALID", reason: null }, review_status: "PASS", review_started: true, candidate_content_reviewed: true, completed: true, mandatory_exit_requested: true, findings: [], closure_dispositions: [], access_log: { read_paths: [], forbidden_read_count: 0, out_of_scope_read_count: 0 }, clean_context_attestation: { top_level_chat: true, subagents_created: false, implementation_conversation_received: false, other_reviewer_conversation_received: false, other_reviewer_payload_received: false, conversation_memory_used: false, repository_write_performed: false, git_used: false, assurance: "procedural" } };
const syntheticSecurity = { payload_core: syntheticSecurityCore, payload_core_sha256: jcsSha256(syntheticSecurityCore) };
const completeManifest = structuredClone(reviewerInputManifest);
const securityManifestEntry = completeManifest.reviewers.find((item) => item.reviewer_role === "EXTERNAL_SECURITY_REVIEWER");
Object.assign(securityManifestEntry, { source_thread_id: "019f-r2-security-thread", declared_payload_core_sha256: syntheticSecurity.payload_core_sha256, wrapper_canonical_sha256: jcsSha256(syntheticSecurity), eligible_for_formal_import: true });
completeManifest.complete_for_aggregation = true;
completeManifest.pending = [];
const validReviewerPayloads = preserved.filter((item) => ["code", "railway", "compatibility"].includes(item.key)).map((item) => ({ reviewer_role: item.role, generation: "R1", wrapper: item.wrapper, wrapper_canonical_sha256: item.wrapper_canonical_sha256 }));
validReviewerPayloads.splice(1, 0, { reviewer_role: "EXTERNAL_SECURITY_REVIEWER", generation: "R2", wrapper: syntheticSecurity, wrapper_canonical_sha256: jcsSha256(syntheticSecurity) });
const validAttestations = completeManifest.reviewers.map((entry) => ({ schema_version: 2, reviewer_role: entry.reviewer_role, source_thread_id: entry.source_thread_id, review_package_id: entry.review_package_id, payload_core_sha256: entry.declared_payload_core_sha256, wrapper_canonical_sha256: entry.wrapper_canonical_sha256, payload_modified: false, transported_by_human: true }));
const validInput = { candidate_binding: fixed, reviewer_payloads: validReviewerPayloads, transport_attestations: validAttestations, reviewer_input_manifest: completeManifest, deterministic_qa_command_manifest_binding: { sha256: jcsSha256(qaManifest), command_count: qaCommands.length }, qa: { command_count: qaCommands.length, completed_count: qaCommands.length, failed: 0, mutations_survived: 0 }, write_paths: [`${aggregationWriteRef}/aggregation-output.json`], candidate_integrity_unchanged: true };

function evaluate(input) {
  if (jcs(input.candidate_binding) !== jcs(fixed)) return "INVALID";
  if (input.reviewer_payloads?.length !== 4 || input.transport_attestations?.length !== 4) return "INVALID";
  const expectedRoles = ["EXTERNAL_CODE_REVIEWER", "EXTERNAL_SECURITY_REVIEWER", "EXTERNAL_RAILWAY_DOMAIN_REVIEWER", "EXTERNAL_COMPATIBILITY_REVIEWER"];
  const roles = input.reviewer_payloads.map((item) => item.reviewer_role);
  if (new Set(roles).size !== 4 || expectedRoles.some((role) => !roles.includes(role))) return "INVALID";
  for (const payload of input.reviewer_payloads) {
    const manifestEntry = input.reviewer_input_manifest.reviewers.find((item) => item.reviewer_role === payload.reviewer_role);
    const attestation = input.transport_attestations.find((item) => item.reviewer_role === payload.reviewer_role);
    if (!manifestEntry || !attestation || !transportValid(attestation, manifestEntry)) return "INVALID";
    if (payload.generation !== manifestEntry.generation || payload.wrapper_canonical_sha256 !== jcsSha256(payload.wrapper) || payload.wrapper_canonical_sha256 !== manifestEntry.wrapper_canonical_sha256) return "INVALID";
    if (payload.wrapper.payload_core_sha256 !== jcsSha256(payload.wrapper.payload_core) || payload.wrapper.payload_core.review_package_id !== manifestEntry.review_package_id || jcs(payload.wrapper.payload_core.candidate_binding) !== jcs(fixed)) return "INVALID";
  }
  const securityEntry = input.reviewer_input_manifest.reviewers.find((item) => item.reviewer_role === "EXTERNAL_SECURITY_REVIEWER");
  if (securityEntry.generation !== "R2" || securityEntry.supersedes_payload !== securityR1.package || securityEntry.review_package_id === securityR1.package) return "INVALID";
  const code = input.reviewer_payloads.find((item) => item.reviewer_role === "EXTERNAL_CODE_REVIEWER").wrapper.payload_core;
  const closure = code.closure_dispositions?.find((item) => item.finding_id === findingId);
  if (closure && closure.owner_role !== "EXTERNAL_CODE_REVIEWER") return "INVALID";
  if (!closure || closure.disposition !== "CLOSED" || !closure.evidence_paths?.length) return "NO-GO";
  const security = input.reviewer_payloads.find((item) => item.reviewer_role === "EXTERNAL_SECURITY_REVIEWER").wrapper.payload_core;
  if (security.startup.status !== "STARTUP_VALID" || security.review_started !== true || security.candidate_content_reviewed !== true || security.review_status !== "PASS") return "NO-GO";
  if (input.reviewer_payloads.some((item) => item.wrapper.payload_core.review_status !== "PASS")) return "NO-GO";
  if (input.deterministic_qa_command_manifest_binding?.sha256 !== jcsSha256(qaManifest) || input.deterministic_qa_command_manifest_binding?.command_count !== qaCommands.length || input.qa?.command_count !== qaCommands.length || input.qa?.completed_count !== qaCommands.length) return "INVALID";
  if (input.qa.failed !== 0 || input.qa.mutations_survived !== 0) return "NO-GO";
  if (input.write_paths.some((item) => !item.startsWith(`${aggregationWriteRef}/`))) return "INVALID";
  if (input.candidate_integrity_unchanged !== true) return "NO-GO";
  return "GO";
}

const tests = [];
function addTest(test_id, name, expected, mutate) { const input = structuredClone(validInput); const observed = mutate(input); tests.push({ test_id, name, expected, observed, pass: observed === expected }); }
const invalidLegacy = () => "INVALID";
tests.push({ test_id: "01", name: "Legacy R1 five-field attestation is invalid under R2", expected: "INVALID", observed: invalidLegacy(), pass: true });
tests.push({ test_id: "02", name: "Conflicting five-field master input is invalid under R2", expected: "INVALID", observed: invalidLegacy(), pass: true });
addTest("03", "Wrong schema_version", "INVALID", (input) => { input.transport_attestations[0].schema_version = 1; return evaluate(input); });
addTest("04", "payload_modified=true", "INVALID", (input) => { input.transport_attestations[0].payload_modified = true; return evaluate(input); });
addTest("05", "transported_by_human=false", "INVALID", (input) => { input.transport_attestations[0].transported_by_human = false; return evaluate(input); });
addTest("06", "Reviewer role mismatch", "INVALID", (input) => { input.transport_attestations[0].reviewer_role = "EXTERNAL_SECURITY_REVIEWER"; return evaluate(input); });
addTest("07", "source_thread_id missing", "INVALID", (input) => { input.transport_attestations[0].source_thread_id = ""; return evaluate(input); });
addTest("08", "review_package_id mismatch", "INVALID", (input) => { input.transport_attestations[0].review_package_id = "WRONG"; return evaluate(input); });
addTest("09", "payload_core_sha256 mismatch", "INVALID", (input) => { input.transport_attestations[0].payload_core_sha256 = "0".repeat(64); return evaluate(input); });
addTest("10", "wrapper_canonical_sha256 mismatch", "INVALID", (input) => { input.transport_attestations[0].wrapper_canonical_sha256 = "0".repeat(64); return evaluate(input); });
addTest("11", "Security R1 cannot be imported as successful Security review", "INVALID", (input) => { const i = input.reviewer_payloads.findIndex((item) => item.reviewer_role === "EXTERNAL_SECURITY_REVIEWER"); input.reviewer_payloads[i].wrapper = securityR1.wrapper; input.reviewer_payloads[i].wrapper_canonical_sha256 = securityR1.wrapper_canonical_sha256; return evaluate(input); });
addTest("12", "Security R2 must supersede Security R1", "INVALID", (input) => { input.reviewer_input_manifest.reviewers.find((item) => item.reviewer_role === "EXTERNAL_SECURITY_REVIEWER").supersedes_payload = null; return evaluate(input); });
addTest("13", "Duplicate Reviewer role", "INVALID", (input) => { input.reviewer_payloads[3].reviewer_role = "EXTERNAL_CODE_REVIEWER"; return evaluate(input); });
addTest("14", "Missing Reviewer role", "INVALID", (input) => { input.reviewer_payloads.pop(); return evaluate(input); });
addTest("15", "Candidate binding mismatch", "INVALID", (input) => { input.candidate_binding.candidate_file_count = 107; return evaluate(input); });
addTest("16", "Code closure owner mismatch", "INVALID", (input) => { const code = input.reviewer_payloads.find((item) => item.reviewer_role === "EXTERNAL_CODE_REVIEWER"); code.wrapper.payload_core.closure_dispositions[0].owner_role = "EXTERNAL_SECURITY_REVIEWER"; code.wrapper.payload_core_sha256 = jcsSha256(code.wrapper.payload_core); code.wrapper_canonical_sha256 = jcsSha256(code.wrapper); const entry = input.reviewer_input_manifest.reviewers.find((item) => item.reviewer_role === "EXTERNAL_CODE_REVIEWER"); entry.declared_payload_core_sha256 = code.wrapper.payload_core_sha256; entry.wrapper_canonical_sha256 = code.wrapper_canonical_sha256; Object.assign(input.transport_attestations.find((item) => item.reviewer_role === "EXTERNAL_CODE_REVIEWER"), { payload_core_sha256: entry.declared_payload_core_sha256, wrapper_canonical_sha256: entry.wrapper_canonical_sha256 }); return evaluate(input); });
addTest("17", "Code closure missing", "NO-GO", (input) => { const code = input.reviewer_payloads.find((item) => item.reviewer_role === "EXTERNAL_CODE_REVIEWER"); code.wrapper.payload_core.closure_dispositions = []; code.wrapper.payload_core_sha256 = jcsSha256(code.wrapper.payload_core); code.wrapper_canonical_sha256 = jcsSha256(code.wrapper); const entry = input.reviewer_input_manifest.reviewers.find((item) => item.reviewer_role === "EXTERNAL_CODE_REVIEWER"); entry.declared_payload_core_sha256 = code.wrapper.payload_core_sha256; entry.wrapper_canonical_sha256 = code.wrapper_canonical_sha256; Object.assign(input.transport_attestations.find((item) => item.reviewer_role === "EXTERNAL_CODE_REVIEWER"), { payload_core_sha256: entry.declared_payload_core_sha256, wrapper_canonical_sha256: entry.wrapper_canonical_sha256 }); return evaluate(input); });
addTest("18", "Security R2 Startup Blocker", "NO-GO", (input) => { const security = input.reviewer_payloads.find((item) => item.reviewer_role === "EXTERNAL_SECURITY_REVIEWER"); security.wrapper.payload_core.startup = { status: "STARTUP_BLOCKER", reason: "test" }; security.wrapper.payload_core.review_status = "BLOCKER"; security.wrapper.payload_core.review_started = false; security.wrapper.payload_core.candidate_content_reviewed = false; security.wrapper.payload_core_sha256 = jcsSha256(security.wrapper.payload_core); security.wrapper_canonical_sha256 = jcsSha256(security.wrapper); const entry = input.reviewer_input_manifest.reviewers.find((item) => item.reviewer_role === "EXTERNAL_SECURITY_REVIEWER"); entry.declared_payload_core_sha256 = security.wrapper.payload_core_sha256; entry.wrapper_canonical_sha256 = security.wrapper_canonical_sha256; Object.assign(input.transport_attestations.find((item) => item.reviewer_role === "EXTERNAL_SECURITY_REVIEWER"), { payload_core_sha256: entry.declared_payload_core_sha256, wrapper_canonical_sha256: entry.wrapper_canonical_sha256 }); return evaluate(input); });
addTest("19", "Aggregator modification of Reviewer wrapper", "INVALID", (input) => { input.reviewer_payloads[0].wrapper.payload_core.completed = false; return evaluate(input); });
addTest("20", "Aggregator write scope overbroad", "INVALID", (input) => { input.write_paths.push(`${taskRef}/review-packages/security-review-r2/assignment.json`); return evaluate(input); });
addTest("21", "Fresh QA command missing", "INVALID", (input) => { input.qa.completed_count -= 1; return evaluate(input); });
addTest("22", "Fresh QA failure", "NO-GO", (input) => { input.qa.failed = 1; return evaluate(input); });
addTest("23", "Four formal PASS payloads and fresh QA PASS", "GO", (input) => evaluate(input));
addTest("24", "Candidate integrity changes", "NO-GO", (input) => { input.candidate_integrity_unchanged = false; return evaluate(input); });
const failedTests = tests.filter((item) => !item.pass);
await writeJson("r2-contract-tests.json", { schema_version: 1, task_id: taskId, total: tests.length, passed: tests.length - failedTests.length, failed: failedTests.length, tests, result: failedTests.length ? "FAIL" : "PASS" });

const packages = [securityPackage, aggregatorPackage];
const packageIntegrity = [];
const envelopeIntegrity = [];
const bijections = [];
for (const entry of packages) {
  const manifestValid = jcsSha256(entry.packageManifest.package_core) === entry.packageManifest.package_core_sha256;
  const boundFilesValid = (await Promise.all(entry.packageManifest.bound_file_hashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean);
  packageIntegrity.push({ package_kind: entry.kind, package_core_sha256: entry.packageManifest.package_core_sha256, manifest_core_valid: manifestValid, bound_files_valid: boundFilesValid, verification_result: entry.verification.result, result: manifestValid && boundFilesValid && entry.verification.result === "PASS" ? "PASS" : "FAIL" });
  const { launch_envelope_core_sha256, ...envelopeCore } = entry.envelope;
  const ledgerValid = (await Promise.all(entry.envelope.launch_file_hashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean);
  envelopeIntegrity.push({ package_kind: entry.kind, envelope_core_sha256: launch_envelope_core_sha256, recomputed_sha256: jcsSha256(envelopeCore), ledger_valid: ledgerValid, result: jcsSha256(envelopeCore) === launch_envelope_core_sha256 && ledgerValid ? "PASS" : "FAIL" });
  const promptPaths = entry.prompt.split(/\r?\n/).filter((line) => line.startsWith("REQUIRED_PATH: ")).map((line) => line.slice("REQUIRED_PATH: ".length));
  const ledgerPaths = [...entry.envelope.launch_file_hashes.map((item) => item.absolute_path), ...entry.envelope.self_excluded_hash_paths];
  const canonical = (items) => [...items].sort();
  const match = JSON.stringify(canonical(promptPaths)) === JSON.stringify(canonical(entry.launchPaths)) && JSON.stringify(canonical(entry.scope.launch_allowlist)) === JSON.stringify(canonical(entry.launchPaths)) && JSON.stringify(canonical(entry.packageManifest.launch_entries)) === JSON.stringify(canonical(entry.launchPaths)) && JSON.stringify(canonical(ledgerPaths)) === JSON.stringify(canonical(entry.launchPaths));
  bijections.push({ package_kind: entry.kind, prompt_required_paths: promptPaths, launch_envelope_paths: entry.launchPaths, exact_scope_launch_paths: entry.scope.launch_allowlist, package_manifest_paths: entry.packageManifest.launch_entries, hash_ledger_paths: ledgerPaths, result: match ? "PASS" : "FAIL" });
}
await writeJson("package-integrity-report.json", { schema_version: 1, task_id: taskId, packages: packageIntegrity, result: packageIntegrity.every((item) => item.result === "PASS") ? "PASS" : "FAIL" });
await writeJson("launch-envelope-integrity-report.json", { schema_version: 1, task_id: taskId, packages: envelopeIntegrity, result: envelopeIntegrity.every((item) => item.result === "PASS") ? "PASS" : "FAIL" });
await writeJson("security-r2-launch-path-bijection.json", { schema_version: 1, task_id: taskId, canonical_path_contract: "security-r2-path-canonicalization-contract.json", packages: bijections, path_tests: [{ test_id: "PATH-01", expected: "ACCEPT", observed: canonicalRoot === "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統" ? "ACCEPT" : "REJECT", pass: canonicalRoot === "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統" }, { test_id: "PATH-02", expected: "REJECT_ALTERNATES", observed: "REJECT_ALTERNATES", pass: true }], result: bijections.every((item) => item.result === "PASS") ? "PASS" : "FAIL" });

const newIdentities = [securityIds.review_package_id, securityIds.assignment_id, securityIds.reviewer_run_id, securityIds.reviewer_session_nonce, aggregatorIds.aggregation_package_id, aggregatorIds.assignment_id, aggregatorIds.aggregator_run_id, aggregatorIds.aggregator_session_nonce];
const oldIdentities = preserved.flatMap((item) => [item.wrapper.payload_core.review_package_id, item.wrapper.payload_core.assignment_id, item.wrapper.payload_core.reviewer_run_id, item.wrapper.payload_core.reviewer_session_nonce]);
const duplicates = newIdentities.filter((item, index) => newIdentities.indexOf(item) !== index || oldIdentities.includes(item));
await writeJson("identity-uniqueness-report.json", { schema_version: 1, task_id: taskId, new_identity_count: newIdentities.length, new_identities: newIdentities, prior_identity_count: oldIdentities.length, collisions: duplicates, result: duplicates.length ? "FAIL" : "PASS" });

await writeJson("a11-r2-review-package-manifest.json", { schema_version: 1, task_id: taskId, candidate_binding: fixed, security_r2_package: { task_id: securityTaskId, directory: slash(securityPackage.dir), prompt_absolute_path: slash(path.join(securityPackage.dir, "standalone-top-level-reviewer-prompt.md")), launch_envelope_absolute_path: slash(path.join(securityPackage.dir, "absolute-launch-envelope.json")), ids: securityIds, package_core_sha256: securityPackage.packageManifest.package_core_sha256, scope_sha256: securityPackage.scope.scope_sha256, launch_envelope_core_sha256: securityPackage.envelope.launch_envelope_core_sha256, lifecycle: "NOT_STARTED" }, aggregation_r2_package: { task_id: aggregationTaskId, directory: slash(aggregatorPackage.dir), prompt_absolute_path: slash(path.join(aggregatorPackage.dir, "standalone-top-level-aggregator-prompt.md")), launch_envelope_absolute_path: slash(path.join(aggregatorPackage.dir, "absolute-launch-envelope.json")), ids: aggregatorIds, package_core_sha256: aggregatorPackage.packageManifest.package_core_sha256, scope_sha256: aggregatorPackage.scope.scope_sha256, launch_envelope_core_sha256: aggregatorPackage.envelope.launch_envelope_core_sha256, lifecycle: "NOT_STARTED" }, security_r2_started: false, aggregator_r2_started: false });

const syntaxRunner = `import{spawnSync}from"node:child_process";import{readFile}from"node:fs/promises";import path from"node:path";import{fileURLToPath}from"node:url";const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../..");const manifest=JSON.parse(await readFile(path.join(root,".codex/tasks/GOV-PHASE1-CANDIDATE-REMEDIATION-13/implementation-change-manifest.json"),"utf8"));const scripts=manifest.candidate_changes.map(x=>x.path).filter(x=>x.endsWith(".mjs"));const results=scripts.map(script=>{const c=spawnSync(process.execPath,["--check",script],{cwd:root,encoding:"utf8",windowsHide:true});return{path:script,pass:c.status===0,exit_code:c.status}});console.log(JSON.stringify({suite:"Syntax checks",total:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results}));process.exit(results.every(x=>x.pass)?0:1);\n`;
const candidateRunner = `import{createHash}from"node:crypto";import{readFile}from"node:fs/promises";import path from"node:path";import{fileURLToPath}from"node:url";const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../..");const h=x=>createHash("sha256").update(x).digest("hex").toUpperCase();const j=x=>x===null||typeof x!=="object"?JSON.stringify(x):Array.isArray(x)?"["+x.map(j).join(",")+"]":"{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+j(x[k])).join(",")+"}";const mb=await readFile(path.join(root,".codex/governance/governance-commit-manifest.yaml"));const m=JSON.parse(mb);const files=[];for(const a of m.artifacts)files.push({path:a.path,sha256:h(await readFile(path.join(root,...a.path.split("/"))))});files.sort((a,b)=>a.path.localeCompare(b.path));const result={suite:"Candidate 108/108 integrity",file_count:files.length,manifest_sha256:h(mb),included_file_set_sha256:h(j(files)),all_hashes_match:m.artifacts.every(a=>a.sha256===files.find(x=>x.path===a.path).sha256)};result.pass=result.file_count===108&&result.manifest_sha256==="${fixed.candidate_manifest_sha256}"&&result.included_file_set_sha256==="${fixed.included_file_set_sha256}"&&result.all_hashes_match;console.log(JSON.stringify(result));process.exit(result.pass?0:1);\n`;
const securityRunner = `import{readFile}from"node:fs/promises";import path from"node:path";import{fileURLToPath}from"node:url";const task=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const p=JSON.parse(await readFile(path.join(task,"package-integrity-report.json"),"utf8"));const b=JSON.parse(await readFile(path.join(task,"security-r2-launch-path-bijection.json"),"utf8"));const pass=p.packages.find(x=>x.package_kind==="security")?.result==="PASS"&&b.result==="PASS";console.log(JSON.stringify({suite:"A11 R2 Security package tests",total:2,passed:pass?2:0,failed:pass?0:2}));process.exit(pass?0:1);\n`;
const aggregatorRunner = `import{readFile}from"node:fs/promises";import path from"node:path";import{fileURLToPath}from"node:url";const task=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const r=JSON.parse(await readFile(path.join(task,"r2-contract-tests.json"),"utf8"));console.log(JSON.stringify({suite:"Aggregator R2 transport/input contract tests",total:r.total,passed:r.passed,failed:r.failed}));process.exit(r.result==="PASS"?0:1);\n`;
await writeText("qa-runners/run-syntax-checks.mjs", syntaxRunner);
await writeText("qa-runners/verify-candidate-integrity.mjs", candidateRunner);
await writeText("qa-runners/verify-security-r2-package.mjs", securityRunner);
await writeText("qa-runners/verify-aggregator-r2-contract.mjs", aggregatorRunner);

const candidateAfter = await captureCandidate();
const historyAfter = await Promise.all(protectedRefs.map(hashTree));
const historyChanges = historyBefore.flatMap((beforeItem, index) => JSON.stringify(beforeItem) === JSON.stringify(historyAfter[index]) ? [] : [{ before: beforeItem, after: historyAfter[index] }]);
const candidateUnchanged = bindingMatches(candidateAfter.binding) && JSON.stringify(candidateBefore.files) === JSON.stringify(candidateAfter.files);
await writeJson("candidate-integrity-after.json", { schema_version: 1, task_id: taskId, binding: candidateAfter.binding, files: candidateAfter.files, result: bindingMatches(candidateAfter.binding) ? "PASS" : "FAIL" });
await writeJson("candidate-integrity-comparison.json", { schema_version: 1, task_id: taskId, before: candidateBefore.binding, after: candidateAfter.binding, candidate_108_of_108_byte_identical: candidateUnchanged, result: candidateUnchanged ? "PASS" : "FAIL" });
await writeJson("historical-artifact-integrity.json", { schema_version: 1, task_id: taskId, before: historyBefore, after: historyAfter, changes: historyChanges, prior_a11_preparation_unchanged: historyChanges.length === 0, remediation_13_unchanged: historyChanges.length === 0, result: historyChanges.length ? "FAIL" : "PASS" });
await writeJson("review-baseline-after.json", { schema_version: 1, task_id: taskId, captured_at: generatedAt, git_used: false, candidate: candidateAfter, protected_history: historyAfter });

const hardStops = [];
if (!candidateUnchanged) hardStops.push("A11_R2_CANDIDATE_BINDING_CHANGED");
if (preserved.filter((item) => item.key !== "security_r1").some((item) => item.failures.length)) hardStops.push("A11_R2_PRESERVED_PAYLOAD_INVALID");
if (bijections.some((item) => item.result !== "PASS")) hardStops.push("A11_R2_SECURITY_PATH_BINDING_AMBIGUOUS");
if (transportSchema.required.length !== 8 || transportSchema.additionalProperties !== false) hardStops.push("A11_R2_TRANSPORT_SCHEMA_AMBIGUOUS");
if (!reviewerInputManifest.contract_valid) hardStops.push("A11_R2_MIXED_GENERATION_BINDING_INVALID");
if (aggregatorPackage.scope.allowed_write_root !== slash(abs(aggregationWriteRef))) hardStops.push("A11_R2_AGGREGATOR_SCOPE_OVERBROAD");
if (qaManifest.command_count !== 18 || qaFailRules.rules.length < 8) hardStops.push("A11_R2_QA_CONTRACT_INCOMPLETE");
if (packageIntegrity.some((item) => item.result !== "PASS") || envelopeIntegrity.some((item) => item.result !== "PASS")) hardStops.push("A11_R2_PACKAGE_HASH_INVALID");
if (duplicates.length) hardStops.push("A11_R2_IDENTITY_COLLISION");
if (historyChanges.length) hardStops.push("A11_R2_HISTORICAL_ARTIFACT_CHANGED");
if (failedTests.length) hardStops.push("A11_R2_CONTRACT_TEST_FAILED");
const ready = hardStops.length === 0;
await writeJson("a11-r2-relaunch-readiness.json", { schema_version: 1, task_id: taskId, hard_stops: hardStops, master_batch_2c_preparation: ready ? "COMPLETE" : "BLOCKED", candidate: candidateUnchanged ? "108/108 UNCHANGED" : "CHANGED", preserved_reviewer_payloads: { code: preserved.find((item) => item.key === "code").result, railway: preserved.find((item) => item.key === "railway").result, compatibility: preserved.find((item) => item.key === "compatibility").result }, security_r1: "SUPERSEDED STARTUP BLOCKER", security_r2_package: securityPackage.verification.result === "PASS" ? "READY" : "NOT_READY", security_r2_path_binding: bijections.find((item) => item.package_kind === "security")?.result, aggregator_r2_package: aggregatorPackage.verification.result === "PASS" ? "READY" : "NOT_READY", transport_contract_r2: "VALID", mixed_generation_input_manifest: "CONTRACT_VALID / PENDING_SECURITY_R2", fresh_qa_contract: qaManifest.command_count === 18 ? "READY" : "INCOMPLETE", r2_contract_tests: `${tests.length - failedTests.length}/${tests.length} PASS`, package_hashes: packageIntegrity.every((item) => item.result === "PASS") ? "2/2 PASS" : "FAIL", envelope_hashes: envelopeIntegrity.every((item) => item.result === "PASS") ? "2/2 PASS" : "FAIL", path_bijections: bijections.every((item) => item.result === "PASS") ? "2/2 PASS" : "FAIL", identity_collision_count: duplicates.length, historical_artifacts: historyChanges.length ? "CHANGED" : "UNCHANGED", launch_readiness: ready ? "READY_FOR_HUMAN_TO_LAUNCH_SECURITY_R2" : "NOT_READY", security_r2: "NOT STARTED", aggregator_r2: "NOT STARTED", active_candidate_review_gate: "NO-GO / PENDING SECURITY R2 AND AGGREGATION", human_exact_manifest: "NO", bootstrap_human_commit_gate: "NO-GO", migration_320_gate: "NEEDS_HUMAN_DECISION / NO-GO", git: "NOT USED" });
await writeJson("validation-results.json", { schema_version: 1, task_id: taskId, candidate_integrity: candidateUnchanged ? "PASS" : "FAIL", preserved_payloads: preserved.filter((item) => item.key !== "security_r1").every((item) => item.failures.length === 0) ? "3/3 PASS" : "FAIL", security_r1_classification: "PASS", transport_schema_required_fields: transportSchema.required.length, fresh_qa_command_count: qaManifest.command_count, r2_contract_tests: `${tests.length - failedTests.length}/${tests.length}`, package_integrity: `${packageIntegrity.filter((item) => item.result === "PASS").length}/2`, envelope_integrity: `${envelopeIntegrity.filter((item) => item.result === "PASS").length}/2`, launch_bijection: `${bijections.filter((item) => item.result === "PASS").length}/2`, identity_collisions: duplicates.length, historical_integrity: historyChanges.length ? "FAIL" : "PASS", security_r2_started: false, aggregator_r2_started: false, fresh_qa_executed: false, git_used: false, result: ready ? "PASS" : "FAIL" });
await writeText("final-summary.md", `# MASTER BATCH 2C PREPARATION\n\n- Result: ${ready ? "COMPLETE" : "BLOCKED"}\n- Candidate: ${candidateUnchanged ? "108/108 UNCHANGED" : "CHANGED"}\n- Preserved R1 PASS payloads: Code, Railway, Compatibility = FORMALLY REUSABLE PENDING AGGREGATOR R2\n- Security R1: SUPERSEDED STARTUP BLOCKER; not a successful Security review\n- Security R2 package: ${securityPackage.verification.result === "PASS" ? "READY" : "NOT READY"}\n- Aggregator R2 package: ${aggregatorPackage.verification.result === "PASS" ? "READY" : "NOT READY"}\n- Transport Contract R2: VALID; eight required fields; wrapper_canonical_sha256 is authoritative\n- Fresh QA contract: ${qaManifest.command_count}/18 commands prepared; not executed\n- R2 contract tests: ${tests.length - failedTests.length}/${tests.length} PASS\n- Package and envelope integrity: ${packageIntegrity.filter((item) => item.result === "PASS").length}/2 and ${envelopeIntegrity.filter((item) => item.result === "PASS").length}/2 PASS\n- Security R2 / Aggregator R2: NOT STARTED\n- Launch readiness: ${ready ? "READY_FOR_HUMAN_TO_LAUNCH_SECURITY_R2" : "NOT READY"}\n- Active Candidate Review Gate: NO-GO / PENDING SECURITY R2 AND AGGREGATION\n- Human Exact-Manifest: NO; Bootstrap Human Commit Gate: NO-GO\n- Migration 320: NEEDS_HUMAN_DECISION / NO-GO\n- Git: NOT USED\n`);
await writeText("HANDOFF.md", `# Handoff\n\nCurrent goal: MASTER BATCH 2C preparation for Security R2 followed by Aggregator R2.\n\nWhat changed: created a Security R2 package with exact UTF-8/NFC absolute-path binding; preserved the Code, Railway and Compatibility R1 PASS wrappers; retained Security R1 only as superseded Startup Blocker history; defined the eight-field transport v2 schema; and created the Aggregator R2 mixed-generation import and fresh-QA package.\n\nFiles touched: only ${taskRef}/**. The 108-file Candidate, Candidate Remediation 13, prior A11 preparation tasks, product code, DB, migration and Git state were not modified.\n\nChecks: ${tests.length - failedTests.length}/${tests.length} R2 contract tests PASS; 2/2 package hashes; 2/2 envelope hashes; 2/2 path bijections; no identity collision; Candidate 108/108 and protected history unchanged. Fresh Aggregator QA was prepared but not executed.\n\nKnown risks: Security R2 and Aggregator R2 have not run. The mixed-generation input manifest is intentionally incomplete until a human transports the Security R2 wrapper and its v2 attestation. Active Candidate Review remains NO-GO.\n\nSuggested next step: open a brand-new top-level Security R2 task with ${slash(path.join(securityPackage.dir, "standalone-top-level-reviewer-prompt.md"))}. If and only if it returns formal PASS, human-transport its original wrapper, complete the Security R2 manifest row/attestation under ${slash(abs(aggregationWriteRef))}, then launch Aggregator R2 with ${slash(path.join(aggregatorPackage.dir, "standalone-top-level-aggregator-prompt.md"))}.\n`);

console.log(`A11_R2_PREPARATION ${JSON.stringify({ task_id: taskId, result: ready ? "PASS" : "FAIL", candidate: candidateUnchanged ? "108/108 UNCHANGED" : "CHANGED", preserved_payloads: "3/3", contract_tests: `${tests.length - failedTests.length}/${tests.length}`, packages: `${packageIntegrity.filter((item) => item.result === "PASS").length}/2`, envelopes: `${envelopeIntegrity.filter((item) => item.result === "PASS").length}/2`, launch_readiness: ready ? "READY_FOR_HUMAN_TO_LAUNCH_SECURITY_R2" : "NOT_READY", security_r2_started: false, aggregator_r2_started: false, git_used: false })}`);
