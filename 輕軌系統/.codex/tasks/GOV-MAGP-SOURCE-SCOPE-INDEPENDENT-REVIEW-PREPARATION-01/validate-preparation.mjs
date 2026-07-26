import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import childProcess from "node:child_process";
import { fileURLToPath } from "node:url";

const TASK_ROOT = path.dirname(fileURLToPath(import.meta.url));
const TASKS_ROOT = path.dirname(TASK_ROOT);
const TARGET_ROOT = path.join(TASKS_ROOT, "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01");
const SOURCE_ROOT = "C:/Users/a2306/Desktop/MAGP-Reference-Sources";
const REVIEWER_DIRS = ["source-integrity-review", "source-authority-review", "scope-contamination-review", "compatibility-review"];
const AGGREGATOR_DIR = path.join(TASK_ROOT, "review-packages", "source-scope-aggregation-r1");
const args = Object.fromEntries(Array.from({ length: Math.floor(process.argv.slice(2).length / 2) }, (_, i) => [process.argv[2 + i * 2]?.replace(/^--/, ""), process.argv[3 + i * 2]]));
const mode = args.mode || "preparation";
const output = args.output || path.join(TASK_ROOT, "package-contract-tests.json");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const shaBytes = (b) => crypto.createHash("sha256").update(b).digest("hex").toUpperCase();
const shaFile = (p) => shaBytes(fs.readFileSync(p));
const jcs = (value) => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JCS_NON_FINITE");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
  throw new TypeError("JCS_UNSUPPORTED_TYPE");
};
const jcsSha = (value) => shaBytes(Buffer.from(jcs(value), "utf8"));
const writeJson = (p, value) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const exists = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
const check = (id, requirement, pass, evidence) => ({ check_id: id, requirement, status: pass ? "PASS" : "FAIL", evidence });
const hasWildcard = (p) => p.includes("*") || p.includes("?") || p.includes("[") || p.includes("]");
const isAbsoluteNormalized = (p) => /^[A-Za-z]:\//.test(p) && !p.includes("\\") && !hasWildcard(p);
const allFiles = (root) => {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...allFiles(p));
    else if (entry.isFile()) result.push(p);
  }
  return result;
};

const targetManifest = readJson(path.join(TASK_ROOT, "review-target-manifest.json"));
const targetRecord = readJson(path.join(TASK_ROOT, "review-target-canonical-record.json"));
const sourceBinding = readJson(path.join(TASK_ROOT, "source-hash-binding.json"));
const sourceIdentity = readJson(path.join(TASK_ROOT, "source-identity-reverification.json"));
const sourceRegister = readJson(path.join(TARGET_ROOT, "source-scope-register.yaml"));
const targetValidation = readJson(path.join(TARGET_ROOT, "source-scope-validation-results.json"));
const candidateIntegrity = readJson(path.join(TASK_ROOT, "candidate-and-governance-integrity.json"));
const historicalIntegrity = readJson(path.join(TASK_ROOT, "historical-artifact-integrity.json"));
const identityRegistry = readJson(path.join(TASK_ROOT, "reviewer-identity-registry.json"));

const targetPresence = targetManifest.artifacts.map((a) => exists(path.join(TARGET_ROOT, a.normalized_relative_path)));
const machineReadable = targetManifest.artifacts.filter((a) => a.machine_readable);
const machineParse = machineReadable.map((a) => {
  try { JSON.parse(fs.readFileSync(path.join(TARGET_ROOT, a.normalized_relative_path), "utf8")); return true; } catch { return false; }
});
const targetHashMatches = targetManifest.artifacts.map((a) => exists(path.join(TARGET_ROOT, a.normalized_relative_path)) && shaFile(path.join(TARGET_ROOT, a.normalized_relative_path)) === a.sha256 && fs.statSync(path.join(TARGET_ROOT, a.normalized_relative_path)).size === a.file_size_bytes);
const sourceDiskFiles = fs.readdirSync(SOURCE_ROOT, { withFileTypes: true }).filter((e) => e.isFile());
const sourceHashMatches = sourceBinding.sources.map((s) => exists(path.join(SOURCE_ROOT, s.actual_filename)) && shaFile(path.join(SOURCE_ROOT, s.actual_filename)) === s.sha256 && fs.statSync(path.join(SOURCE_ROOT, s.actual_filename)).size === s.file_size_bytes);
const magp03 = sourceIdentity.sources.find((s) => s.source_id === "SOURCE-MAGP-03");
const expectedStem = "使用Codex去開發MAGP平台前置設計與策剠規劃";
const actualStem = magp03.actual_filename.normalize("NFC").slice(0, -path.extname(magp03.actual_filename).length);
const targetRequirement = (name) => targetValidation.checks.find((c) => c.requirement === name);

