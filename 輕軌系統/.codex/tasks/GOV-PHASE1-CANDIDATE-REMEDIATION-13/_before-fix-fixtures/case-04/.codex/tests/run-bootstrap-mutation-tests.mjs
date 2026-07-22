import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scopedRoots = ["AGENTS.md", ".agents", ".codex/agents", ".codex/blueprints", ".codex/checklists", ".codex/config.toml", ".codex/domain", ".codex/environment", ".codex/governance", ".codex/meta-rules", ".codex/scripts", ".codex/tests", ".codex/workflows", ".codex/tasks/GOV-M320-DRYRUN"];
const prod = ".codex/tests/run-bootstrap-production-integration.mjs";
const scanner = ".codex/tests/run-bootstrap-scanner-production.mjs";
const replace = (before, after) => (text) => text.replace(before, after);
const replaceLine = (needle, replacement) => (text) => text.split(/\r?\n/).map((line) => line.includes(needle) ? replacement : line).join("\n");
const candidateInput = "candidate_gate_blockers: candidateReasons,";

const mutations = [
  {id: "MUT-GATE-01-CANDIDATE-REQUIRES-FINAL", runner: prod, expected_failed_case: "PROD-GATE-01", changes: [{ref: ".codex/scripts/validate-task.mjs", mutate: replace(candidateInput, "candidate_gate_blockers: [...candidateReasons, ...(approvalByStage.get(\"final_commit_approval\")?.status === \"approved\" ? [] : [\"FINAL_APPROVAL_REVERSE_EDGE\"])],")}]},
  {id: "MUT-GATE-02-CANDIDATE-REQUIRES-SESSION-B", runner: prod, expected_failed_case: "PROD-GATE-01", changes: [{ref: ".codex/scripts/validate-task.mjs", mutate: replace(candidateInput, "candidate_gate_blockers: [...candidateReasons, ...(approval?.session_b_outcome === \"PASS\" ? [] : [\"SESSION_B_REVERSE_EDGE\"])],")}]},
  {id: "MUT-GATE-03-CANDIDATE-REQUIRES-STEADY-ANCHOR", runner: prod, expected_failed_case: "PROD-GATE-01", changes: [{ref: ".codex/scripts/validate-task.mjs", mutate: replace(candidateInput, "candidate_gate_blockers: [...candidateReasons, ...(approval?.bootstrap_commit_sha ? [] : [\"STEADY_ANCHOR_REVERSE_EDGE\"])],")}]},
  {id: "MUT-GATE-04-M320-INTO-CANDIDATE", runner: prod, expected_failed_case: "PROD-GATE-01", changes: [{ref: ".codex/scripts/validate-task.mjs", mutate: replace(candidateInput, "candidate_gate_blockers: [...candidateReasons, ...migrationReasons],")}]},
  {id: "MUT-GATE-05-CALCULATED-GATE-AS-INPUT", runner: prod, expected_failed_case: "PROD-GATE-07", changes: [{ref: ".codex/scripts/validate-task.mjs", mutate: replace(candidateInput, "candidate_gate_blockers: [...candidateReasons, ...(findings?.calculated_gate === \"NO-GO\" ? [\"DERIVED_CALCULATED_GATE_INPUT\"] : [])],")}]},
  {id: "MUT-GATE-06-ELIGIBILITY-AS-INPUT", runner: prod, expected_failed_case: "PROD-GATE-08", changes: [{ref: ".codex/scripts/validate-task.mjs", mutate: replace(candidateInput, "candidate_gate_blockers: [...candidateReasons, ...(findings?.eligible_to_start_session_b === false ? [\"DERIVED_ELIGIBILITY_INPUT\"] : [])],")}]},
  {id: "MUT-GATE-07-MISSING-ANCHOR-ENABLES-PREPARATION", runner: prod, expected_failed_case: "PROD-GATE-02", changes: [{ref: ".codex/scripts/lib/governance/gate-router.mjs", mutate: replace('const preparation = anchorMissing.length ? gate("DISABLED", anchorMissing) : gate("NO-GO", ["POST_BOOTSTRAP_PREPARATION_POLICY_NOT_AUTHORIZED"]);', 'const preparation = anchorMissing.length ? gate("GO", []) : gate("NO-GO", ["POST_BOOTSTRAP_PREPARATION_POLICY_NOT_AUTHORIZED"]);')}]},
  {id: "MUT-GATE-08-MISSING-ANCHOR-ENABLES-EXECUTION", runner: prod, expected_failed_case: "PROD-GATE-02", changes: [{ref: ".codex/scripts/lib/governance/gate-router.mjs", mutate: replace('const execution = anchorMissing.length ? gate("DISABLED", anchorMissing) : gate("NO-GO", ["STEADY_STATE_EXECUTION_NOT_ENABLED"]);', 'const execution = anchorMissing.length ? gate("GO", []) : gate("NO-GO", ["STEADY_STATE_EXECUTION_NOT_ENABLED"]);')}]},
  {id: "MUT-DOMAIN-01-EXTERNAL-AS-MECHANISM", runner: prod, expected_failed_case: "PROD-DOMAIN-01", changes: [{ref: ".codex/scripts/lib/governance/domain-review-routing.mjs", mutate: replace('if (!["PASS", "PASS_WITH_CONDITIONS"].includes(checked.mechanism_outcome))', 'if (!["PASS", "PASS_WITH_CONDITIONS"].includes(checked.mechanism_outcome) || checked.external_decisions.some((item) => item.outcome !== "RESOLVED"))')}]},
  {id: "MUT-SCHEMA-01-SKIP-DOMAIN-SCHEMA", runner: prod, expected_failed_case: "PROD-SCHEMA-06", changes: [{ref: ".codex/scripts/validate-task.mjs", mutate: replaceLine("else for (const issue of validateSchema(dedicatedSchema", "        else for (const issue of []) errors.push(`SCHEMA ${issue}`);")}]},
  {id: "MUT-SCAN-01-TRUST-REPORT-CLAIM", runner: prod, expected_failed_case: "PROD-SCAN-09", changes: [{ref: ".codex/scripts/lib/governance/scanner-report.mjs", mutate: replace('if (results.declared_contract_executed !== true) violations.push("SCANNER_REPORT declared_contract_executed must be true.");', 'if (false && results.declared_contract_executed !== true) violations.push("SCANNER_REPORT declared_contract_executed must be true.");')}]},
  {id: "MUT-SCAN-02-SKIP-CONTRACT-HASH", runner: prod, expected_failed_case: "PROD-SCAN-02", changes: [
    {ref: ".codex/scripts/lib/governance/scanner-report.mjs", mutate: replace("for (const [field, value] of Object.entries(bundle.hashes))", 'for (const [field, value] of Object.entries(bundle.hashes).filter(([field]) => field !== "contract_sha256"))')},
    {ref: ".codex/scripts/validate-task.mjs", mutate: replace("scan_contract_sha256: scanBundle?.hashes?.contract_sha256", "scan_contract_sha256: undefined")}
  ]},
  {id: "MUT-SCAN-03-SKIP-SCANNED-FILE-SET", runner: prod, expected_failed_case: "PROD-SCAN-05", changes: [{ref: ".codex/scripts/lib/governance/scanner-report.mjs", mutate: replace('if (binding.scanned_file_set_sha256 !== canonicalSha256(sortedScanned)) violations.push("SCANNER_REPORT scanned file-set binding mismatch.");', 'if (false && binding.scanned_file_set_sha256 !== canonicalSha256(sortedScanned)) violations.push("SCANNER_REPORT scanned file-set binding mismatch.");')}]},
  {id: "MUT-SCAN-04-ALLOW-UNREGISTERED-CLASS", runner: prod, expected_failed_case: "PROD-SCAN-08", changes: [{ref: ".codex/scripts/lib/governance/scanner-report.mjs", mutate: replace("if (!registry.has(finding.finding_class)) violations.push", "if (false && !registry.has(finding.finding_class)) violations.push")}]},
  {id: "MUT-SCAN-05-SKIP-PAYLOAD-HASH", runner: prod, expected_failed_case: "PROD-SCAN-10", changes: [{ref: ".codex/scripts/lib/governance/scanner-report.mjs", mutate: replace("if (report?.report_payload_sha256 !== canonicalSha256(scannerReportPayload(report))) violations.push", "if (false && report?.report_payload_sha256 !== canonicalSha256(scannerReportPayload(report))) violations.push")}]},
  {id: "MUT-SCAN-06-SKIP-UNICODE", runner: scanner, expected_failed_case: "SCAN-UNICODE-CREDENTIAL-P", changes: [{ref: ".codex/scripts/lib/governance/scanner-pipeline.mjs", mutate: replace('add(decodeJsonEscapesOnce(raw), ["raw-text", "json-unescape-once"]);', 'add(raw, ["raw-text", "json-unescape-once"]);')}]},
  {id: "MUT-SCAN-07-SKIP-BASIC", runner: scanner, expected_failed_case: "SCAN-BASIC-P", changes: [{ref: ".codex/scripts/lib/governance/scanner-pipeline.mjs", mutate: replaceLine('["BASIC_AUTH"', '  ["BASIC_AUTH", /a^/],')}]},
  {id: "MUT-SCAN-08-SKIP-COOKIE", runner: scanner, expected_failed_case: "SCAN-COOKIE-P", changes: [{ref: ".codex/scripts/lib/governance/scanner-pipeline.mjs", mutate: replaceLine('["COOKIE_HEADER"', '  ["COOKIE_HEADER", /a^/],')}]},
  {id: "MUT-SCAN-09-SKIP-URLSAFE-ENTROPY", runner: scanner, expected_failed_case: "SCAN-ENTROPY-P", changes: [{ref: ".codex/scripts/lib/governance/scanner-pipeline.mjs", mutate: replace("if (entropy(candidate) >= SCAN_CONTRACT.entropyMinimumBits)", "if (entropy(candidate) >= 99)")}]},
  {id: "MUT-SCAN-10-SKIP-NON-UTF8", runner: scanner, expected_failed_case: "SCAN-NON-UTF8-P", changes: [{ref: ".codex/scripts/lib/governance/scanner-pipeline.mjs", mutate: replace('return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.isBuffer(input) ? input : Buffer.from(input));', 'return (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString("utf8");')}]},
  {id: "MUT-SCHEMA-02-ALLOW-UNKNOWN", runner: prod, expected_failed_case: "PROD-SCHEMA-01", changes: [{ref: ".codex/scripts/lib/schema-validator.mjs", mutate: replace("if (nodeSchema.additionalProperties === false)", "if (false && nodeSchema.additionalProperties === false)")}]},
  {id: "MUT-DOMAIN-02-GENERIC-META-BUSINESS", runner: prod, expected_failed_case: "PROD-DOMAIN-05", changes: [{ref: ".codex/scripts/lib/governance/rule-class.mjs", mutate: replace("if (businessCategory && rule?.rule_class !== RAILWAY_CANDIDATE_CLASS)", "if (false && businessCategory && rule?.rule_class !== RAILWAY_CANDIDATE_CLASS)")}]},
  {id: "MUT-DOMAIN-03-RAILWAY-CANDIDATE-APPLICABLE", runner: prod, expected_failed_case: "PROD-DOMAIN-04", changes: [{ref: ".codex/scripts/lib/governance/rule-class.mjs", mutate: replace('if (!BOOTSTRAP_APPLICABLE_RULE_CLASSES.includes(rule.rule_class) || rule.status !== "confirmed")', 'if (rule.status !== "confirmed" && rule.rule_class !== RAILWAY_CANDIDATE_CLASS)')}]},
  {id: "MUT-REVIEWER-01-ALLOW-SUBSTITUTED-ROLE", runner: prod, expected_failed_case: "PROD-REVIEWER-01", changes: [
    {ref: ".codex/scripts/lib/governance/reviewer-identity-binding.mjs", mutate: replace("if (review.reviewer !== RAILWAY_REVIEWER_ROLE)", "if (false && review.reviewer !== RAILWAY_REVIEWER_ROLE)")},
    {ref: ".codex/scripts/validate-task.mjs", mutate: replace("if (review.formal && review.reviewer !== role)", "if (false && review.formal && review.reviewer !== role)")}
  ]},
  {id: "MUT-REVIEWER-02-SYNTHESIZE-MISSING-ASSIGNMENT", runner: prod, expected_failed_case: "PROD-REVIEWER-02", changes: [{ref: ".codex/scripts/lib/governance/reviewer-identity-binding.mjs", mutate: replace("const assignments = blueprint?.review_assignments;", "const assignments = blueprint?.review_assignments?.length ? blueprint.review_assignments : [{assignment_id: review?.reviewer_binding?.task_assignment_id, required_role_id: RAILWAY_REVIEWER_ROLE, agent_profile_reference: RAILWAY_REVIEWER_PROFILE_REF, agent_profile_sha256: review?.reviewer_binding?.agent_profile_sha256, allowed_read_paths: ['.codex/**'], allowed_write_paths: [], required_review_scope: RAILWAY_REVIEW_SCOPE, execution_mode: 'read-only', implementation_participation: false}];")}]},
  {id: "MUT-REVIEWER-03-SKIP-ASSIGNMENT-PROFILE-HASH", runner: prod, expected_failed_case: "PROD-REVIEWER-06", changes: [{ref: ".codex/scripts/lib/governance/reviewer-identity-binding.mjs", mutate: replace("if (assignment.agent_profile_sha256 !== canonical.sha256)", "if (false && assignment.agent_profile_sha256 !== canonical.sha256)")}]},
  {id: "MUT-REVIEWER-04-ALLOW-WRITE-PATH", runner: prod, expected_failed_case: "PROD-REVIEWER-07", changes: [{ref: ".codex/scripts/lib/governance/reviewer-identity-binding.mjs", mutate: replace("if (!Array.isArray(assignment.allowed_write_paths) || assignment.allowed_write_paths.length !== 0)", "if (false && (!Array.isArray(assignment.allowed_write_paths) || assignment.allowed_write_paths.length !== 0))")}]},
  {id: "MUT-REVIEWER-05-SKIP-SCOPE-BINDING", runner: prod, expected_failed_case: "PROD-REVIEWER-08", changes: [{ref: ".codex/scripts/lib/governance/reviewer-identity-binding.mjs", mutate: replace("if (assignment.required_review_scope !== RAILWAY_REVIEW_SCOPE || assignment.required_review_scope !== review.review_scope)", "if (false && (assignment.required_review_scope !== RAILWAY_REVIEW_SCOPE || assignment.required_review_scope !== review.review_scope))")}]},
  {id: "MUT-REVIEWER-06-SKIP-RUN-BINDING", runner: prod, expected_failed_case: "PROD-REVIEWER-09", changes: [{ref: ".codex/scripts/lib/governance/reviewer-identity-binding.mjs", mutate: replace("if (binding.reviewer_run_id !== review.reviewer_run_id)", "if (false && binding.reviewer_run_id !== review.reviewer_run_id)")}]},
  {id: "MUT-REVIEWER-07-SKIP-SESSION-BINDING", runner: prod, expected_failed_case: "PROD-REVIEWER-10", changes: [{ref: ".codex/scripts/lib/governance/reviewer-identity-binding.mjs", mutate: replace("if (binding.session_id !== review.session_id)", "if (false && binding.session_id !== review.session_id)")}]},
  {id: "MUT-REVIEWER-08-SKIP-PROFILE-CANONICAL-ROLE", runner: prod, expected_failed_case: "PROD-REVIEWER-14", changes: [{ref: ".codex/scripts/lib/governance/reviewer-identity-binding.mjs", mutate: replace("if (profile.name !== RAILWAY_REVIEWER_ROLE || profile.canonical_role_id !== RAILWAY_REVIEWER_ROLE)", "if (false && (profile.name !== RAILWAY_REVIEWER_ROLE || profile.canonical_role_id !== RAILWAY_REVIEWER_ROLE))")}]}
];

