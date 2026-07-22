import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-SESSION-A11-NEW-CANDIDATE-REVIEW-PREPARATION";
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex").toUpperCase();
function jcs(value) {
  if (value === null) return "null";
  if (["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}
const jcsSha256 = (value) => sha256(jcs(value));
const readJson = async (target) => JSON.parse(await readFile(target, "utf8"));
async function exists(target) { try { return (await stat(target)).isFile(); } catch { return false; } }

const packageIndex = await readJson(path.join(taskDir, "a11-review-package-manifest.json"));
const rootBinding = await readJson(path.join(taskDir, "repository-root-binding.json"));
const { repository_root_binding_core_sha256: rootDigest, ...rootCore } = rootBinding;
const checks = [{ check: "repository_root_binding", pass: rootDigest === jcsSha256(rootCore) && rootBinding.repository_root === root.replaceAll("\\", "/") }];
const identities = [];
for (const entry of packageIndex.packages) {
  const packageDir = entry.package_directory;
  const manifest = await readJson(path.join(packageDir, "package-manifest.json"));
  const scope = await readJson(path.join(packageDir, "exact-read-scope.json"));
  const envelope = await readJson(path.join(packageDir, "reviewer-launch-envelope.json"));
  const verification = await readJson(path.join(packageDir, "package-verification.json"));
  const assignment = await readJson(path.join(packageDir, "assignment.json"));
  const { package_core_sha256: packageDigest, ...packageCore } = manifest;
  const { scope_sha256: scopeDigest, ...scopeCore } = scope;
  const { launch_envelope_core_sha256: envelopeDigest, ...envelopeCore } = envelope;
  const componentsValid = (await Promise.all(manifest.components.map(async (component) => await exists(component.path) && sha256(await readFile(component.path)) === component.sha256))).every(Boolean);
  const startupPaths = Object.values(envelope.startup_file_absolute_paths);
  const startupAllowed = startupPaths.every((target) => scope.allowed_absolute_paths.includes(target));
  checks.push(
    { check: `${entry.review_type}:package_core`, pass: packageDigest === jcsSha256(packageCore) && packageDigest === entry.package_core_sha256 },
    { check: `${entry.review_type}:scope`, pass: scopeDigest === jcsSha256(scopeCore) && scopeDigest === entry.scope_sha256 },
    { check: `${entry.review_type}:launch_envelope`, pass: envelopeDigest === jcsSha256(envelopeCore) && envelopeDigest === entry.launch_envelope_core_sha256 },
    { check: `${entry.review_type}:components`, pass: componentsValid },
    { check: `${entry.review_type}:absolute_exact_startup`, pass: startupPaths.every(path.isAbsolute) && startupAllowed },
    { check: `${entry.review_type}:candidate_binding`, pass: envelope.candidate_binding.candidate_manifest_sha256 === packageIndex.candidate_binding.candidate_manifest_sha256 },
    { check: `${entry.review_type}:not_started`, pass: assignment.lifecycle === "PREPARED_NOT_STARTED" && verification.checks.lifecycle_not_started === true }
  );
  identities.push(entry.review_package_id, entry.assignment_id, entry.reviewer_run_id, entry.reviewer_session_nonce);
}
checks.push({ check: "unique_identities", pass: identities.length === new Set(identities).size });
const reviewerPayloadDir = path.join(taskDir, "reviewer-payloads");
checks.push({ check: "reviewers_not_started", pass: !(await exists(path.join(reviewerPayloadDir, "code-review-payload.json"))) && !(await exists(path.join(reviewerPayloadDir, "security-review-payload.json"))) && !(await exists(path.join(reviewerPayloadDir, "railway-domain-review-payload.json"))) && !(await exists(path.join(reviewerPayloadDir, "compatibility-review-payload.json"))) });
const failed = checks.filter((entry) => !entry.pass);
const result = { schema_version: 1, task_id: taskId, check_count: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, reviewer_package_count: packageIndex.packages.filter((entry) => entry.review_type !== "aggregation_qa").length, aggregation_package_count: packageIndex.packages.filter((entry) => entry.review_type === "aggregation_qa").length, reviewers: "NOT_STARTED", aggregator: "NOT_STARTED", git_used: false, result: failed.length ? "FAIL" : "PASS" };
await writeFile(path.join(taskDir, "a11-deterministic-output-verification.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ result: result.result, checks: `${result.passed}/${result.check_count}`, reviewers: result.reviewers, aggregator: result.aggregator }));
if (failed.length) process.exitCode = 1;
