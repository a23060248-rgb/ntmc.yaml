import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";
import { computeScopeSha256, validateScopeSatisfiability } from "./b6-review-protocol.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, "../../..");
const base = ".codex/tasks/GOV-PHASE1-REMEDIATION-12", pkg = `${base}/session-b6-pre-review-package`;
const read = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await read(ref)).toString("utf8"));
const info = async (ref) => { const body = await read(ref); return { path: ref, sha256: sha256(body), byte_size: body.length }; };
const overwrite = async (ref, value) => { const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); await writeFile(path.join(root, ...ref.split("/")), body); return { path: ref, sha256: sha256(body), byte_size: body.length }; };
const roles = [["code-reviewer", "code-reviewer-scope.json"], ["security-reviewer", "security-reviewer-scope.json"], ["railway-domain-reviewer", "railway-domain-reviewer-scope.json"], ["compatibility-reviewer", "compatibility-reviewer-scope.json"]];
const freshRef = `${pkg}/fresh-root-preflight.json`;
const finalBaselineRefs = [`${base}/baseline-comparison.json`, `${base}/historical-artifact-integrity.json`, `${base}/migration-320-integrity.json`];
const requiredFinalRefs = [freshRef, ...finalBaselineRefs];
const prohibitedPreReviewRefs = [`${base}/review-baseline-after.json`];
const scopes = new Map();
for (const [role, file] of roles) {
  const scope = await json(`${pkg}/reviewer-scopes/${file}`);
  scope.allowed_paths = scope.allowed_paths.filter((ref) => !prohibitedPreReviewRefs.includes(ref));
  scope.required_capabilities = scope.required_capabilities.filter((capability) => !prohibitedPreReviewRefs.some((ref) => capability === `artifact:${ref}`));
  for (const ref of requiredFinalRefs) {
    if (!scope.allowed_paths.includes(ref)) scope.allowed_paths.push(ref);
    if (!scope.required_capabilities.includes(`artifact:${ref}`)) scope.required_capabilities.push(`artifact:${ref}`);
  }
  scope.allowed_paths.sort(); scope.required_capabilities.sort(); scope.scope_sha256 = computeScopeSha256(scope);
  await overwrite(`${pkg}/reviewer-scopes/${file}`, scope); scopes.set(role, scope);
}
const oldManifest = await json(`${pkg}/pre-review-input-manifest.json`);
const refs = [...new Set([...oldManifest.files.map((item) => item.path), ...requiredFinalRefs])].filter((ref) => !prohibitedPreReviewRefs.includes(ref)).sort();
const inputs = []; for (const ref of refs) inputs.push(await info(ref));
const manifest = { ...oldManifest, file_count: inputs.length, files: inputs };
const manifestInfo = await overwrite(`${pkg}/pre-review-input-manifest.json`, manifest);
const freeze = await json(`${pkg}/pre-review-freeze.json`);
freeze.static_manifest = manifestInfo; freeze.frozen_input_count = inputs.length; freeze.frozen_input_set_sha256 = canonicalSha256(inputs.map(({ path: ref, sha256: digest }) => ({ path: ref, sha256: digest })));
const freezeInfo = await overwrite(`${pkg}/pre-review-freeze.json`, freeze);
const oldMatrix = await json(`${pkg}/reviewer-capability-artifact-matrix.json`);
const matrix = { ...oldMatrix, roles: [] };
for (const [role, file] of roles) {
  const scope = scopes.get(role), prior = oldMatrix.roles.find((item) => item.reviewer_role === role), capabilities = [];
  for (const ref of scope.allowed_paths) { const artifact = await info(ref); capabilities.push({ capability: `artifact:${ref}`, artifact_path: ref, expected_sha256: artifact.sha256, required: true, allowed: true, forbidden: false, exists: true }); }
  matrix.roles.push({ ...prior, scope_sha256: scope.scope_sha256, capability_count: capabilities.length, capabilities });
}
const matrixPkg = await overwrite(`${pkg}/reviewer-capability-artifact-matrix.json`, matrix); await overwrite(`${base}/reviewer-capability-artifact-matrix.json`, matrix);
const report = { schema_version: 1, task_id: "GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW", contract_path: `${pkg}/reviewer-scope-satisfiability-contract.json`, capability_matrix_path: matrixPkg.path, capability_matrix_sha256: matrixPkg.sha256, roles: [], scope_satisfiable: true, dispatch_authorized: true, result: "PASS" };
for (const [role, file] of roles) {
  const scope = scopes.get(role), matrixRole = matrix.roles.find((item) => item.reviewer_role === role), result = await validateScopeSatisfiability({ projectRoot: root, scope, capabilityEntries: matrixRole.capabilities });
  report.roles.push({ reviewer_role: role, scope_path: `${pkg}/reviewer-scopes/${file}`, scope_sha256: scope.scope_sha256, scope_satisfiable: result.scope_satisfiable, dispatch_authorized: result.dispatch_authorized, issue_count: result.issues.length, issues: result.issues, capability_checks_passed: result.checks.filter((item) => item.result === "PASS").length, capability_checks_total: result.checks.length, dynamic_runtime_revalidation_required: role === "compatibility-reviewer" });
  if (!result.scope_satisfiable) { report.scope_satisfiable = false; report.dispatch_authorized = false; report.result = "FAIL"; }
}
const reportPkg = await overwrite(`${pkg}/reviewer-scope-satisfiability-report.json`, report); await overwrite(`${base}/reviewer-scope-satisfiability-report.json`, report);
const dispatch = await json(`${pkg}/reviewer-dispatch-plan.json`);
dispatch.sequence = dispatch.sequence.map((item) => ({ ...item, scope_sha256: scopes.get(item.reviewer_role).scope_sha256 }));
dispatch.scope_satisfiability_report = reportPkg; dispatch.pre_review_freeze = freezeInfo; dispatch.result = report.result;
await overwrite(`${pkg}/reviewer-dispatch-plan.json`, dispatch);
console.log(`R12_PACKAGE_REFRESH=${report.result} STATIC_INPUTS=${inputs.length} SCOPES=${report.roles.filter((item) => item.scope_satisfiable).length}/4`);
