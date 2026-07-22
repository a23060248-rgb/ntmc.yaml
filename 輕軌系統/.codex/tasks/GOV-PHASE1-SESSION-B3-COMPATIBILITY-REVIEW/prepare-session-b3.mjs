import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";
import { loadAndCompileGovernanceSchemas } from "../../scripts/lib/governance/governance-schema-loader.mjs";

const taskId = "GOV-PHASE1-SESSION-B3-COMPATIBILITY-REVIEW";
const r11Id = "GOV-PHASE1-REMEDIATION-11";
const taskRel = `.codex/tasks/${taskId}`;
const r11PackageRel = `.codex/tasks/${r11Id}/session-b3-pre-review-package`;
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const expected = {
  candidateCount: 103,
  manifestSha: "29F4F947DEF79A633F63E28FA2444F4734D7E6BB9612B96154A302464255531D",
  fileSetSha: "739DAC633946266BCD28A71BE236D3748C57550AB1749A29C4F5E59421F993CB",
  schemaSetSha: "F3101FFD0B7ABB22D26F65B2DB8522F60C2D0A8C45513DAAEF87725F81CF15E9",
  railwaySchemaSha: "D11200E500D7C87AB0E9762BF81FCB2D32315E770D8A16CA81F87B6C439FE66D",
  railwayProfileSha: "E79CD3EE7667CB41267FDBAAED7AAE679F0EEC0D4B2B917962B4EFE98BE99A6D",
  scannerContractSha: "6A0EF0CAEE9088D65616DA318DB895321DF4D932C7308E2522D35F8242F4816C",
  r11PackageManifestSha: "C9ECAD01F48B26455192A0C3EFE8B1C4439925199F154C22F89F517849DA6198"
};
const forbiddenPrefixes = [".env", "collab/", "frontend/", "erp-api/", "db-design/", "migration/"];
const forbiddenExact = [
  ".codex/tasks/GOV-M320-DRYRUN/implementation-handoff.yaml",
  ".codex/tasks/GOV-M320-DRYRUN/implementation-plan.md",
  `${taskRel}/human-approval.yaml`
];