const results = [];
for (const mutation of mutations) {
  const caseRoot = await mkdtemp(path.join(os.tmpdir(), `ntmc-${mutation.id.toLowerCase()}-`));
  for (const ref of scopedRoots) {
    const target = path.join(caseRoot, ...ref.split("/"));
    await mkdir(path.dirname(target), {recursive: true});
    await cp(path.join(sourceRoot, ...ref.split("/")), target, {recursive: true});
  }
  let mutationApplied = true;
  for (const change of mutation.changes) {
    const target = path.join(caseRoot, ...change.ref.split("/"));
    const original = await readFile(target, "utf8");
    const mutated = change.mutate(original);
    if (mutated === original) mutationApplied = false;
    await writeFile(target, mutated);
  }
  const child = mutationApplied ? spawnSync(process.execPath, [path.join(caseRoot, ...mutation.runner.split("/"))], {cwd: caseRoot, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024}) : {status: 0, stdout: "", stderr: "mutation did not apply"};
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  const expectedCaseFailed = output.includes(`FAIL ${mutation.expected_failed_case}`);
  const killed = mutationApplied && child.status !== 0 && expectedCaseFailed;
  results.push({mutation_id: mutation.id, expected_failed_case: mutation.expected_failed_case, runner: mutation.runner, targets: mutation.changes.map((item) => item.ref), mutation_applied: mutationApplied, integration_exit: child.status, expected_case_failed: expectedCaseFailed, killed, output_tail: output.slice(-1600)});
  await rm(caseRoot, {recursive: true, force: true});
}

const survived = results.filter((item) => !item.killed);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.mutation_id} killed=${item.killed} expected_case=${item.expected_failed_case} integration_exit=${item.integration_exit}`);
console.log(`BOOTSTRAP_MUTATION_TESTS ${JSON.stringify({total: results.length, killed: results.filter((item) => item.killed).length, survived: survived.length, production_entrypoints: [...new Set(results.map((item) => item.runner))], results})}`);
process.exit(survived.length ? 1 : 0);