const reviewerPackageChecks = REVIEWER_DIRS.map((dirName) => {
  const root = path.join(TASK_ROOT, "review-packages", dirName);
  const manifest = readJson(path.join(root, "package-manifest.json"));
  const artifactsValid = manifest.package_core.artifacts.every((a) => exists(path.join(root, a.normalized_relative_path)) && shaFile(path.join(root, a.normalized_relative_path)) === a.sha256 && fs.statSync(path.join(root, a.normalized_relative_path)).size === a.file_size_bytes);
  return { dirName, root, manifest, valid: jcsSha(manifest.package_core) === manifest.package_core_sha256 && artifactsValid };
});
const launchChecks = reviewerPackageChecks.map(({ root, manifest }) => {
  const envelope = readJson(path.join(root, "absolute-launch-envelope.json"));
  const core = envelope.launch_core;
  return jcsSha(core) === envelope.launch_core_sha256 &&
    core.package_core_sha256 === manifest.package_core_sha256 &&
    shaFile(core.package_manifest_absolute_path) === core.package_manifest_sha256 &&
    shaFile(core.package_verification_absolute_path) === core.package_verification_sha256 &&
    shaFile(core.standalone_prompt_absolute_path) === core.standalone_prompt_sha256 &&
    shaFile(core.exact_read_scope_absolute_path) === core.exact_read_scope_sha256;
});
const exactScopeChecks = reviewerPackageChecks.map(({ root }) => {
  const scope = readJson(path.join(root, "exact-read-scope.json"));
  const paths = scope.exact_absolute_path_allowlist.map((e) => e.absolute_path);
  return scope.scope_mode === "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY" && paths.length === scope.allowed_path_count &&
    new Set(paths).size === paths.length && paths.every(isAbsoluteNormalized) && scope.implicit_paths_allowed === false && scope.out_of_scope_read_requires_blocker === true;
});
const returnSchemaChecks = reviewerPackageChecks.map(({ root }) => {
  const schema = readJson(path.join(root, "return-payload.schema.json"));
  return schema.$ref === "../../reviewer-return-payload.schema.json" && schema.$schema === "https://json-schema.org/draft/2020-12/schema";
});
const transportSchemas = allFiles(TASK_ROOT).filter((p) => path.basename(p).toLowerCase().includes("transport") && path.basename(p).toLowerCase().endsWith("schema.json"));
const aggregatorManifest = readJson(path.join(AGGREGATOR_DIR, "package-manifest.json"));
const aggregatorArtifactsValid = aggregatorManifest.package_core.artifacts.every((a) => exists(path.join(AGGREGATOR_DIR, a.normalized_relative_path)) && shaFile(path.join(AGGREGATOR_DIR, a.normalized_relative_path)) === a.sha256 && fs.statSync(path.join(AGGREGATOR_DIR, a.normalized_relative_path)).size === a.file_size_bytes);
const aggregatorHashValid = jcsSha(aggregatorManifest.package_core) === aggregatorManifest.package_core_sha256 && aggregatorArtifactsValid;
const writer = path.join(AGGREGATOR_DIR, "canonical-json-writer.mjs");
const writerContract = readJson(path.join(AGGREGATOR_DIR, "canonical-writer-contract.json"));
const writerSyntax = childProcess.spawnSync(process.execPath, ["--check", writer], { encoding: "utf8" });
const writerPositive = childProcess.spawnSync(process.execPath, [writer, "--self-test"], { encoding: "utf8" });
const writerNegative = childProcess.spawnSync(process.execPath, [writer, "--negative-self-test"], { encoding: "utf8" });
const writerValid = writerSyntax.status === 0 && writerPositive.status === 0 && writerPositive.stdout.trim() === "PASS" && writerNegative.status === 0 && writerNegative.stdout.trim() === "PASS" && writerContract.canonicalization === "RFC8785_JCS" && writerContract.trailing_newline_allowed === false && writerContract.output_top_level_fields_exactly.join(",") === "payload_core,payload_core_sha256";
const architectureTask = path.join(TASKS_ROOT, "GOV-MAGP-SOURCE-AUTHORITY-AND-ARCHITECTURE-RECONCILIATION-01");
const coreObjectTask = path.join(TASKS_ROOT, "GOV-MAGP-CORE-OBJECT-LIBRARY-IMPLEMENTATION-01");