const readBytes = async (ref) => readFile(await safeExistingPath(root, ref));
const readJson = async (ref) => JSON.parse((await readBytes(ref)).toString("utf8"));
const outputInfo = new Map();
async function writeJson(name, value) {
  const target = path.join(dir, ...name.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await writeFile(target, body, { flag: "wx" });
  const ref = `${taskRel}/${name}`;
  const info = { path: ref, sha256: sha256(body), byte_size: body.length };
  outputInfo.set(name, info);
  return info;
}
const directInfo = async (ref) => {
  const body = await readBytes(ref);
  return { path: ref, sha256: sha256(body), byte_size: body.length };
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

await mkdir(dir, { recursive: true });

// Verify the exact R11 source package before materialization.
const sourceManifestRef = `${r11PackageRel}/pre-review-input-manifest.json`;
const sourceManifestBytes = await readBytes(sourceManifestRef);
assert(sha256(sourceManifestBytes) === expected.r11PackageManifestSha, "R11_PACKAGE_MANIFEST_HASH_MISMATCH");
const sourceManifest = JSON.parse(sourceManifestBytes);
assert(sourceManifest.file_count === 15 && sourceManifest.files.length === 15, "R11_PACKAGE_COUNT_MISMATCH");
const sourceChecks = [];
for (const item of sourceManifest.files) {
  const current = await directInfo(item.path);
  const result = current.sha256 === item.sha256 && current.byte_size === item.byte_size ? "PASS" : "FAIL";
  sourceChecks.push({ ...item, actual_sha256: current.sha256, actual_byte_size: current.byte_size, result });
}
assert(sourceChecks.every((item) => item.result === "PASS"), "R11_PACKAGE_INPUT_MISMATCH");

// Recompute the unchanged candidate from the official manifest.
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readBytes(manifestRef);
assert(sha256(manifestBytes) === expected.manifestSha, "INVALID_BASELINE_MANIFEST_HASH");
const manifest = JSON.parse(manifestBytes);
const included = manifest.artifacts.filter((item) => item.commit_inclusion === true);
assert(included.length === expected.candidateCount, "INVALID_BASELINE_FILE_COUNT");
const candidateFiles = [];
for (const item of included) {
  assert(!forbiddenPrefixes.some((prefix) => item.path.toLowerCase().startsWith(prefix)), `FORBIDDEN_CANDIDATE_PATH:${item.path}`);
  const current = await directInfo(item.path);
  assert(current.sha256 === item.sha256.toUpperCase(), `INVALID_BASELINE_FILE_HASH:${item.path}`);
  candidateFiles.push(current);
}
candidateFiles.sort((a, b) => a.path.localeCompare(b.path));
assert(canonicalSha256(candidateFiles.map(({ path: p, sha256: h }) => ({ path: p, sha256: h }))) === expected.fileSetSha, "INVALID_BASELINE_FILE_SET");

// Recompute the official schema set and the exact security chain.
const schemaSet = await loadAndCompileGovernanceSchemas(root);
assert(schemaSet.schema_set_sha256 === expected.schemaSetSha, "SCHEMA_SET_HASH_MISMATCH");
const securityEvidenceSource = await readJson(`${r11PackageRel}/session-b3-security-evidence.yaml`);
const securityIssues = schemaSet.validate(
  ".codex/blueprints/schemas/security-evidence.schema.json",
  securityEvidenceSource,
  `${taskRel}/session-b3-security-evidence.yaml`
);
assert(securityIssues.length === 0, `SECURITY_EVIDENCE_SCHEMA_FAILURE:${securityIssues.join("|")}`);
const railwaySchema = await directInfo(".codex/blueprints/schemas/railway-domain-review.schema.json");
assert(railwaySchema.sha256 === expected.railwaySchemaSha, "RAILWAY_SCHEMA_HASH_MISMATCH");
const railwayProfile = await directInfo(".codex/agents/railway-domain-reviewer.toml");
assert(railwayProfile.sha256 === expected.railwayProfileSha, "RAILWAY_PROFILE_HASH_MISMATCH");

const binding = await readJson(`${r11PackageRel}/session-b3-security-binding-chain.json`);
const nodeChecks = [];
for (const [node, entry] of Object.entries(binding.required_nodes)) {
  const current = await directInfo(entry.path);
  const result = current.sha256 === entry.sha256 && current.byte_size === entry.byte_size ? "PASS" : "FAIL";
  nodeChecks.push({ node, expected_path: entry.path, expected_sha256: entry.sha256, actual_sha256: current.sha256, result });
}
assert(nodeChecks.every((item) => item.result === "PASS"), "SECURITY_REQUIRED_NODE_MISMATCH");
assert(binding.scanner_contract.id === "GOV-DETERMINISTIC-SCAN", "SCANNER_CONTRACT_ID_MISMATCH");
assert(binding.scanner_contract.version === 5, "SCANNER_CONTRACT_VERSION_MISMATCH");
assert(binding.scanner_contract.sha256 === expected.scannerContractSha, "SCANNER_CONTRACT_HASH_MISMATCH");

const securityScope = await readJson(`${r11PackageRel}/session-b3-security-read-scope.json`);
assert(securityScope.allowed_files.length === 124, "R11_SECURITY_ALLOWLIST_COUNT_MISMATCH");
assert(!securityScope.allowed_files.some((item) => forbiddenExact.includes(item.path)), "FORBIDDEN_PATH_IN_SECURITY_ALLOWLIST");
assert(securityScope.directory_globs_allowed === false, "SECURITY_SCOPE_GLOB_ENABLED");

const assignments = await readJson(`${r11PackageRel}/reviewer-assignments.json`);
assert(assignments.assignment_count === 5, "ASSIGNMENT_COUNT_MISMATCH");
assert(new Set(assignments.assignments.map((item) => item.assignment_id)).size === 5, "DUPLICATE_ASSIGNMENT");
assert(assignments.assignments.every((item) => item.execution_mode === "read-only" && item.implementation_participation === false && item.allowed_write_paths.length === 0), "ASSIGNMENT_NOT_READ_ONLY");

const reviewRunIdentities = {
  schema_version: 1,
  task_id: taskId,
  identities: [
    { reviewer_role: "code-reviewer", reviewer_run_id: "B3-CODE-RUN-61D36D0F-3B37-48FD-926A-7360AC1CFB28", session_id: "B3-CODE-SESSION-98C4D5B6-267C-43B6-87E8-0E2D10B7A29F" },
    { reviewer_role: "security-reviewer", reviewer_run_id: "B3-SEC-RUN-3840528B-99A9-4E84-B66E-A635DBF90A2A", session_id: "B3-SEC-SESSION-18B23BF0-E20D-4FAB-A4A7-8F9882B1BFC9" },
    { reviewer_role: "railway-domain-reviewer", reviewer_run_id: "B3-DOMAIN-RUN-9981823A-09EC-4FE9-A6CC-54097C47A50F", session_id: "B3-DOMAIN-SESSION-F9E2A26B-25A3-4736-9961-F671A3D8A105" },
    { reviewer_role: "compatibility-reviewer", reviewer_run_id: "B3-COMPAT-RUN-8354751F-4D3F-4A71-A919-8FC84FB72ABF", session_id: "B3-COMPAT-SESSION-6CE28DD6-F236-4112-AAD2-D9C3C753DB1C" },
    { reviewer_role: "qa-engineer", reviewer_run_id: "B3-QA-RUN-5BD66CD2-5449-4EB5-B7C5-3A0DD1523FA7", session_id: "B3-QA-SESSION-6E6BE9FA-648D-4EEB-9CE6-E47E499F41AA" }
  ]
};
assert(new Set(reviewRunIdentities.identities.flatMap((item) => [item.reviewer_run_id, item.session_id])).size === 10, "DUPLICATE_RUN_OR_SESSION");

const explicitReadRoots = [
  "AGENTS.md",
  ".agents/skills/task-classification/**",
  ".codex/agents/**",
  ".codex/blueprints/schemas/**",
  ".codex/governance/**",
  ".codex/scripts/**",
  ".codex/tests/**",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/**",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/**",
  ".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW/**",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-10/**",
  ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/**",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11/**",
  ".codex/tasks/GOV-M320-DRYRUN/**",
  "docs/migration-320-*",
  "docs/cross-module-closure-report.md",
  "docs/go-no-go-report.md",
  `${taskRel}/**`
];
const taskIntent = {
  schema_version: 1,
  status: "IN_PROGRESS",
  task_id: taskId,
  title: "Session B3 Final Compatibility Review with Sequenced Reviewer Dispatch",
  task_type: "review",
  objective: "Perform five fresh, independent and read-only formal reviews of the unchanged Phase 1.9 bootstrap candidate and decide the four Session B2 finding dispositions.",
  business_reason: "Session B2 was blocked by task-local review-scope, evidence-schema and reviewer-capacity defects; R11 prepared corrected inputs without changing the candidate.",
  scope: {
    include: [`${taskRel}/**`, "Exact 103-file candidate and explicitly frozen governance evidence, read-only"],
    exclude: ["candidate mutation", "historical outcome mutation", "Git mutation", "product/service/database/seed/migration execution", "Human Exact-Manifest confirmation", "steady-state enablement", "Migration 320 approval"],
    product_changes_allowed: false,
    database_operations_allowed: false,
    git_mutation_allowed: false
  },
  acceptance_criteria: [
    "Five fresh formal Reviewer outcomes are captured with exact access logs and procedural clean-context attestations.",
    "The four B2 findings are closed only by their designated Reviewer owners.",
    "The exact candidate and all protected history remain unchanged.",
    "All required deterministic governance reruns pass.",
    "Human approval remains pending and all Git, steady-state and Migration 320 gates remain closed."
  ],
  requested_by: "human-governance-owner",
  authorization: "Session B3 explicitly authorized to start; no downstream approval or Git action authorized."
};
const classification = {
  schema_version: 1,
  task_id: taskId,
  level: "L3",
  reasons: ["Final backward-compatibility review with unresolved historical Reviewer blockers.", "Formal Security, Railway Domain and candidate gate evidence must remain fail-closed."],
  triggers: ["unresolved Reviewer blocker", "backward compatibility", "release gate", "formal security evidence", "railway domain authority boundary"],
  execution_categories: ["read-only-review", "governance-validation", "security", "domain-rule", "backward-compatibility"],
  required_agents: ["architect", "code-reviewer", "security-reviewer", "railway-domain-reviewer", "compatibility-reviewer", "qa-engineer"],
  required_reviews: ["code", "security", "railway-domain", "compatibility", "qa-readback"],
  parallel_allowed: true,
  evidence_required: ["B3-CANDIDATE-BASELINE", "B3-R11-PACKAGE", "B3-SECURITY-SCHEMA", "B3-EXACT-SCOPES", "B3-WAVE1-FREEZE", "B3-COMPATIBILITY", "B3-QA-READBACK", "B3-FRESH-RERUN", "B3-AFTER-BASELINE", "B3-GATES"],
  human_approval: { required: true, stages: ["scope_approval", "execution_approval", "review_completion", "final_commit_approval"] },
  stop_conditions: ["Candidate hash or count changes.", "A protected frozen artifact changes.", "QA reviewer capacity cannot be reserved.", "Any Reviewer reports a forbidden read.", "Any pre-review input changes after freeze.", "Any Git, product, service, database, seed or migration operation is attempted."],
  scope: { include: explicitReadRoots, exclude: [".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "parent directories", "sibling directories", "unapproved HANDOFF", "unapproved implementation plan", "implementation conversation", "conversation memory"] },
  classified_by: "root-orchestrator-using-task-classification-skill",
  classification_status: "human-approved-scope"
};

const sourceBlueprint = await readJson(`${r11PackageRel}/blueprint.yaml`);
const reviewAssignments = sourceBlueprint.review_assignments.map((item) => {
  const scopeName = item.required_role_id === "qa-engineer" ? "qa-reviewer-scope-final.json"
    : item.required_role_id === "compatibility-reviewer" ? "compatibility-reviewer-scope-final.json"
    : `reviewer-scopes/${item.required_role_id}-scope.json`;
  return { ...item, allowed_read_paths: [`${taskRel}/${scopeName}`] };
});
const blueprint = {
  schema_version: 1,
  blueprint_id: `BP-${taskId}`,
  task_id: taskId,
  risk: { level: "L3", reasons: classification.reasons },
  scope: { include: classification.scope.include, exclude: classification.scope.exclude, product_changes_allowed: false, database_operations_allowed: false },
  allowed_paths: { read: explicitReadRoots, write: [`${taskRel}/**`] },
  agent_assignments: [{ role: "architect", allowed_read_paths: explicitReadRoots, allowed_write_paths: [`${taskRel}/**`] }],
  review_assignments: reviewAssignments,
  applicable_rules: ["GOV-SCOPE-001", "REV-INDEP-001", "REV-L3-001", "EVD-HASH-001", "EVD-CLAIM-001"],
  candidate_rules: [],
  required_agents: classification.required_agents,
  execution: {
    parallel_groups: [["code-reviewer", "security-reviewer", "railway-domain-reviewer"]],
    sequential_steps: ["Freeze exact pre-review inputs.", "Run Wave 1 and freeze outputs.", "Run Compatibility Reviewer and freeze output.", "Run fresh QA readback.", "Recompute gates and stop."]
  },
  evidence_required: classification.evidence_required,
  rollback_restore: { required: false, evidence_or_reason: "Not applicable: this task writes additive review artifacts only and candidate/history mutation is prohibited." },
  human_approval: { required: true, approver_roles: ["human-governance-owner"] },
  stop_conditions: classification.stop_conditions,
  authorization: "SESSION_B3_AUTHORIZED_TO_START_ONLY"
};

await writeJson("task-intent.yaml", taskIntent);
await writeJson("classification.yaml", classification);
await writeJson("blueprint.yaml", blueprint);
await writeJson("reviewer-assignments.json", assignments);
await writeJson("reviewer-runtime-identities.json", reviewRunIdentities);
await writeJson("reviewer-dispatch-plan.json", {
  schema_version: 1,
  task_id: taskId,
  dispatch_mode: "three_stage_fresh_sessions",
  waves: [
    { wave: "1", roles: ["code-reviewer", "security-reviewer", "railway-domain-reviewer"], maximum_concurrent: 3, start_condition: "PRE_REVIEW_FREEZE_PASS", completion_required_before_next_wave: true },
    { wave: "2A", roles: ["compatibility-reviewer"], maximum_concurrent: 1, start_condition: "WAVE_1_OUTPUT_FREEZE_PASS", completion_required_before_next_wave: true },
    { wave: "2B", roles: ["qa-engineer"], maximum_concurrent: 1, start_condition: "FOUR_FORMAL_REVIEW_OUTPUTS_FROZEN", completion_required_before_finalization: true }
  ],
  rules: { reviewer_reuse: false, root_may_substitute_qa: false, qa_capacity_reserved: true, missing_reviewer_is_pass: false, pre_review_input_mutation_invalidates_session: true },
  result: "PASS"
});
await writeJson("reviewer-capacity-preflight-runtime.json", {
  schema_version: 1,
  task_id: taskId,
  required_reviewer_count: 5,
  configured_max_threads: 4,
  root_thread_accounted_for: true,
  active_root_threads: 1,
  completed_prior_child_threads_observed: 3,
  active_reviewer_child_threads_before_dispatch: 0,
  maximum_concurrent_reviewer_threads: 3,
  wave_1_capacity_available: true,
  wave_2a_capacity_available: true,
  qa_capacity_reserved: true,
  all_assignments_unique: true,
  all_base_scopes_valid: true,
  verification_basis: "Live collaboration capacity inspection before B3 dispatch showed only the root active; three prior B2 child agents were completed and no reviewer slot was occupied.",
  preflight_status: "PASS"
});
await writeJson("r11-source-package-verification.json", {
  schema_version: 1,
  task_id: taskId,
  source_task_id: r11Id,
  source_manifest_path: sourceManifestRef,
  source_manifest_sha256: sha256(sourceManifestBytes),
  expected_manifest_sha256: expected.r11PackageManifestSha,
  source_file_count: sourceManifest.file_count,
  source_files: sourceChecks,
  future_output_placeholders: sourceManifest.future_output_placeholders,
  only_existing_inputs: sourceManifest.only_existing_inputs,
  result: "PASS"
});

await writeJson("session-b3-security-binding-chain.json", binding);
await writeJson("session-b3-security-read-scope.json", securityScope);
await writeJson("session-b3-security-evidence.yaml", securityEvidenceSource);
await writeJson("required-chain-node-verification.json", {
  schema_version: 1,
  task_id: taskId,
  production_loader: "loadAndCompileGovernanceSchemas",
  schema_set_sha256: schemaSet.schema_set_sha256,
  railway_schema_sha256: railwaySchema.sha256,
  railway_profile_sha256: railwayProfile.sha256,
  scanner_contract_id: binding.scanner_contract.id,
  scanner_contract_version: binding.scanner_contract.version,
  scanner_contract_sha256: binding.scanner_contract.sha256,
  nodes: nodeChecks,
  security_evidence_schema_issues: securityIssues,
  forbidden_security_allowlist_paths: securityScope.allowed_files.filter((item) => forbiddenExact.includes(item.path)).map((item) => item.path),
  result: "PASS"
});

const r11BaselineRef = `.codex/tasks/${r11Id}/review-baseline-after.json`;
const r11BaselineBytes = await readBytes(r11BaselineRef);
const inheritedBaseline = JSON.parse(r11BaselineBytes);
const r11ArtifactManifestRef = `.codex/tasks/${r11Id}/artifact-manifest.yaml`;
const r11ArtifactManifestBytes = await readBytes(r11ArtifactManifestRef);
const r11ArtifactManifest = JSON.parse(r11ArtifactManifestBytes);
await writeJson("review-baseline-before.json", {
  schema_version: 1,
  task_id: taskId,
  baseline_role: "before",
  captured_at: new Date().toISOString(),
  git_used: false,
  candidate: {
    manifest_path: manifestRef,
    manifest_sha256: sha256(manifestBytes),
    file_count: candidateFiles.length,
    included_file_set_sha256: expected.fileSetSha,
    all_file_hashes_match: true,
    files: candidateFiles
  },
  inherited_protected_snapshot: {
    source_path: r11BaselineRef,
    source_sha256: sha256(r11BaselineBytes),
    file_count: inheritedBaseline.files.length,
    counts: inheritedBaseline.counts,
    files: inheritedBaseline.files
  },
  remediation_11_snapshot: {
    artifact_manifest_path: r11ArtifactManifestRef,
    artifact_manifest_sha256: sha256(r11ArtifactManifestBytes),
    manifest_artifact_count: r11ArtifactManifest.artifacts.length,
    artifacts: r11ArtifactManifest.artifacts
  },
  b3_task_excluded: `${taskRel}/**`,
  result: "PASS"
});

const commonB3Inputs = [
  "task-intent.yaml", "classification.yaml", "blueprint.yaml", "reviewer-assignments.json",
  "reviewer-runtime-identities.json", "reviewer-dispatch-plan.json", "reviewer-capacity-preflight-runtime.json",
  "r11-source-package-verification.json", "review-baseline-before.json", "session-b3-security-binding-chain.json",
  "session-b3-security-read-scope.json", "session-b3-security-evidence.yaml", "required-chain-node-verification.json",
  "pre-review-input-manifest.json", "pre-review-freeze.json"
].map((name) => `${taskRel}/${name}`);

const baseScopeFiles = {
  "code-reviewer": "code-reviewer-scope.json",
  "security-reviewer": "security-reviewer-scope.json",
  "railway-domain-reviewer": "railway-domain-reviewer-scope.json",
  "compatibility-reviewer": "compatibility-reviewer-scope.json",
  "qa-engineer": "qa-readback-reviewer-scope.json"
};
for (const [role, name] of Object.entries(baseScopeFiles)) {
  const baseScope = await readJson(`${r11PackageRel}/reviewer-read-scopes/${name}`);
  assert(baseScope.directory_globs_allowed === false, `BASE_SCOPE_GLOB_ENABLED:${role}`);
  assert(baseScope.allowed_write_paths.length === 0, `BASE_SCOPE_WRITE_ENABLED:${role}`);
  await writeJson(`reviewer-scopes/base-${name}`, baseScope);
  if (["code-reviewer", "security-reviewer", "railway-domain-reviewer"].includes(role)) {
    const selfPath = `${taskRel}/reviewer-scopes/${name}`;
    const actualScope = {
      ...baseScope,
      source_scope_path: `${r11PackageRel}/reviewer-read-scopes/${name}`,
      source_scope_sha256: (await directInfo(`${r11PackageRel}/reviewer-read-scopes/${name}`)).sha256,
      allowed_paths: [...new Set([...(baseScope.allowed_paths ?? []), ...commonB3Inputs, selfPath])].sort(),
      forbidden_paths: [...new Set([...(baseScope.forbidden_paths ?? []), ...forbiddenExact, "implementation conversation", "conversation memory", "other Reviewer private access log"])],
      directory_globs_allowed: false,
      allowed_write_paths: []
    };
    delete actualScope.scope_sha256;
    actualScope.scope_sha256 = canonicalSha256(actualScope);
    if (role === "code-reviewer") assert(!actualScope.allowed_paths.some((item) => item.endsWith("/human-approval.yaml")), "CODE_SCOPE_CONTAINS_HUMAN_APPROVAL");
    await writeJson(`reviewer-scopes/${name}`, actualScope);
  }
}

const frozenNames = [...outputInfo.keys()].filter((name) =>
  !["pre-review-input-manifest.json", "pre-review-freeze.json"].includes(name)
).sort();
const materializedFiles = frozenNames.map((name) => outputInfo.get(name));
const preReviewManifest = {
  schema_version: 1,
  task_id: taskId,
  manifest_type: "B3_ACTUAL_PRE_REVIEW_INPUT_MANIFEST",
  source_package: {
    task_id: r11Id,
    manifest_path: sourceManifestRef,
    manifest_sha256: sha256(sourceManifestBytes),
    file_count: 15,
    all_source_hashes_match: true
  },
  file_count: materializedFiles.length,
  files: materializedFiles,
  future_reviewer_outputs: [],
  human_approval_present: false,
  only_existing_inputs: true
};
const preManifestInfo = await writeJson("pre-review-input-manifest.json", preReviewManifest);
await writeJson("pre-review-freeze.json", {
  schema_version: 1,
  task_id: taskId,
  frozen: true,
  input_manifest_path: preManifestInfo.path,
  input_manifest_sha256: preManifestInfo.sha256,
  source_package_file_count: 15,
  materialized_file_count: materializedFiles.length,
  frozen_files: materializedFiles,
  frozen_at: new Date().toISOString(),
  reviewer_outputs_prebound: false,
  human_approval_prebound: false,
  after_baseline_prebound: false,
  result: "PASS"
});

console.log(JSON.stringify({
  result: "PASS",
  candidate_files: candidateFiles.length,
  source_package_inputs: sourceChecks.length,
  materialized_pre_review_inputs: materializedFiles.length,
  security_allowlist_entries: securityScope.allowed_files.length,
  required_chain_nodes: nodeChecks.length,
  schema_issues: securityIssues.length,
  assignments: assignments.assignment_count,
  live_capacity_preflight: "PASS",
  pre_review_freeze: "PASS"
}));
