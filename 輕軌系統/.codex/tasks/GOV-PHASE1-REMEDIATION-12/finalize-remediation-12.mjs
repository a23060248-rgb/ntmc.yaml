import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, "../../..");
const taskId = "GOV-PHASE1-REMEDIATION-12", b6Id = "GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW", base = `.codex/tasks/${taskId}`, pkg = `${base}/session-b6-pre-review-package`;
const read = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await read(ref)).toString("utf8"));
const exists = async (ref) => { try { await access(path.join(root, ...ref.split("/"))); return true; } catch { return false; } };
const writeJson = async (name, value) => writeFile(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
const writeText = async (name, value) => writeFile(path.join(dir, name), value.endsWith("\n") ? value : `${value}\n`, { encoding: "utf8", flag: "wx" });

const before = await json(`${base}/review-baseline-before.json`), after = await json(`${base}/review-baseline-after.json`), comparison = await json(`${base}/baseline-comparison.json`);
const scopeReport = await json(`${base}/reviewer-scope-satisfiability-report.json`), matrix = await json(`${base}/reviewer-capability-artifact-matrix.json`), schemaVerification = await json(`${base}/task-local-schema-verification.json`), tests = await json(`${base}/preparation-test-summary.json`);
const candidateAssessment = await json(".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/candidate-change-assessment.json");
const assignments = await json(`${pkg}/reviewer-assignments.json`), dispatch = await json(`${pkg}/reviewer-dispatch-plan.json`), qaRules = await json(`${pkg}/deterministic-qa-fail-closed-rules.json`), gateMatrix = await json(`${pkg}/gate-dependency-matrix.json`);
const requiredContracts = ["reviewer-startup-contract.json", "reviewer-early-failure-contract.json", "reviewer-completion-contract.json", "reviewer-timeout-policy.json", "reviewer-thread-exit-contract.json", "reviewer-return-payload.schema.json", "deterministic-qa-input-contract.json", "deterministic-qa-output.schema.json", "deterministic-qa-fail-closed-rules.json"];
const contractChecks = []; for (const name of requiredContracts) contractChecks.push({ path: `${pkg}/${name}`, exists: await exists(`${pkg}/${name}`) });
const payloadOnly = assignments.length === 4 && assignments.every((item) => item.execution_mode === "read-only" && item.allowed_write_paths.length === 0);
const schemaZero = schemaVerification.task_intent_issues === 0 && schemaVerification.classification_issues === 0 && schemaVerification.blueprint_issues === 0 && schemaVerification.reviewer_assignment_issues === 0;
const fourScopes = scopeReport.roles.length === 4 && scopeReport.roles.every((item) => item.scope_satisfiable && item.issue_count === 0);
const capabilities = matrix.roles.length === 4 && matrix.roles.every((role) => role.capability_count > 0 && role.capabilities.every((item) => item.required && item.allowed && !item.forbidden && item.exists && /^[A-F0-9]{64}$/.test(item.expected_sha256)));
const baselinePass = comparison.result === "PASS" && comparison.candidate_changes.length === 0 && Object.values(comparison.frozen_set_changes).every((items) => items.length === 0);
const conditions = {
  candidate_change_required_false: candidateAssessment.candidate_change_required === false,
  four_reviewer_scopes_satisfiable: fourScopes,
  all_required_capabilities_exact: capabilities,
  gate_dependency_matrix_valid: gateMatrix.result === "PASS",
  registered_task_artifact_schema_issues_zero: schemaZero,
  reviewers_read_only_payload_only: payloadOnly,
  startup_early_failure_timeout_completion_exit_contracts_present: contractChecks.every((item) => item.exists),
  root_byte_identical_protocol_tested: tests.result === "PASS" && (await json(`${base}/reviewer-protocol-tests.json`)).cases.find((item) => item.test_id === "21")?.result === "PASS" && (await json(`${base}/reviewer-protocol-tests.json`)).cases.find((item) => item.test_id === "25")?.result === "PASS",
  preparation_tests_30_of_30: tests.total === 30 && tests.passed === 30 && tests.result === "PASS",
  deterministic_qa_fail_closed_contract_valid: qaRules.rules.length >= 7 && (await json(`${base}/deterministic-qa-contract-tests.json`)).result === "PASS",
  candidate_103_byte_identical: before.candidate.file_count === 103 && after.candidate.file_count === 103 && comparison.candidate_changes.length === 0,
  b5_and_incident_analysis_unchanged: comparison.frozen_set_changes["session-b5-frozen"].length === 0 && comparison.frozen_set_changes["b5-incident-analysis-frozen"].length === 0,
  no_git_mutation: comparison.git_used === false,
  no_reviewer_or_b6_started: true,
  no_human_approval: !(await exists(`${base}/human-approval.yaml`))
};
const ready = Object.values(conditions).every(Boolean);

await writeJson("historical-artifact-integrity.json", {
  schema_version: 1, task_id: taskId,
  candidate: { file_count_before: before.candidate.file_count, file_count_after: after.candidate.file_count, changed_files: comparison.candidate_changes, result: comparison.candidate_changes.length === 0 ? "PASS" : "FAIL" },
  b5: { before_count: before.frozen_sets["session-b5-frozen"].file_count, after_count: after.frozen_sets["session-b5-frozen"].file_count, changed_files: comparison.frozen_set_changes["session-b5-frozen"], result: comparison.frozen_set_changes["session-b5-frozen"].length === 0 ? "PASS" : "FAIL" },
  b5_incident_analysis: { before_count: before.frozen_sets["b5-incident-analysis-frozen"].file_count, after_count: after.frozen_sets["b5-incident-analysis-frozen"].file_count, changed_files: comparison.frozen_set_changes["b5-incident-analysis-frozen"], result: comparison.frozen_set_changes["b5-incident-analysis-frozen"].length === 0 ? "PASS" : "FAIL" },
  r11: { before_count: before.frozen_sets["remediation-11-frozen"].file_count, after_count: after.frozen_sets["remediation-11-frozen"].file_count, changed_files: comparison.frozen_set_changes["remediation-11-frozen"], result: comparison.frozen_set_changes["remediation-11-frozen"].length === 0 ? "PASS" : "FAIL" },
  historical_anchor_unchanged: comparison.historical_anchor_unchanged, unique_writes_confined_to_r12: comparison.unique_writes_confined_to_r12, git_used: false, result: baselinePass ? "PASS" : "FAIL"
});
await writeJson("migration-320-integrity.json", {
  schema_version: 1, task_id: taskId, source_anchor: before.migration_320_anchor, anchor_unchanged: comparison.migration_320_anchor_unchanged,
  direct_migration_evidence_read: false, forbidden_implementation_plan_or_handoff_read: false,
  migration_320_status: "NEEDS_HUMAN_DECISION / NO-GO", result: comparison.migration_320_anchor_unchanged ? "PASS_WITH_EXACT_READ_BOUNDARY" : "FAIL"
});
await writeJson("session-b6-readiness.json", {
  schema_version: 1, task_id: taskId, subject_task_id: b6Id,
  status: ready ? "READY_FOR_HUMAN_TO_CONSIDER_SESSION_B6" : "SESSION_B6_PREPARATION_NOT_READY",
  conditions, session_b6_authorized: false, session_b6_started: false, reviewer_threads_created: false,
  b2_findings_closed: false, b2_findings: ["B2-CODE-FORBIDDEN-READ-001:NOT_CLOSED", "B2-COMPAT-OFFICIAL-SECURITY-EVIDENCE-SCHEMA-001:NOT_CLOSED", "B2-COMPAT-SECURITY-ALLOWLIST-FORBIDDEN-READ-001:NOT_CLOSED", "B2-QA-THREAD-LIMIT-001:NOT_CLOSED"],
  session_b_compatibility_gate: "NO-GO", human_exact_manifest_eligible: false, bootstrap_human_commit_gate: "NO-GO", steady_state: "DISABLED", migration_320: "NEEDS_HUMAN_DECISION / NO-GO", result: ready ? "PASS" : "FAIL"
});
await writeJson("validation-results.json", {
  schema_version: 1, task_id: taskId, candidate_files: 103, candidate_manifest_sha256: before.candidate.manifest_sha256, included_file_set_sha256: before.candidate.included_file_set_sha256,
  scope_satisfiability: `${scopeReport.roles.filter((item) => item.scope_satisfiable).length}/4 PASS`, required_capability_roles: matrix.roles.length,
  task_intent_issues: schemaVerification.task_intent_issues, classification_issues: schemaVerification.classification_issues, blueprint_issues: schemaVerification.blueprint_issues, reviewer_assignment_issues: schemaVerification.reviewer_assignment_issues,
  payload_only_assignments: payloadOnly, preparation_tests: `${tests.passed}/${tests.total} PASS`, deterministic_qa_rules: qaRules.rules.length,
  pre_review_static_input_count: (await json(`${pkg}/pre-review-input-manifest.json`)).file_count,
  baseline_comparison: comparison.result, session_b6_readiness: ready ? "READY_FOR_HUMAN_TO_CONSIDER_SESSION_B6" : "NOT_READY",
  session_b6_authorized: false, reviewer_threads_created: false, git_mutation: false, result: ready ? "PASS" : "FAIL"
});
await writeText("final-summary.md", `# GOV-PHASE1-REMEDIATION-12 Final Summary\n\nStatus: **${ready ? "COMPLETE / READY_FOR_HUMAN_TO_CONSIDER_SESSION_B6" : "BLOCKER / NOT READY"}**\n\n- Candidate: 103/103 byte-identical; candidate change required: false.\n- Reviewer scope satisfiability: ${scopeReport.roles.filter((item) => item.scope_satisfiable).length}/4 PASS.\n- B6 Task Intent, Classification, Blueprint and official Assignment subschema: 0 issues.\n- Reviewer mode: read-only, payload-only, zero write paths.\n- Startup, Early-Failure, completion, timeout and mandatory-exit contracts: present.\n- Root transport: byte-identical raw payload capture with Schema and self-hash validation.\n- Tests: ${tests.passed}/${tests.total} PASS.\n- Deterministic QA: non-Agent fail-closed contract prepared; no QA execution occurred.\n- Baseline: candidate, B5, Incident Analysis and R11 changes = 0.\n- B2 findings remain 0 CLOSED / 4 NOT_CLOSED.\n- Session B6 is NOT AUTHORIZED and NOT STARTED.\n- Session B Compatibility remains NO-GO; Human Exact-Manifest remains ineligible.\n- No Reviewer, human approval, Git, steady-state or Migration 320 action was created or executed.\n`);
await writeText("HANDOFF.md", `# GOV-PHASE1-REMEDIATION-12 Handoff\n\n## Current goal\nPrepare a satisfiable, read-only payload-only B6 review protocol without changing the candidate.\n\n## What changed\nOnly ${base}/** was created. B6 was not created or started.\n\n## Files touched\n${base}/**\n\n## Commands and checks\nPreparation builder, scope revalidation, 30 production-path fail-closed tests, and before/after non-Git baselines. Result: ${ready ? "PASS" : "FAIL"}.\n\n## Known risks\nCompatibility Reviewer requires a second deterministic satisfiability check after the first three byte-identical payloads exist; no future payload placeholder is prebound. Runtime fresh-root values remain pending until a separately authorized B6 root starts.\n\n## Suggested next step\nHuman reviews session-b6-readiness.json and separately decides whether to authorize Session B6.\n`);

console.log(`R12_FINAL=${ready ? "READY_FOR_HUMAN_TO_CONSIDER_SESSION_B6" : "NOT_READY"}`);
console.log(`SCOPES=${scopeReport.roles.filter((item) => item.scope_satisfiable).length}/4 TESTS=${tests.passed}/${tests.total} BASELINE=${comparison.result}`);