const checks = [
  check("QA-01", "Review target artifact count matches the frozen canonical record", targetManifest.artifact_count === targetRecord.record_core.artifact_count && targetManifest.artifacts.length === targetManifest.artifact_count, { expected: targetRecord.record_core.artifact_count, actual: targetManifest.artifacts.length }),
  check("QA-02", "Required artifact count matches the frozen canonical record", targetManifest.required_artifact_count === targetRecord.record_core.required_artifact_count, { expected: targetRecord.record_core.required_artifact_count, actual: targetManifest.required_artifact_count }),
  check("QA-03", "Required artifacts are 100 percent present", targetPresence.every(Boolean), { present_count: targetPresence.filter(Boolean).length, required_count: targetPresence.length }),
  check("QA-04", "Machine-readable artifacts are 100 percent parseable", machineParse.every(Boolean), { parse_pass_count: machineParse.filter(Boolean).length, machine_readable_count: machineParse.length }),
  check("QA-05", "Review target size and SHA-256 bindings all match", targetHashMatches.every(Boolean) && shaFile(path.join(TASK_ROOT, "review-target-manifest.json")) === targetRecord.record_core.review_target_manifest_sha256, { hash_and_size_match_count: targetHashMatches.filter(Boolean).length, artifact_count: targetHashMatches.length }),
  check("QA-06", "Source directory top-level regular file count equals 11", sourceDiskFiles.length === 11, { actual: sourceDiskFiles.length }),
  check("QA-07", "Source file SHA-256 bindings match 11 of 11", sourceHashMatches.every(Boolean), { hash_match_count: sourceHashMatches.filter(Boolean).length, source_count: sourceHashMatches.length }),
  check("QA-08", "Source identity is resolved and unique 11 of 11", sourceIdentity.source_id_count === 11 && sourceIdentity.unique_source_id_count === 11 && sourceIdentity.unique_actual_filename_count === 11 && sourceIdentity.ambiguity_count === 0 && sourceIdentity.sources.every((s) => ["VERIFIED", "RESOLVED"].includes(s.status)), { identity_status: sourceIdentity.identity_status, ambiguity_count: sourceIdentity.ambiguity_count }),
  check("QA-09", "SOURCE-MAGP-03 exact approved normalized stem matches", actualStem === expectedStem && magp03.approved_exact_stem.normalize("NFC") === expectedStem, { expected_stem: expectedStem, actual_stem: actualStem }),
  check("QA-10", "SOURCE-MAGP-03 contains U+5260 and excludes U+7565", [...actualStem].some((c) => c.codePointAt(0) === 0x5260) && ![...actualStem].some((c) => c.codePointAt(0) === 0x7565) && magp03.u5260_present === true && magp03.u7565_absent === true, { u5260_present: true, u7565_absent: true }),
  check("QA-11", "CORE_INCLUDED count equals 4", sourceRegister.counts.CORE_INCLUDED === 4 && sourceRegister.sources.filter((s) => s.classification === "CORE_INCLUDED").length === 4, { actual: sourceRegister.counts.CORE_INCLUDED }),
  check("QA-12", "OPTIONAL_PATTERN_ONLY count equals 1", sourceRegister.counts.OPTIONAL_PATTERN_ONLY === 1 && sourceRegister.sources.filter((s) => s.classification === "OPTIONAL_PATTERN_ONLY").length === 1, { actual: sourceRegister.counts.OPTIONAL_PATTERN_ONLY }),
  check("QA-13", "EXCLUDED count equals 6", sourceRegister.counts.EXCLUDED === 6 && sourceRegister.sources.filter((s) => s.source_id.startsWith("SOURCE-EXCLUDED-")).length === 6, { actual: sourceRegister.counts.EXCLUDED }),
  check("QA-14", "v1 effective reference count equals 0", targetRequirement("v1 effective reference count = 0")?.status === "PASS" && targetRequirement("v1 effective reference count = 0")?.actual === 0, { actual: targetRequirement("v1 effective reference count = 0")?.actual }),
  check("QA-15", "VET-C normative contamination count equals 0", targetRequirement("VET-C Core contamination = 0")?.status === "PASS" && targetRequirement("VET-C Core contamination = 0")?.actual === 0, { actual: targetRequirement("VET-C Core contamination = 0")?.actual }),
  check("QA-16", "Health-specific Railway Rule contamination count equals 0", targetRequirement("Health-to-Railway contamination = 0")?.status === "PASS" && targetRequirement("Health-to-Railway contamination = 0")?.actual === 0, { actual: targetRequirement("Health-to-Railway contamination = 0")?.actual }),
  check("QA-17", "Product and Candidate file change count equals 0", candidateIntegrity.product_write_count === 0 && candidateIntegrity.candidate_write_count === 0 && candidateIntegrity.product_code_changed === false && candidateIntegrity.candidate_changed === false, { product_write_count: candidateIntegrity.product_write_count, candidate_write_count: candidateIntegrity.candidate_write_count }),
  check("QA-18", "Governance baseline change count equals 0", candidateIntegrity.governance_baseline_write_count === 0 && candidateIntegrity.governance_baseline_changed === false, { governance_baseline_write_count: candidateIntegrity.governance_baseline_write_count }),
  check("QA-19", "Historical Task change count equals 0", historicalIntegrity.historical_task_write_count === 0 && historicalIntegrity.historical_tasks_changed === false && targetHashMatches.every(Boolean), { historical_task_write_count: historicalIntegrity.historical_task_write_count, frozen_hash_match_count: targetHashMatches.filter(Boolean).length }),
  check("QA-20", "Git operation count equals 0", candidateIntegrity.git_used === false && historicalIntegrity.git_used === false && targetManifest.git_used === false, { git_used: false }),
  check("QA-21", "Reviewer package identity collision count equals 0", identityRegistry.collision_checks.collision_count === 0 && Object.entries(identityRegistry.collision_checks).filter(([k]) => k.startsWith("unique_")).every(([, v]) => v === 4), identityRegistry.collision_checks),
  check("QA-22", "Reviewer package hashes are valid 4 of 4", reviewerPackageChecks.every((x) => x.valid), { valid_count: reviewerPackageChecks.filter((x) => x.valid).length, expected: 4 }),
  check("QA-23", "Reviewer launch envelopes are valid 4 of 4", launchChecks.every(Boolean), { valid_count: launchChecks.filter(Boolean).length, expected: 4 }),
  check("QA-24", "Reviewer exact read scopes are valid 4 of 4", exactScopeChecks.every(Boolean), { valid_count: exactScopeChecks.filter(Boolean).length, expected: 4 }),
  check("QA-25", "Reviewer return schemas are valid 4 of 4", returnSchemaChecks.every(Boolean) && readJson(path.join(TASK_ROOT, "reviewer-return-payload.schema.json")).required.join(",") === "payload_core,payload_core_sha256", { valid_count: returnSchemaChecks.filter(Boolean).length, expected: 4, common_wrapper: true }),
  check("QA-26", "Single canonical manual transport schema invariant passes", transportSchemas.length === 1 && shaFile(transportSchemas[0]) === shaFile(path.join(TASK_ROOT, "manual-reviewer-transport-attestation.schema.json")), { schema_count: transportSchemas.length, schema_path: transportSchemas[0]?.replaceAll("\\", "/") }),
  check("QA-27", "Aggregator package hash is valid", aggregatorHashValid, { package_core_sha256: aggregatorManifest.package_core_sha256, declared_artifact_count: aggregatorManifest.package_core.artifacts.length }),
  check("QA-28", "Aggregator canonical writer contract and positive and negative self-tests pass", writerValid, { syntax_exit_code: writerSyntax.status, positive_self_test_exit_code: writerPositive.status, negative_self_test_exit_code: writerNegative.status, canonicalization: writerContract.canonicalization }),
  check("QA-29", "No Architecture Reconciliation artifacts were created", !fs.existsSync(architectureTask), { prohibited_task_path: architectureTask.replaceAll("\\", "/"), exists: fs.existsSync(architectureTask) }),
  check("QA-30", "No Core Object Library artifacts were created", !fs.existsSync(coreObjectTask), { prohibited_task_path: coreObjectTask.replaceAll("\\", "/"), exists: fs.existsSync(coreObjectTask) }),
];

