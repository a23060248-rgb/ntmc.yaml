import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDeclaredScanContract, declaredFindingClasses } from "../../scripts/lib/governance/scanner-pipeline.mjs";
import { validateProposedDomainRegistry } from "../../scripts/lib/governance/proposed-domain-rules.mjs";
import { projectLifecycleState } from "../../scripts/lib/governance/lifecycle-projection.mjs";

const runFile = promisify(execFile);
const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const writeJson = (name, value) => writeFile(path.join(taskDir, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "w" });
const parsePrefix = (output, prefix) => {
  const line = output.split(/\r?\n/).findLast((item) => item.startsWith(prefix));
  if (!line) throw new Error(`Missing output prefix ${prefix}`);
  return JSON.parse(line.slice(prefix.length));
};
async function run(relativeScript) {
  return runFile(process.execPath, [relativeScript], { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}

const fixtureOutput = await run(".codex/tests/run-governance-fixtures.mjs");
const fixtureReport = parsePrefix(fixtureOutput.stdout, "FIXTURE_REPORT ");
const fixtureSummary = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-5",
  command: "node .codex/tests/run-governance-fixtures.mjs",
  suite_id: fixtureReport.suite_id,
  suite_version: fixtureReport.suite_version,
  case_manifest_sha256: fixtureReport.case_manifest_sha256,
  total: fixtureReport.cases.length,
  passed: fixtureReport.cases.filter((item) => item.pass).length,
  failed: fixtureReport.cases.filter((item) => !item.pass).map((item) => item.case_id),
  exact_case_ids: fixtureReport.cases.map((item) => item.case_id),
  required_artifact_hash_cases: fixtureReport.cases.filter((item) => item.artifact_hash).map((item) => ({ case_id: item.case_id, artifact_hash: item.artifact_hash })),
  all_cases_record_production_entrypoint: fixtureReport.cases.every((item) => item.production_entrypoint),
  all_cases_record_asserted_invariant: fixtureReport.cases.every((item) => item.asserted_invariant),
  cleanup_result: fixtureReport.cleanup_result,
  caller_run_id_trusted: false,
  result: fixtureReport.cases.every((item) => item.pass) ? "PASS" : "FAIL"
};
await writeJson("fixture-results.json", fixtureSummary);

const mutationOutput = await run(".codex/tests/run-phase15-mutation-tests.mjs");
const mutation = parsePrefix(mutationOutput.stdout, "MUTATION_TESTS ");
await writeJson("mutation-results.json", { schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-5", command: "node .codex/tests/run-phase15-mutation-tests.mjs", ...mutation, result: mutation.failed === 0 && mutation.killed === mutation.total ? "PASS" : "FAIL" });

const productionOutput = await run(".codex/tests/run-phase15-production-integration.mjs");
const production = parsePrefix(productionOutput.stdout, "PRODUCTION_PATH_INTEGRATION ");
await writeJson("production-integration-results.json", {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-5",
  command: "node .codex/tests/run-phase15-production-integration.mjs",
  total: production.total,
  passed: production.passed,
  failed: production.failed,
  layers: production.layers,
  cases: production.results.map((item) => ({ case_id: item.case_id, invariant: item.invariant, pass: item.pass, exit_code: item.exit_code, calculated_gate: item.calculated_gate })),
  result: production.failed === 0 ? "PASS" : "FAIL"
});

const concurrencyOutput = await run(".codex/tests/run-governance-fixtures-concurrency.mjs");
const concurrency = parsePrefix(concurrencyOutput.stdout, "CONCURRENCY_ISOLATION ");
await writeJson("concurrency-results.json", {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-5",
  command: "node .codex/tests/run-governance-fixtures-concurrency.mjs",
  reports_valid: concurrency.reports_valid,
  unique_run_roots: concurrency.unique_run_roots,
  caller_ids_ignored: concurrency.caller_ids_ignored,
  unique_case_roots: concurrency.unique_case_roots,
  case_roots_owned: concurrency.case_roots_owned,
  adversarial_reports_rejected: concurrency.adversarial_reports_rejected,
  adversarial_results: concurrency.adversarial_results,
  suite_id: concurrency.suite_id,
  suite_version: concurrency.suite_version,
  case_manifest_sha256: concurrency.case_manifest_sha256,
  child_count: concurrency.results.length,
  cases_per_child: concurrency.results.map((item) => item.case_count),
  cleanup_results: concurrency.results.map((item) => item.cleanup_result),
  result: concurrency.passed ? "PASS" : "FAIL"
});

const scanContract = JSON.parse(await readFile(path.join(root, ".codex/governance/scan-contract.yaml"), "utf8"));
const scanViolations = validateDeclaredScanContract(scanContract);
await writeJson("scan-contract-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-5", contract_id: scanContract.scan_contract_id, contract_version: scanContract.scan_contract_version, declared_finding_classes: [...scanContract.finding_classes].sort(), implemented_finding_classes: declaredFindingClasses(), canonicalization: scanContract.normalization, violations: scanViolations, result: scanViolations.length ? "FAIL" : "PASS" });

const domain = JSON.parse(await readFile(path.join(root, ".codex/domain/index.yaml"), "utf8"));
const domainViolations = validateProposedDomainRegistry(domain);
await writeJson("domain-rule-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-5", registry_type: domain.registry_type, is_complete_domain_knowledge_base: domain.is_complete_domain_knowledge_base, phase1_confirmation_supported: domain.phase1_confirmation_supported, confirmed_rule_count: domain.confirmed_rule_count, applicable_rules: domain.applicable_rules, candidate_rule_count: domain.candidate_rules.length, statuses: [...new Set(domain.rules.map((item) => item.status))].sort(), violations: domainViolations, result: domainViolations.length ? "FAIL" : "PASS" });

const eventLog = JSON.parse(await readFile(path.join(root, ".codex/governance/lifecycle-events.json"), "utf8"));
const lifecycle = projectLifecycleState({ event_log: eventLog, generated_at: "2026-07-18T01:00:00+08:00" });
await writeJson("lifecycle-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-5", authority: lifecycle.projection?.authority ?? null, used_as_gate_input: lifecycle.projection?.used_as_gate_input ?? null, active_task: lifecycle.projection?.active_task ?? null, active_task_state: lifecycle.projection?.active_task_state ?? null, last_completed_review: lifecycle.projection?.last_completed_review ?? null, last_review_outcome: lifecycle.projection?.last_review_outcome ?? null, gates: lifecycle.projection ? { candidate_governance_review_gate: lifecycle.projection.candidate_governance_review_gate, governance_commit_preparation_gate: lifecycle.projection.governance_commit_preparation_gate, governance_commit_execution_gate: lifecycle.projection.governance_commit_execution_gate, migration_320_execution_gate: lifecycle.projection.migration_320_execution_gate } : null, violations: lifecycle.violations, result: lifecycle.violations.length ? "FAIL" : "PASS" });

console.log(`REMEDIATION_EVIDENCE fixture=${fixtureSummary.result} mutation=${mutation.failed === 0 ? "PASS" : "FAIL"} production=${production.failed === 0 ? "PASS" : "FAIL"} concurrency=${concurrency.passed ? "PASS" : "FAIL"} scanner=${scanViolations.length ? "FAIL" : "PASS"} domain=${domainViolations.length ? "FAIL" : "PASS"} lifecycle=${lifecycle.violations.length ? "FAIL" : "PASS"}`);
