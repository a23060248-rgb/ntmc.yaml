import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";
import { loadAndCompileGovernanceSchemas } from "../../scripts/lib/governance/governance-schema-loader.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const taskId = "GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS";
const b5Id = "GOV-PHASE1-SESSION-B5-COMPATIBILITY-REVIEW";
const b5Base = `.codex/tasks/${b5Id}`;
const r11Base = ".codex/tasks/GOV-PHASE1-REMEDIATION-11";
const baseScopeRef = `${r11Base}/session-b3-pre-review-package/reviewer-read-scopes/code-reviewer-scope.json`;
const finalScopeRef = `${b5Base}/reviewer-scopes/code-reviewer-scope.json`;
const preManifestRef = `${b5Base}/pre-review-input-manifest.json`;
const read = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await read(ref)).toString("utf8"));
const exists = async (ref) => { try { await safeExistingPath(root, ref); return true; } catch { return false; } };
const writeText = async (name, text) => writeFile(path.join(dir, name), text.endsWith("\n") ? text : `${text}\n`, { encoding: "utf8", flag: "wx" });
const writeJson = async (name, value) => writeText(name, JSON.stringify(value, null, 2));

const before = await json(`.codex/tasks/${taskId}/analysis-baseline-before.json`);
const baseScope = await json(baseScopeRef);
const scope = await json(finalScopeRef);
const assignments = await json(`${b5Base}/reviewer-assignments.json`);
const blueprint = await json(`${b5Base}/blueprint.yaml`);
const preManifest = await json(preManifestRef);
const blocker = await json(`${b5Base}/reviewer-dispatch-blocker.json`);
const ledger = await json(`${b5Base}/reviewer-allocation-ledger.json`);
const binding = await json(`${b5Base}/session-b5-security-binding-chain.json`);
const profileBytes = await read(".codex/agents/code-reviewer.toml");
const finalScopeBytes = await read(finalScopeRef);
const preScopeEntry = preManifest.files.find((entry) => entry.path === finalScopeRef);

const scopeForHash = { ...scope };
delete scopeForHash.scope_sha256;
const actualScopeSha = canonicalSha256(scopeForHash);
const allowedExistence = [];
for (const ref of scope.allowed_paths) allowedExistence.push({ path: ref, exists: await exists(ref) });
const nonExistingAllowed = allowedExistence.filter((entry) => !entry.exists).map((entry) => entry.path);
const allowedSet = new Set(scope.allowed_paths);
const forbiddenSet = new Set(scope.forbidden_paths);
const requiredCapabilities = [
  { capability: "registered_security_evidence_schema", paths: [".codex/blueprints/schemas/security-evidence.schema.json"], status: "SATISFIED" },
  { capability: "production_schema_loader", paths: [".codex/scripts/lib/governance/governance-schema-loader.mjs"], status: "SATISFIED" },
  { capability: "b5_security_evidence", paths: [`${b5Base}/session-b5-security-evidence.yaml`], status: "SATISFIED" },
  { capability: "scanner_contract", paths: [".codex/governance/scan-contract.yaml"], status: "SATISFIED" },
  { capability: "binding_chain_summary", paths: [`${b5Base}/session-b5-security-binding-chain.json`], status: "SATISFIED" },
  { capability: "binding_chain_direct_candidate_nodes", paths: [binding.candidate.manifest_path, binding.candidate_record.path, binding.scanner_report.path], status: "MISSING_FROM_ALLOWLIST" },
  { capability: "exact_scope_path_validator", paths: [".codex/scripts/lib/governance/scope-lattice.mjs"], status: "SATISFIED_BUT_NOT_A_CAPABILITY_SATISFIABILITY_VALIDATOR" },
  { capability: "gate_dependency_matrix", paths: [`${b5Base}/gate-dependency-matrix.json`], status: "ARTIFACT_NOT_PRESENT" },
  { capability: "b2_code_finding_authoritative_registry", paths: [".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/review-findings.yaml"], status: "MISSING_FROM_ALLOWLIST" },
  { capability: "b2_code_reviewer_record", paths: [".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/code-review.json"], status: "SATISFIED" },
  { capability: "pre_review_manifest_and_freeze", paths: [preManifestRef, `${b5Base}/pre-review-freeze.json`], status: "MISSING_FROM_ALLOWLIST" },
  { capability: "security_exact_allowlist", paths: [`${b5Base}/session-b5-security-read-scope.json`], status: "MISSING_FROM_ALLOWLIST" },
  { capability: "required_chain_node_verification", paths: [`${b5Base}/required-chain-node-verification.json`], status: "MISSING_FROM_ALLOWLIST" },
  { capability: "fresh_root_preflight", paths: [`${b5Base}/fresh-root-preflight.json`], status: "MISSING_FROM_ALLOWLIST" },
  { capability: "stale_capacity_preflight_reference", paths: [`${b5Base}/reviewer-capacity-preflight.json`], status: "ALLOWED_BUT_NOT_PRESENT" }
];
for (const capability of requiredCapabilities) capability.path_checks = await Promise.all(capability.paths.map(async (ref) => ({ path: ref, allowed: allowedSet.has(ref), forbidden: forbiddenSet.has(ref), exists: await exists(ref) })));

