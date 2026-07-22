import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { sha256 } from "../../scripts/lib/governance/typed-proof.mjs";
import { validateScopeSatisfiability } from "./b6-review-protocol.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const base = ".codex/tasks/GOV-PHASE1-REMEDIATION-12";
const pkg = `${base}/session-b6-pre-review-package`;
const read = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await read(ref)).toString("utf8"));
const info = async (ref) => { const body = await read(ref); return { path: ref, sha256: sha256(body), byte_size: body.length }; };
const overwrite = async (ref, value) => { const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); await writeFile(path.join(root, ...ref.split("/")), body); return { path: ref, sha256: sha256(body), byte_size: body.length }; };
const roles = [
  ["code-reviewer", "code-reviewer-scope.json"], ["security-reviewer", "security-reviewer-scope.json"],
  ["railway-domain-reviewer", "railway-domain-reviewer-scope.json"], ["compatibility-reviewer", "compatibility-reviewer-scope.json"]
];
const previous = await json(`${pkg}/reviewer-capability-artifact-matrix.json`);
const matrix = { ...previous, roles: [] };
for (const [role, file] of roles) {
  const scope = await json(`${pkg}/reviewer-scopes/${file}`);
  const prior = previous.roles.find((item) => item.reviewer_role === role);
  const capabilities = [];
  for (const item of prior.capabilities) capabilities.push({ ...item, expected_sha256: (await info(item.artifact_path)).sha256, exists: true });
  matrix.roles.push({ ...prior, scope_sha256: scope.scope_sha256, capability_count: capabilities.length, capabilities });
}
const matrixPkg = await overwrite(`${pkg}/reviewer-capability-artifact-matrix.json`, matrix);
await overwrite(`${base}/reviewer-capability-artifact-matrix.json`, matrix);
const report = { schema_version: 1, task_id: "GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW", contract_path: `${pkg}/reviewer-scope-satisfiability-contract.json`, capability_matrix_path: matrixPkg.path, capability_matrix_sha256: matrixPkg.sha256, roles: [], scope_satisfiable: true, dispatch_authorized: true, result: "PASS" };
for (const [role, file] of roles) {
  const scope = await json(`${pkg}/reviewer-scopes/${file}`), matrixRole = matrix.roles.find((item) => item.reviewer_role === role);
  const result = await validateScopeSatisfiability({ projectRoot: root, scope, capabilityEntries: matrixRole.capabilities });
  report.roles.push({ reviewer_role: role, scope_path: `${pkg}/reviewer-scopes/${file}`, scope_sha256: scope.scope_sha256, scope_satisfiable: result.scope_satisfiable, dispatch_authorized: result.dispatch_authorized, issue_count: result.issues.length, issues: result.issues, capability_checks_passed: result.checks.filter((item) => item.result === "PASS").length, capability_checks_total: result.checks.length, dynamic_runtime_revalidation_required: role === "compatibility-reviewer" });
  if (!result.scope_satisfiable) { report.scope_satisfiable = false; report.dispatch_authorized = false; report.result = "FAIL"; }
}
const reportPkg = await overwrite(`${pkg}/reviewer-scope-satisfiability-report.json`, report);
await overwrite(`${base}/reviewer-scope-satisfiability-report.json`, report);
const dispatch = await json(`${pkg}/reviewer-dispatch-plan.json`);
dispatch.scope_satisfiability_report = reportPkg;
dispatch.result = report.result;
await overwrite(`${pkg}/reviewer-dispatch-plan.json`, dispatch);
console.log(`R12_SCOPE_REVALIDATION=${report.result} SATISFIABLE=${report.roles.filter((item) => item.scope_satisfiable).length}/4`);
