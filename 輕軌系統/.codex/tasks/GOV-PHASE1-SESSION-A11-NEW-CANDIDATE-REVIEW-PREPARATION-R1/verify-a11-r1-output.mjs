import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-SESSION-A11-NEW-CANDIDATE-REVIEW-PREPARATION-R1";
const slash = (value) => value.replaceAll("\\", "/");
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex").toUpperCase();
function jcs(value) {
  if (value === null) return "null";
  if (["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}
const jcsSha256 = (value) => sha256(jcs(value));
const readJson = async (target) => JSON.parse(await readFile(target, "utf8"));
const { validateSchema } = await import(pathToFileURL(path.join(root, ".codex/scripts/lib/schema-validator.mjs")).href);
const packageIndex = await readJson(path.join(taskDir, "a11-r1-review-package-manifest.json"));
const packageEntries = [...packageIndex.reviewer_packages, packageIndex.aggregation_package];
const checks = [];
const check = (id, pass, evidence = null) => checks.push({ check_id: id, pass, evidence });

const rootBinding = await readJson(path.join(taskDir, "repository-root-binding.json"));
const { repository_root_binding_core_sha256: rootDigest, ...rootCore } = rootBinding;
check("ROOT_BINDING", rootDigest === jcsSha256(rootCore) && rootBinding.repository_root === slash(root));

const identities = [];
for (const entry of packageEntries) {
  const dir = entry.package_directory;
  const manifest = await readJson(path.join(dir, "package-manifest.json"));
  const verification = await readJson(path.join(dir, "package-verification.json"));
  const envelope = await readJson(path.join(dir, "absolute-launch-envelope.json"));
  const scope = await readJson(path.join(dir, "exact-read-scope.json"));
  const schema = await readJson(path.join(dir, "return-payload.schema.json"));
  const blocker = await readJson(path.join(dir, "embedded-startup-blocker-template.json"));
  const assignment = await readJson(path.join(dir, "assignment.json"));
  const promptName = entry.package_kind === "reviewer" ? "standalone-top-level-reviewer-prompt.md" : "standalone-top-level-aggregator-prompt.md";
  const prompt = await readFile(path.join(dir, promptName), "utf8");
  const promptPaths = [...prompt.matchAll(/^REQUIRED_PATH: (.+)$/gm)].map((match) => match[1]);
  const { launch_envelope_core_sha256: envelopeDigest, ...envelopeCore } = envelope;
  const componentHashesValid = (await Promise.all(manifest.package_core.core_file_hashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean);
  const launchHashesValid = (await Promise.all(envelope.launch_file_hashes.map(async (item) => sha256(await readFile(item.absolute_path)) === item.sha256))).every(Boolean);
  const wrapperFieldsValid = JSON.stringify(Object.keys(schema.properties).sort()) === JSON.stringify(["payload_core", "payload_core_sha256"]);
  const blockerSchemaErrors = validateSchema(schema, blocker, `${entry.role}:startup_blocker`);
  const blockerHashValid = blocker.payload_core_sha256 === jcsSha256(blocker.payload_core);
  check(`${entry.role}:PACKAGE_CORE`, manifest.package_core_sha256 === jcsSha256(manifest.package_core) && manifest.package_core_sha256 === entry.package_core_sha256);
  check(`${entry.role}:COMPONENT_HASHES`, componentHashesValid);
  check(`${entry.role}:ENVELOPE`, envelopeDigest === jcsSha256(envelopeCore) && envelopeDigest === entry.launch_envelope_core_sha256 && launchHashesValid);
  check(`${entry.role}:LAUNCH_BIJECTION`, JSON.stringify(promptPaths) === JSON.stringify(envelope.launch_paths) && JSON.stringify(promptPaths) === JSON.stringify(scope.launch_allowlist) && JSON.stringify(promptPaths) === JSON.stringify(manifest.launch_entries));
  check(`${entry.role}:TWO_FIELD_WRAPPER`, wrapperFieldsValid && schema.additionalProperties === false && schema.required.length === 2);
  check(`${entry.role}:STARTUP_BLOCKER_SCHEMA`, blockerSchemaErrors.length === 0 && blockerHashValid, blockerSchemaErrors);
  check(`${entry.role}:NOT_STARTED`, assignment.lifecycle === "PREPARED_NOT_STARTED" && verification.result === "PASS");
  for (const [kind, value] of Object.entries(entry.ids)) identities.push({ package: entry.role, kind, value });
}
check("IDENTITY_UNIQUENESS", new Set(identities.map((item) => item.value)).size === identities.length, identities);

const codeOwnership = await readJson(path.join(taskDir, "review-packages/code-review/finding-ownership.json"));
const codeAssignment = await readJson(path.join(taskDir, "review-packages/code-review/assignment.json"));
check("CODE_CLOSURE_AUTHORITY", codeOwnership.closure_authority.length === 1 && codeOwnership.closure_authority[0] === "B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001" && codeAssignment.finding_closure_forbidden === false);
for (const role of ["security-review", "railway-domain-review", "compatibility-review"]) {
  const ownership = await readJson(path.join(taskDir, `review-packages/${role}/finding-ownership.json`));
  check(`${role}:NO_CLOSURE_AUTHORITY`, ownership.closure_authority.length === 0 && ownership.finding_closure_forbidden === true);
}

const aggregatorAssignment = await readJson(path.join(taskDir, "review-packages/aggregation-deterministic-qa/assignment.json"));
const aggregatorScope = await readJson(path.join(taskDir, "review-packages/aggregation-deterministic-qa/exact-read-scope.json"));
const expectedWrite = ".codex/tasks/GOV-PHASE1-SESSION-A11-AGGREGATION-DETERMINISTIC-QA-R1/**";
check("AGGREGATOR_ROLE_BOUNDARY", aggregatorAssignment.is_reviewer === false && aggregatorAssignment.can_close_findings === false && aggregatorAssignment.can_modify_reviewer_outcomes === false && aggregatorAssignment.can_use_git === false);
check("AGGREGATOR_WRITE_SCOPE", JSON.stringify(aggregatorAssignment.allowed_write_paths) === JSON.stringify([expectedWrite]) && aggregatorAssignment.candidate_write_allowed === false && aggregatorAssignment.package_write_allowed === false && aggregatorAssignment.historical_artifact_write_allowed === false && aggregatorScope.all_other_write_paths_forbidden === true);
check("AGGREGATOR_PROMPT_NAME", packageIndex.aggregation_package.prompt_absolute_path.endsWith("standalone-top-level-aggregator-prompt.md") && !packageIndex.aggregation_package.prompt_absolute_path.endsWith("reviewer-prompt.md"));

const qaManifest = await readJson(path.join(taskDir, "deterministic-qa-command-manifest.json"));
const qaScriptsExist = (await Promise.all(qaManifest.commands.map(async (item) => { try { await readFile(item.exact_script_path); return true; } catch { return false; } }))).every(Boolean);
check("QA_COMMAND_MANIFEST", qaManifest.command_count >= 17 && qaScriptsExist && qaManifest.commands.every((item) => path.isAbsolute(item.exact_script_path) && path.isAbsolute(item.working_directory) && item.exact_arguments && Number.isInteger(item.timeout_ms) && Number.isInteger(item.expected_exit_code) && Number.isInteger(item.expected_case_count) && item.candidate_write_expected === false && item.network_required === false && item.service_required === false && item.database_required === false));
const rawContract = await readJson(path.join(taskDir, "fresh-qa-raw-evidence-contract.json"));
check("RAW_EVIDENCE_CONTRACT", rawContract.required_outputs.length >= 17 && rawContract.summary_only_forbidden === true && rawContract.raw_output_required === true);
const packageTests = await readJson(path.join(taskDir, "package-contract-tests.json"));
check("PACKAGE_CONTRACT_TESTS", packageTests.total >= 24 && packageTests.passed === packageTests.total && packageTests.result === "PASS");

const before = await readJson(path.join(taskDir, "review-baseline-before.json"));
const after = await readJson(path.join(taskDir, "review-baseline-after.json"));
check("CANDIDATE_BEFORE_AFTER", JSON.stringify(before.candidate.binding) === JSON.stringify(after.candidate.binding) && after.candidate.binding.candidate_file_count === 108 && after.candidate.binding.candidate_manifest_sha256 === "5D728252106E52C1FC998F0517066DD6421A4083833F7987A52D955F9A49DC0A" && after.candidate.binding.included_file_set_sha256 === "0BBFB09D13E7C6F3E28315EF09231C66093856ABABF5B85D25957F7F2CBC1C8B" && after.candidate.binding.all_manifest_hashes_match === true);
check("HISTORY_BEFORE_AFTER", JSON.stringify(before.protected_history) === JSON.stringify(after.protected_history));
const oldSupersession = await readJson(path.join(taskDir, "old-preparation-supersession.json"));
check("OLD_PREPARATION_SUPERSESSION", oldSupersession.old_task_status === "BLOCKED_PRELAUNCH_CONTRACT_DEFECT" && oldSupersession.supersession_status === "SUPERSEDED_BY_A11_PREPARATION_R1" && oldSupersession.old_task_modified === false);

const failed = checks.filter((item) => !item.pass);
const result = { schema_version: 1, task_id: taskId, check_count: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, reviewers_started: 0, aggregator_started: 0, git_used: false, result: failed.length ? "FAIL" : "PASS" };
await writeFile(path.join(taskDir, "a11-r1-independent-verification.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ result: result.result, checks: `${result.passed}/${result.check_count}`, reviewers: "NOT_STARTED", aggregator: "NOT_STARTED" }));
if (failed.length) process.exitCode = 1;