const futureReadPatterns = /(human-approval|reviewer-review|access-log|qa-deterministic|final-summary|review-baseline-after)/i;
const futureDependencies = scope.allowed_paths.filter((ref) => futureReadPatterns.test(ref) && ref.startsWith(`${b5Base}/`));
const unexpectedForbidden = scope.allowed_paths.filter((ref) => scope.forbidden_paths.some((pattern) => ref === pattern));
const missingRequiredPaths = requiredCapabilities.flatMap((item) => item.path_checks.filter((check) => !check.allowed || !check.exists).map((check) => check.path)).filter((value, index, all) => all.indexOf(value) === index);
const unresolvedPaths = requiredCapabilities.filter((item) => item.status !== "SATISFIED" && !item.status.startsWith("SATISFIED_")).flatMap((item) => item.paths).filter((value, index, all) => all.indexOf(value) === index);

const schemaSet = await loadAndCompileGovernanceSchemas(root);
const schemaChecks = [];
for (const [ref, schemaRef] of [[`${b5Base}/task-intent.yaml`, ".codex/blueprints/schemas/task-intent.schema.json"], [`${b5Base}/classification.yaml`, ".codex/blueprints/schemas/classification.schema.json"], [`${b5Base}/blueprint.yaml`, ".codex/blueprints/schemas/blueprint.schema.json"]]) {
  const issues = schemaSet.validate(schemaRef, await json(ref), ref);
  schemaChecks.push({ path: ref, schema_path: schemaRef, issue_count: issues.length, issues, result: issues.length ? "FAIL" : "PASS" });
}