const passCount = checks.filter((c) => c.status === "PASS").length;
const result = {
  schema_version: 1,
  task_id: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
  mode,
  status: passCount === 30 ? "PASS" : "FAIL",
  pass_count: passCount,
  fail_count: 30 - passCount,
  total_count: 30,
  checks,
  review_target_unchanged: targetHashMatches.every(Boolean),
  source_root_unchanged: sourceHashMatches.every(Boolean) && sourceDiskFiles.length === 11,
  reviewer_execution_status: "NOT_STARTED_0_OF_4",
  aggregator_execution_status: "NOT_STARTED",
  source_scope_lock_review_gate: "NOT_YET_CALCULATED",
  git_used: false
};
writeJson(output, result);

if (mode === "preparation") {
  const aggregatorEnvelope = readJson(path.join(AGGREGATOR_DIR, "absolute-launch-envelope.json"));
  const aggregatorLaunchValid = jcsSha(aggregatorEnvelope.launch_core) === aggregatorEnvelope.launch_core_sha256 && aggregatorEnvelope.launch_core.package_core_sha256 === aggregatorManifest.package_core_sha256 && shaFile(aggregatorEnvelope.launch_core.package_manifest_absolute_path) === aggregatorEnvelope.launch_core.package_manifest_sha256 && shaFile(aggregatorEnvelope.launch_core.package_verification_absolute_path) === aggregatorEnvelope.launch_core.package_verification_sha256 && shaFile(aggregatorEnvelope.launch_core.standalone_prompt_absolute_path) === aggregatorEnvelope.launch_core.standalone_prompt_sha256 && shaFile(aggregatorEnvelope.launch_core.exact_read_scope_absolute_path) === aggregatorEnvelope.launch_core.exact_read_scope_sha256;
  writeJson(path.join(TASK_ROOT, "package-independent-verification.json"), {
    schema_version: 1,
    verification_method: "INDEPENDENT_RECOMPUTATION_BY_VALIDATE_PREPARATION_MJS",
    reviewer_packages: reviewerPackageChecks.map((x, i) => ({ package_directory: x.dirName, package_core_sha256: x.manifest.package_core_sha256, package_hash_valid: x.valid, launch_envelope_valid: launchChecks[i], exact_read_scope_valid: exactScopeChecks[i], return_schema_valid: returnSchemaChecks[i] })),
    aggregator_package: { package_core_sha256: aggregatorManifest.package_core_sha256, package_hash_valid: aggregatorHashValid, launch_envelope_valid: aggregatorLaunchValid, canonical_writer_valid: writerValid },
    reviewer_package_pass_count: reviewerPackageChecks.filter((x) => x.valid).length,
    launch_envelope_pass_count: launchChecks.filter(Boolean).length + (aggregatorLaunchValid ? 1 : 0),
    overall_status: reviewerPackageChecks.every((x) => x.valid) && aggregatorHashValid && launchChecks.every(Boolean) && aggregatorLaunchValid && writerValid ? "PASS" : "FAIL"
  });
  writeJson(path.join(TASK_ROOT, "launch-path-bijection-results.json"), {
    schema_version: 1,
    expected_launch_count: 5,
    reviewer_launches: reviewerPackageChecks.map((x, i) => ({ reviewer_role: x.manifest.package_core.reviewer_role, package_root: x.root.replaceAll("\\", "/"), package_core_sha256: x.manifest.package_core_sha256, launch_core_sha256: readJson(path.join(x.root, "absolute-launch-envelope.json")).launch_core_sha256, package_to_prompt_to_scope_bijection: launchChecks[i] })),
    aggregator_launch: { aggregator_role: aggregatorManifest.package_core.aggregator_role, package_root: AGGREGATOR_DIR.replaceAll("\\", "/"), package_core_sha256: aggregatorManifest.package_core_sha256, launch_core_sha256: aggregatorEnvelope.launch_core_sha256, package_to_prompt_to_scope_bijection: aggregatorLaunchValid },
    unique_package_core_sha256_count: new Set([...reviewerPackageChecks.map((x) => x.manifest.package_core_sha256), aggregatorManifest.package_core_sha256]).size,
    unique_launch_core_sha256_count: new Set([...reviewerPackageChecks.map((x) => readJson(path.join(x.root, "absolute-launch-envelope.json")).launch_core_sha256), aggregatorEnvelope.launch_core_sha256]).size,
    pass_count: launchChecks.filter(Boolean).length + (aggregatorLaunchValid ? 1 : 0),
    total_count: 5,
    status: launchChecks.every(Boolean) && aggregatorLaunchValid ? "PASS" : "FAIL"
  });
  writeJson(path.join(TASK_ROOT, "launch-readiness.json"), {
    schema_version: 1,
    review_target: targetHashMatches.every(Boolean) ? "FROZEN" : "DRIFTED",
    sources_reverified: sourceHashMatches.every(Boolean) && sourceDiskFiles.length === 11 ? "11/11" : "FAILED",
    reviewer_packages: reviewerPackageChecks.every((x) => x.valid) ? "4/4_READY" : "NOT_READY",
    aggregator_package: aggregatorHashValid && aggregatorLaunchValid && writerValid ? "READY" : "NOT_READY",
    package_contract_tests: `${passCount}/30_PASS`,
    launch_envelope_verification: `${launchChecks.filter(Boolean).length + (aggregatorLaunchValid ? 1 : 0)}/5_PASS`,
    transport_contract: transportSchemas.length === 1 ? "SINGLE_CANONICAL_SCHEMA" : "CONFLICT",
    reviewer_execution_status: "NOT_STARTED_0_OF_4",
    aggregator_execution_status: "NOT_STARTED",
    source_scope_lock_review_gate: "NOT_YET_CALCULATED",
    source_authority_status: "PROPOSED_NOT_ADOPTED",
    architecture_reconciliation_status: "PAUSED_NOT_AUTHORIZED",
    launch_readiness: passCount === 30 && aggregatorLaunchValid ? "READY_FOR_HUMAN_TO_LAUNCH_SOURCE_SCOPE_R1_TOP_LEVEL_REVIEWS" : "NOT_READY"
  });
  writeJson(path.join(TASK_ROOT, "validation-results.json"), {
    schema_version: 1,
    task_id: "GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01",
    overall_status: passCount === 30 && aggregatorLaunchValid ? "PASS" : "FAIL",
    deterministic_qa: { pass_count: passCount, total_count: 30, status: passCount === 30 ? "PASS" : "FAIL", evidence_path: output.replaceAll("\\", "/"), evidence_sha256: shaFile(output) },
    package_independent_verification: reviewerPackageChecks.every((x) => x.valid) && aggregatorHashValid ? "PASS" : "FAIL",
    launch_envelope_verification: launchChecks.every(Boolean) && aggregatorLaunchValid ? "5/5_PASS" : "FAIL",
    transport_contract: transportSchemas.length === 1 ? "SINGLE_CANONICAL_SCHEMA" : "CONFLICT",
    product_code_changed: false,
    governance_baseline_changed: false,
    historical_tasks_changed: false,
    git_used: false,
    reviewer_execution_status: "NOT_STARTED_0_OF_4",
    aggregator_execution_status: "NOT_STARTED",
    source_scope_lock_review_gate: "NOT_YET_CALCULATED"
  });
}

process.exit(passCount === 30 ? 0 : 1);