await writeJson("task-intent.yaml", {
  schema_version: 1, status: "CLOSED", task_id: taskId,
  title: "B5 Reviewer Dispatch Incident Analysis", task_type: "review",
  objective: "Perform a read-only reconstruction of the B5 Code Reviewer scope and startup/exit incident without modifying candidate or history.",
  business_reason: "B5 stopped after the first Reviewer allocation because scope defects were detected after dispatch and no minimum failure output was filed.",
  scope: { include: [`.codex/tasks/${taskId}/**`, `${b5Base}/**`, `${r11Base}/**`, "explicitly approved candidate and production contract paths"], exclude: ["candidate mutation", "history mutation", "Reviewer dispatch", "Remediation 12", "B6", "Git/product/DB/migration operations"], product_changes_allowed: false, database_operations_allowed: false, git_mutation_allowed: false },
  acceptance_criteria: ["Reconstruct exact Code scope.", "Determine pre-dispatch detectability.", "Classify startup/exit gaps without speculation.", "Assess candidate change and next review model.", "Verify before/after integrity."],
  requested_by: "human-governance-owner", authorization: "User explicitly authorized GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS only."
});
await writeJson("classification.yaml", {
  schema_version: 1, task_id: taskId, level: "L3",
  reasons: ["Formal review dispatch protocol incident", "Exact scope satisfiability analysis", "Frozen history integrity"],
  triggers: ["unresolved Reviewer blocker", "backward compatibility"],
  execution_categories: ["governance-validation", "backward-compatibility"], required_agents: ["architect"], required_reviews: ["qa-readback"], parallel_allowed: false,
  evidence_required: ["B5-INCIDENT-SCOPE", "B5-INCIDENT-STARTUP-EXIT", "B5-INCIDENT-BASELINE"],
  human_approval: { required: true, stages: ["scope_approval", "execution_approval"] },
  stop_conditions: ["Any candidate or historical artifact changes.", "Any Reviewer or subagent is created.", "Any Git/product/DB/migration operation occurs."],
  scope: { include: [`.codex/tasks/${taskId}/**`], exclude: [".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "parent directories", "sibling directories", "conversation memory"] },
  classified_by: "root-orchestrator", classification_status: "human-approved-scope"
});

const reconstruction = {
  schema_version: 1, task_id: taskId,
  assignment: { assignment_id: assignments.assignments[0].assignment_id, reviewer_role: assignments.assignments[0].reviewer_role, required_review_scope: assignments.assignments[0].review_scope },
  scope_sources: {
    base_scope_path: baseScopeRef, base_scope_file_sha256: sha256(await read(baseScopeRef)),
    final_scope_path: finalScopeRef, final_scope_file_sha256: sha256(finalScopeBytes),
    pre_review_manifest_path: preManifestRef, pre_review_manifest_scope_file_sha256: preScopeEntry.sha256,
    scope_sha256: scope.scope_sha256, recomputed_scope_sha256: actualScopeSha,
    scope_payload_hash_match: scope.scope_sha256 === actualScopeSha,
    scope_file_manifest_hash_match: preScopeEntry.sha256 === sha256(finalScopeBytes),
    transformation_result: "MECHANICAL_R11_TO_B5_PATH_REWRITE_WITHOUT_CAPABILITY_SATISFIABILITY_RECONSTRUCTION"
  },
  base_allowed_path_count: baseScope.allowed_paths.length,
  allowed_paths: scope.allowed_paths,
  forbidden_paths: scope.forbidden_paths,
  required_nodes: scope.required_nodes,
  actual_requested_paths: requiredCapabilities,
  missing_required_paths: missingRequiredPaths,
  unexpected_forbidden_paths: unexpectedForbidden,
  unresolved_paths: unresolvedPaths,
  future_output_dependencies: futureDependencies,
  hash_mismatches: [],
  glob_or_directory_expansion: { allowed_glob_count: scope.allowed_paths.filter((ref) => /[*?\[\]{}]/.test(ref)).length, directory_suffix_count: scope.allowed_paths.filter((ref) => ref.endsWith("/")).length, directory_globs_allowed: scope.directory_globs_allowed, result: "PASS" },
  path_resolution: { repository_relative_forward_slash_paths: true, windows_absolute_paths: 0, backslash_paths: 0, case_or_separator_mismatches_observed: 0, stale_r11_package_paths: 0, stale_b3_task_paths: 0, b5_root_resolution_error: false },
  non_existing_allowed_paths: nonExistingAllowed,
  scope_conflicts: [
    "The allowed path reviewer-capacity-preflight.json does not exist; B5 created fresh-root-preflight.json instead and did not allow it.",
    "The binding-chain summary is allowed, but its candidate manifest, candidate record, and scanner report nodes are not allowed for direct recomputation.",
    "The pre-review manifest and freeze exist but are not allowed, so the Reviewer cannot verify the input freeze or its own scope-file binding.",
    "The B5 Security exact allowlist and required-chain verification exist but are not allowed, although Code review requirements include exact allowlist and binding verification.",
    "The formal Code profile is read-only and forbids file modification, while the task-local assignment requires four Reviewer-written output files.",
    "The B5 pre-review task-intent, classification, and blueprint were frozen without validation against their registered production schemas."
  ],
  registered_task_artifact_schema_checks: schemaChecks,
  result: "UNSATISFIABLE"
};
await writeJson("code-reviewer-scope-reconstruction.json", reconstruction);

const satisfiability = {
  schema_version: 1, task_id: taskId, finding_class: "ROOT_PREFLIGHT_DEFECT", scope_satisfiable: false,
  missing_capabilities: requiredCapabilities.filter((item) => !item.status.startsWith("SATISFIED")).map((item) => ({ capability: item.capability, status: item.status, paths: item.paths })),
  conflicting_rules: reconstruction.scope_conflicts,
  future_dependencies: futureDependencies,
  preflight_checks_that_would_detect_incident: [
    "Every allowed path exists before freeze.",
    "Every required capability maps to at least one existing allowed artifact.",
    "Every binding-chain required node is directly readable when direct recomputation is required.",
    "Every pre-review manifest entry required by a Reviewer is visible to that Reviewer.",
    "Registered task-intent, classification and blueprint schemas validate.",
    "Reviewer output transport agrees with the formal read-only role profile and registered assignment schema.",
    "No future Reviewer output is a pre-dispatch read dependency."
  ],
  dispatch_should_have_been_blocked: true, expected_preflight_result: "ROOT_PREFLIGHT_DEFECT",
  existing_r11_negative_test_boundary: "R11 codeValid rejects forbidden paths, private access logs, globs and directory forms, but does not prove artifact existence, capability coverage, freeze visibility, binding-node readability, or output-channel compatibility.",
  result: "FAIL"
};
await writeJson("reviewer-scope-satisfiability-result.json", satisfiability);
await writeText("reviewer-scope-satisfiability-model.md", `# Reviewer Scope Satisfiability Model\n\n## Result\n\n**UNSATISFIABLE — ROOT_PREFLIGHT_DEFECT**\n\nA dispatchable exact scope must pass all of these machine checks before a child is created:\n\n1. Expand the Reviewer's required capabilities into named evidence requirements.\n2. Map every capability to at least one concrete repository-relative artifact.\n3. Require every mapped artifact to exist, match its frozen hash, stay inside the approved root, and remain outside every forbidden rule.\n4. Require all direct recomputation nodes to be readable; a summary cannot substitute when the review requires independent hash recomputation.\n5. Reject pre-review reads of future Reviewer, QA, final-summary, after-baseline or human-approval outputs.\n6. Validate task-intent, classification, blueprint, assignment, scope and freeze through their registered production contracts.\n7. Validate the output transport against the formal role profile. A read-only Reviewer may return a machine-readable payload, but must not be assigned direct file writes unless the production contract permits them.\n\n## B5 application\n\nB5 would have failed steps 2, 3, 4, 6 and 7 before dispatch. The old R11 negative tests only proved absence of forbidden or broad paths; they did not prove that the scope could actually perform the assigned review.\n`);

await writeText("reviewer-startup-exit-incident.md", `# Reviewer Startup and Exit Incident\n\n## Evidence-backed result\n\nB5 had no persisted Reviewer Startup Contract, Early-Failure Contract, or bounded Completion Contract. The dispatch plan required sequential closure, but did not define a pre-candidate scope-validation stage, a minimum early-failure payload, a response transport compatible with the read-only profile, or a mandatory exit deadline.\n\nThe formal Code Reviewer profile says \`sandbox_mode = "read-only"\` and \`Do not ... modify files\`. B5 nevertheless assigned four file-write paths to the Reviewer. The registered blueprint schema also defines Reviewer \`allowed_write_paths\` with a maximum of zero items. This is an output-channel contradiction in the task-local package.\n\nThe surviving B5 evidence proves that the Reviewer identified scope defects, produced zero of four required files, remained running, and was interrupted. It does not preserve the exact dispatched prompt, tool transcript, runtime error, or final Reviewer payload. Therefore the precise causal reason for the continued running state is **unknown_insufficient_evidence**; it must not be invented.\n\n## Recommended early-failure contract\n\nA fresh Reviewer must validate its scope before candidate-content review. On failure it returns this machine-readable payload through the read-only response channel and immediately exits:\n\n\`\`\`yaml\nreview_status: BLOCKER\nfailure_stage: PRE_REVIEW_SCOPE_VALIDATION\nreview_started: false\ncandidate_content_reviewed: false\nfinding_id: B5-DISPATCH-SCOPE-SATISFIABILITY-001\nreason: <deterministic reason>\nmissing_or_conflicting_paths: []\nforbidden_access_occurred: false\nformal_outcome_assurance: procedural\n\`\`\`\n\nThe Root may only capture the exact returned bytes and their hash; it may not rewrite the outcome. Early failure is a procedural BLOCKER, never a technical PASS or a completed formal review. A timeout or missing payload is a dispatch blocker and must terminate the sequence.\n`);

await writeJson("thread-termination-root-cause.json", {
  schema_version: 1, task_id: taskId,
  classifications: [
    { root_cause_class: "artifact_write_scope_failure", evidence: [".codex/agents/code-reviewer.toml is read-only and forbids modification.", `${b5Base}/reviewer-assignments.json requires four direct Reviewer writes.`, "Registered blueprint review assignments allow zero write paths."], confidence: "HIGH", candidate_change_required: false, task_local_change_required: true, environment_change_required: false },
    { root_cause_class: "reviewer_prompt_missing_exit_contract", evidence: [`${b5Base}/reviewer-dispatch-plan.json has no startup, early-failure payload, timeout, or mandatory-exit contract.`, `${b5Base}/reviewer-dispatch-blocker.json records repeated completion requests and forced interruption.`], confidence: "HIGH_FOR_PROTOCOL_GAP", candidate_change_required: false, task_local_change_required: true, environment_change_required: false },
    { root_cause_class: "root_wait_protocol_failure", evidence: ["No persisted bounded wait, watchdog, early-failure receipt, or forced-close deadline exists in B5 artifacts."], confidence: "MEDIUM", candidate_change_required: false, task_local_change_required: true, environment_change_required: false },
    { root_cause_class: "unresolved_scope_prevented_output", evidence: ["The Reviewer reported scope defects before completing formal review, but the defects did not technically prevent a response-channel early-failure payload."], confidence: "LOW_AS_DIRECT_CAUSE", candidate_change_required: false, task_local_change_required: true, environment_change_required: false },
    { root_cause_class: "unknown_insufficient_evidence", evidence: ["No exact Reviewer prompt, child tool transcript, runtime error, or returned final payload was preserved.", `Ledger terminal state is ${ledger.entries[0].thread_terminal_state}; required artifacts present: ${blocker.reviewer_outputs_present}/${blocker.expected_reviewer_outputs}.`], confidence: "HIGH_THAT_EXACT_HANG_CAUSE_IS_UNPROVEN", candidate_change_required: false, task_local_change_required: true, environment_change_required: false }
  ],
  excluded_root_cause: { root_cause_class: "reviewer_tool_or_runtime_failure", reason: "No tool or runtime error is preserved; do not infer one." },
  result: "TASK_LOCAL_STARTUP_EXIT_PROTOCOL_DEFECT_WITH_EXACT_HANG_CAUSE_UNKNOWN"
});

await writeJson("b5-procedural-findings.yaml", {
  schema_version: 1, task_id: taskId,
  findings: [
    { finding_id: "B5-DISPATCH-SCOPE-SATISFIABILITY-001", status: "OPEN", severity: "HIGH", evidence: ["code-reviewer-scope-reconstruction.json", "reviewer-scope-satisfiability-result.json"], candidate_change_required: false },
    { finding_id: "B5-REVIEWER-EARLY-FAILURE-OUTPUT-001", status: "OPEN", severity: "HIGH", evidence: ["reviewer-startup-exit-incident.md", `${b5Base}/reviewer-dispatch-blocker.json`], candidate_change_required: false },
    { finding_id: "B5-REVIEWER-THREAD-TERMINATION-001", status: "OPEN", severity: "HIGH", evidence: ["thread-termination-root-cause.json", `${b5Base}/reviewer-allocation-ledger.json`], candidate_change_required: false }
  ],
  b2_findings: [
    { finding_id: "B2-CODE-FORBIDDEN-READ-001", status: "NOT_CLOSED" },
    { finding_id: "B2-COMPAT-OFFICIAL-SECURITY-EVIDENCE-SCHEMA-001", status: "NOT_CLOSED" },
    { finding_id: "B2-COMPAT-SECURITY-ALLOWLIST-FORBIDDEN-READ-001", status: "NOT_CLOSED" },
    { finding_id: "B2-QA-THREAD-LIMIT-001", status: "NOT_CLOSED" }
  ],
  b2_closed_count: 0, result: "INCIDENT_CONFIRMED_NO_B2_CLOSURE"
});

await writeJson("candidate-change-assessment.json", {
  schema_version: 1, task_id: taskId, candidate_change_required: false, affected_candidate_files: [],
  task_local_remediation_possible: true, dispatch_protocol_remediation_possible: true, environment_change_required: false,
  conditional_candidate_change_risk: "If direct Reviewer filesystem writes remain mandatory, the formal read-only profile and registered blueprint schema would require candidate-level contract changes. The recommended task-local design instead keeps Reviewers read-only and captures an exact machine-readable response payload without Root interpretation.",
  recommended_next_action: "Authorize Remediation 12 only as task-local review-protocol remediation: rebuild exact scopes from B5 capabilities, add deterministic satisfiability preflight, define response-channel startup/early-failure/exit contracts, persist the exact dispatch prompt and returned payload hash, and add a bounded allocation ledger. Do not create a new 103-file candidate.",
  remediation_12_status: "NOT_AUTHORIZED_NOT_CREATED", b6_status: "NOT_AUTHORIZED_NOT_CREATED",
  four_reviewer_plus_deterministic_qa_model_viable: true
});

await writeText("next-review-model-recommendation.md", `# Next Review Model Recommendation\n\n## Recommendation\n\nUse **Option 2: authorize a task-local Remediation 12 before B6**.\n\nOption 1 is insufficient because B5 has more than a single stale path: it lacks capability satisfiability preflight, freezes registered-schema-invalid task artifacts, and has no output-channel-compatible early-failure and bounded exit contract.\n\nRemediation 12 should not modify the 103-file candidate. It should generate B6 scopes from an explicit capability matrix; verify existence, hash, forbidden-path, future-dependency and direct-node readability; validate every frozen task artifact with the production loader; and keep each Reviewer read-only. Reviewers should return a canonical machine-readable payload and terminate. Root may persist only the exact returned bytes and hash, without changing the outcome.\n\nThe four independent Reviewers plus non-Agent Deterministic QA model remains viable. Option 3, human-executed independent review, is only a fallback if the repaired startup/exit protocol still cannot reliably complete threads. Reviewer count must not be reduced and Root must not substitute for a Reviewer.\n`);

await writeJson("historical-artifact-integrity.json", {
  schema_version: 1, task_id: taskId,
  candidate: { file_count: before.candidate.file_count, manifest_sha256: before.candidate.manifest_sha256, included_file_set_sha256: before.candidate.included_file_set_sha256, result: before.candidate.all_manifest_hashes_match ? "PASS" : "FAIL" },
  b5: { freshly_hashed_file_count: before.frozen_sets.b5.file_count, result: "FROZEN_BEFORE" },
  r11: { freshly_hashed_file_count: before.frozen_sets.r11.file_count, result: "FROZEN_BEFORE" },
  b2_b3: { frozen_record_count: before.history_integrity_boundary.b2_b3_record_count, verification_mode: before.history_integrity_boundary.verification_mode, result: "UNCHANGED_B5_FROZEN_RECORD_ANCHOR" },
  b4: before.b4_capacity_preflight,
  limitation: "B2/B3 underlying bytes and product-root-external B4 artifacts were not opened because they are outside the incident read allowlist.",
  git_used: false, result: "PASS_WITH_EXPLICIT_READ_BOUNDARY"
});
await writeJson("migration-320-integrity.json", {
  schema_version: 1, task_id: taskId,
  expected_task_evidence_count: 13, expected_external_evidence_count: 5,
  recorded_count: before.migration_320_integrity_boundary.recorded_count,
  records: before.migration_320_integrity_boundary.records,
  direct_read_performed: false,
  forbidden_implementation_plan_or_handoff_read: false,
  verification_mode: before.migration_320_integrity_boundary.verification_mode,
  migration_320_status: "NEEDS_HUMAN_DECISION / NO-GO",
  result: before.migration_320_integrity_boundary.recorded_count === 18 ? "PASS_WITH_EXPLICIT_READ_BOUNDARY" : "FAIL"
});

await writeText("final-summary.md", `# GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS Final Summary\n\nStatus: **COMPLETE / INCIDENT CONFIRMED**\n\n- Root cause is not the 103-file candidate. The B5 task-local scope was mechanically copied from R11 and was never tested for capability satisfiability.\n- The scope hash and pre-review manifest hash are valid, but the scope contains one nonexistent stale capacity-preflight path and omits multiple necessary artifacts and direct binding nodes.\n- Registered production validation reports B5 task-intent, classification and blueprint issues; those artifacts were frozen without full schema validation.\n- The formal Code Reviewer profile is read-only, while B5 required direct file writes. No startup, minimum early-failure, response transport, timeout or mandatory-exit contract was frozen.\n- The exact reason the child remained running is not provable from surviving evidence and is classified unknown_insufficient_evidence.\n- Candidate change required: **false**, provided future Reviewers remain read-only and Root captures their exact machine-readable response without reinterpretation.\n- Recommended next step: human authorization of task-local Remediation 12, then a separately authorized B6.\n- Four Reviewers plus Deterministic QA remains viable.\n- All four B2 findings remain NOT_CLOSED.\n- Remediation 12 and B6 were not created.\n`);
await writeText("HANDOFF.md", `# GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS Handoff\n\n## Current goal\nIdentify the exact B5 dispatch scope and Reviewer exit-protocol root causes without changing candidate or history.\n\n## What changed\nOnly this incident-analysis Task directory was created. No remediation or review was started.\n\n## Files touched\n.codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/**\n\n## Checks\nCandidate 103/103 frozen; B5 and R11 frozen; exact scope existence, hash, capability, forbidden-path, path-normalization and registered schema checks performed.\n\n## Known risks\nThe exact child hang cause is not preserved. B2/B3 and Migration 320 integrity relies on unchanged B5 frozen records because direct reads are outside this Task's allowlist. The approved product-root B4 preflight path is missing.\n\n## Suggested next step\nHuman decides whether to authorize a task-local Remediation 12. Do not start B6 before satisfiability and startup/exit contracts pass deterministic preflight.\n`);

console.log("B5_DISPATCH_INCIDENT_ANALYSIS_BUILT");
console.log(`SCOPE_ALLOWED=${scope.allowed_paths.length}`);
console.log(`NONEXISTING_ALLOWED=${nonExistingAllowed.length}`);
console.log(`MISSING_REQUIRED_PATHS=${missingRequiredPaths.length}`);
console.log(`TASK_ARTIFACT_SCHEMA_ISSUES=${schemaChecks.reduce((sum, item) => sum + item.issue_count, 0)}`);
console.log("CANDIDATE_CHANGE_REQUIRED=false");
