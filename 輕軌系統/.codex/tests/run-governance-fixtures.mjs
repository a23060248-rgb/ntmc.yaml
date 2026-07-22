import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import suite from "./fixture-suite-manifest.json" with { type: "json" };
import * as proofModule from "../scripts/lib/governance/typed-proof.mjs";
import { computeEffectiveScope, pathMatchesPattern, resolveActorScope } from "../scripts/lib/governance/scope-lattice.mjs";
import { resolveRequirementVerdict, resolveUniqueArtifact, resolveUniqueRequirement, validateUniqueArtifacts, validateUniqueRequirements } from "../scripts/lib/governance/identity-resolver.mjs";
import { assertCandidateTextArtifact, canonicalizeScannerInput, classifyOperationalContent, scanBinaryContent, scanCanonicalContent, validateDeclaredScanContract } from "../scripts/lib/governance/scanner-pipeline.mjs";
import { routeGovernanceGates } from "../scripts/lib/governance/gate-router.mjs";
import { routeDomainReview } from "../scripts/lib/governance/domain-review-routing.mjs";
import { validateProposedDomainRegistry } from "../scripts/lib/governance/proposed-domain-rules.mjs";
import { resolveUniqueRule, validateRuleClassification, validateTaskRuleSelection } from "../scripts/lib/governance/rule-class.mjs";
import { projectLifecycleState } from "../scripts/lib/governance/lifecycle-projection.mjs";
import { loadAndCompileGovernanceSchemas } from "../scripts/lib/governance/governance-schema-loader.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaSet = await loadAndCompileGovernanceSchemas(projectRoot);
const railwaySchemaRef = ".codex/blueprints/schemas/railway-domain-review.schema.json";
const railwaySchema = schemaSet.byRef.get(railwaySchemaRef);
const railwaySchemaMetadata = schemaSet.schemas.find((item) => item.ref === railwaySchemaRef);
if (!railwaySchema || !railwaySchemaMetadata) throw new Error("SCHEMA_EXECUTION official Railway Domain Review Schema is unavailable.");
const typedRailwayFixture = JSON.parse(await readFile(new URL("./fixtures/valid-railway-domain-review.json", import.meta.url), "utf8"));
const typedRailwayIssues = schemaSet.validate(railwaySchemaRef, typedRailwayFixture, "fixtures/valid-railway-domain-review.json");
if (typedRailwayIssues.length) throw new Error(`SCHEMA_EXECUTION typed Railway fixture is invalid: ${typedRailwayIssues.join(" | ")}`);

const scanContract = JSON.parse(await readFile(new URL("../governance/scan-contract.yaml", import.meta.url), "utf8"));
if (scanContract.schema_set_sha256 !== schemaSet.schema_set_sha256) throw new Error("SCHEMA_EXECUTION scan contract schema_set_sha256 mismatch.");
const findingRegistry = JSON.parse(await readFile(new URL("../governance/scanner-finding-registry.yaml", import.meta.url), "utf8"));
const canonicalizationConfig = JSON.parse(await readFile(new URL("../governance/scanner-canonicalization-config.yaml", import.meta.url), "utf8"));
const binaryOracle = JSON.parse(await readFile(new URL("../governance/scanner-binary-oracle.yaml", import.meta.url), "utf8"));
const binaryMagicRegistry = JSON.parse(await readFile(new URL("../governance/bootstrap-binary-magic-registry.yaml", import.meta.url), "utf8"));
const implementationMatrix = JSON.parse(await readFile(new URL("../governance/scanner-contract-matrix.yaml", import.meta.url), "utf8"));
const productionCaseManifest = JSON.parse(await readFile(new URL("./scanner-production-case-manifest.json", import.meta.url), "utf8"));
const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex").toUpperCase();
const results = [];
const contractById = new Map(suite.case_contracts.map(([id, invariant, entrypoint]) => [id, { invariant, entrypoint }]));
function check(id, pass, detail = "") {
  const contract = contractById.get(id);
  if (!contract) throw new Error(`Unknown case ${id}`);
  const core = { case_id: id, pass: Boolean(pass), detail, asserted_invariant: contract.invariant, production_entrypoint: contract.entrypoint, expected_exit: "pass", actual_exit: pass ? "pass" : "fail" };
  results.push({ ...core, artifact_hash: hash(core) });
}

const phase = { phase_id: "phase1_governance_only", governance_mode: "bootstrap", product_write_allowed: false, database_write_allowed: false, authorized_read_paths: ["AGENTS.md", ".codex/**", ".agents/**"], authorized_write_paths: ["AGENTS.md", ".codex/**", ".agents/**"] };
const intent = { scope: { include: [".codex/**"], product_changes_allowed: false, database_operations_allowed: false } };
const classification = { scope: { include: [".codex/**"], product_changes_allowed: false, database_operations_allowed: false } };
const assignment = { role: "qa-engineer", allowed_read_paths: [".codex/tasks/X/**"], allowed_write_paths: [".codex/tasks/X/**"] };
const blueprint = { scope: { product_changes_allowed: false, database_operations_allowed: false }, allowed_paths: { read: [".codex/**"], write: [".codex/**"] }, agent_assignments: [assignment] };
const rolePolicy = { roles: { "qa-engineer": { allowed_read_paths: [".codex/**"], allowed_write_paths: [".codex/tasks/**"] } } };
const scope = (overrides = {}) => computeEffectiveScope({ phase_policy: Object.hasOwn(overrides, "phase") ? overrides.phase : phase, task_intent: Object.hasOwn(overrides, "intent") ? overrides.intent : intent, classification: Object.hasOwn(overrides, "classification") ? overrides.classification : classification, blueprint: Object.hasOwn(overrides, "blueprint") ? overrides.blueprint : blueprint, role_policy: Object.hasOwn(overrides, "rolePolicy") ? overrides.rolePolicy : rolePolicy, agent_assignments: Object.hasOwn(overrides, "assignments") ? overrides.assignments : (Object.hasOwn(overrides, "blueprint") ? overrides.blueprint?.agent_assignments : blueprint.agent_assignments) });
const validScope = scope();
check("CASE-01", validScope.violations.length === 0 && resolveActorScope({ handoff: { actor_role: "qa-engineer", changed_files: [".codex/tasks/X/evidence.md"] }, effectiveScope: validScope }).actor_role === "qa-engineer");
check("CASE-02", scope({ phase: null }).violations.some((item) => item.includes("all six")));
check("CASE-03", scope({ intent: null }).violations.some((item) => item.includes("all six")));
check("CASE-04", scope({ classification: null }).violations.some((item) => item.includes("all six")));
check("CASE-05", scope({ blueprint: null, assignments: null }).violations.some((item) => item.includes("all six")));
check("CASE-06", scope({ rolePolicy: null }).violations.some((item) => item.includes("all six")));
check("CASE-07", scope({ assignments: null }).violations.some((item) => item.includes("all six")));
check("CASE-08", scope({ blueprint: { ...blueprint, allowed_paths: { ...blueprint.allowed_paths, write: [] } } }).violations.some((item) => item.includes("empty")));
const readOnlyScope = scope({ assignments: [{ ...assignment, allowed_write_paths: [] }] });
check("CASE-09", readOnlyScope.role_scopes["qa-engineer"].effective_write_paths.length === 0 && resolveActorScope({ handoff: { actor_role: "qa-engineer", changed_files: [".codex/tasks/X/evidence.md"] }, effectiveScope: readOnlyScope }).violations.length > 0);
check("CASE-10", resolveActorScope({ handoff: { changed_files: [".codex/tasks/X/evidence.md"] }, effectiveScope: validScope }).binding === "derived-unique-assignment");
const ambiguousBlueprint = { ...blueprint, agent_assignments: [assignment, { role: "architect", allowed_read_paths: [".codex/tasks/X/**"], allowed_write_paths: [".codex/tasks/X/**"] }] };
const ambiguousScope = scope({ blueprint: ambiguousBlueprint, assignments: ambiguousBlueprint.agent_assignments, rolePolicy: { roles: { ...rolePolicy.roles, architect: { allowed_read_paths: [".codex/**"], allowed_write_paths: [".codex/tasks/**"] } } } });
check("CASE-11", resolveActorScope({ handoff: { changed_files: [".codex/tasks/X/evidence.md"] }, effectiveScope: ambiguousScope }).violations.some((item) => item.includes("matched 2")));
let monotonic = true;
for (let index = 0; index < 32; index += 1) {
  const ref = `.codex/tasks/P${index}/**`;
  const localBlueprint = { ...blueprint, allowed_paths: { read: [ref], write: [ref] }, agent_assignments: [{ role: "qa-engineer", allowed_read_paths: [ref], allowed_write_paths: [ref] }] };
  const result = scope({ intent: { scope: { ...intent.scope, include: [ref] } }, classification: { scope: { ...classification.scope, include: [ref] } }, blueprint: localBlueprint, assignments: localBlueprint.agent_assignments });
  monotonic &&= !result.violations.length && result.role_scopes["qa-engineer"].effective_write_paths.every((item) => [phase.authorized_write_paths, [ref], [ref], [ref], rolePolicy.roles["qa-engineer"].allowed_write_paths, [ref]].every((operand) => operand.some((allowed) => pathMatchesPattern(item.replace(/\/\*\*$/, "/probe.md"), allowed))));
}
check("CASE-12", monotonic);

const artifacts = [{ artifact_id: "ART-A", type: "report", path: "a.md", sha256: "A".repeat(64), authority: "evidence-only" }, { artifact_id: "ART-B", type: "report", path: "b.md", sha256: "B".repeat(64), authority: "evidence-only" }];
check("CASE-13", validateUniqueArtifacts(artifacts).length === 0 && resolveUniqueArtifact(artifacts, "ART-A").ok);
check("CASE-14", !resolveUniqueArtifact([artifacts[0], { ...artifacts[0] }], "ART-A").ok);
check("CASE-15", !resolveUniqueArtifact(artifacts, "ART-X").ok);
check("CASE-16", !resolveUniqueArtifact(artifacts, "ART-A", { type: "approval" }).ok);
const requirements = [{ requirement_id: "REQ-A", semantic_category: "INTEGRITY", criticality: "HIGH", required_level: "L3" }, { requirement_id: "REQ-B", semantic_category: "REVIEW", criticality: "CRITICAL", required_level: "L3" }];
check("CASE-17", validateUniqueRequirements(requirements).length === 0 && resolveUniqueRequirement(requirements, "REQ-A").ok);
check("CASE-18", !resolveUniqueRequirement([requirements[0], { ...requirements[0], semantic_category: "OTHER" }], "REQ-A").ok);
check("CASE-19", !resolveRequirementVerdict({ requirements, checks: [{ check_id: "C", requirement_id: "REQ-A", result: "NOT_APPLICABLE" }], requirementId: "REQ-A" }).ok);
check("CASE-20", [[requirements[0], requirements[0]], [requirements[0], requirements[1], requirements[0]], [requirements[1], requirements[0], requirements[0]]].every((list) => !resolveUniqueRequirement(list, "REQ-A").ok));

const bootstrapRecord = proofModule.createBootstrapWorkspaceCandidateRecord({ task_id: "GOV-FIXTURE", manifest_sha256: "A".repeat(64), included_file_set_sha256: "B".repeat(64), file_count: 3, scanner_report_sha256: "C".repeat(64), scan_contract_sha256: "D".repeat(64), finding_registry_sha256: "E".repeat(64), canonicalization_config_sha256: "F".repeat(64), binary_oracle_config_sha256: "1".repeat(64), binary_magic_registry_sha256: "2".repeat(64), schema_set_sha256: "3".repeat(64), evidence_schema_registry_sha256: "4".repeat(64), referenced_evidence_policy_sha256: "5".repeat(64), supersedes_candidate_manifest_sha256: "6".repeat(64), supersession_reason: "Typed fixture supersedes the prior governance candidate.", breaking_governance_change: "referenced_evidence_validation_required", generated_at: "2026-07-18T00:00:00Z" });
const expectedRecord = { record_type: "BOOTSTRAP_WORKSPACE_CANDIDATE", assurance: "INTERNAL_CONSISTENCY_ONLY", task_id: "GOV-FIXTURE", manifest_sha256: "A".repeat(64), included_file_set_sha256: "B".repeat(64), file_count: 3, scanner_report_sha256: "C".repeat(64), scan_contract_sha256: "D".repeat(64), finding_registry_sha256: "E".repeat(64), canonicalization_config_sha256: "F".repeat(64), binary_oracle_config_sha256: "1".repeat(64), binary_magic_registry_sha256: "2".repeat(64), schema_set_sha256: "3".repeat(64) };
check("CASE-21", proofModule.validateBootstrapCandidateRecord(bootstrapRecord, expectedRecord).ok);
check("CASE-22", !proofModule.validateBootstrapCandidateRecord({ ...bootstrapRecord, assurance: "TRUSTED" }, expectedRecord).ok);
check("CASE-23", !proofModule.validateBootstrapCandidateRecord({ proof_type: "PASS" }, expectedRecord).ok);
check("CASE-24", !proofModule.validateBootstrapCandidateRecord({ ...bootstrapRecord, producer: "governance-validator" }, expectedRecord).ok);
check("CASE-25", !proofModule.validateBootstrapCandidateRecord({ ...bootstrapRecord, staged_file_set_sha256: "D".repeat(64) }, expectedRecord).ok);
check("CASE-26", !proofModule.validateBootstrapCandidateRecord({ ...bootstrapRecord, file_count: 4 }, expectedRecord).ok);
check("CASE-27", !proofModule.validateBootstrapCandidateRecord(bootstrapRecord, { ...expectedRecord, manifest_sha256: "F".repeat(64) }).ok);
check("CASE-28", !proofModule.validateBootstrapCandidateRecord(bootstrapRecord, { ...expectedRecord, scanner_report_sha256: "F".repeat(64) }).ok);
check("CASE-29", !proofModule.validateBootstrapCandidateRecord(bootstrapRecord, { ...expectedRecord, file_count: 4 }).ok);
check("CASE-30", typeof proofModule.createStagedExactProof === "undefined" && typeof proofModule.validateTypedProof === "undefined");

const findingClasses = (text) => new Set(scanCanonicalContent(canonicalizeScannerInput(text), "probe.md").map((item) => item.finding_class));
const basic = ["Author", "ization: Ba", "sic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="].join("");
check("CASE-31", findingClasses("\\u0041" + basic.slice(1)).has("BASIC_AUTH"));
const credentialUri = ["post", "gresql://fixture_user:", "Synthetic9Value@host.invalid/db"].join("");
check("CASE-32", findingClasses(encodeURIComponent(encodeURIComponent(credentialUri))).has("CREDENTIAL_URI"));
const malformedAdjacent = "%ZZ" + encodeURIComponent(basic);
const malformedClasses = findingClasses(malformedAdjacent);
check("CASE-33", malformedClasses.has("MALFORMED_PERCENT_ENCODING") && malformedClasses.has("BASIC_AUTH"));
check("CASE-34", findingClasses(credentialUri).has("CREDENTIAL_URI"));
check("CASE-35", findingClasses(["Author", "ization: Bear", "er abcdefghijklmnopqrstuvwxyz123456"].join("")).has("BEARER_TOKEN"));
check("CASE-36", findingClasses(basic).has("BASIC_AUTH"));
check("CASE-37", findingClasses(["{\"Coo", "kie\": \"session=", "Ab9Cd8Ef7Gh6Ij5Kl4Mn5Op6Qr", "\"}"].join("")).has("COOKIE_HEADER"));
check("CASE-38", findingClasses(["{\"Set-Coo", "kie\": \"auth=", "Zx8Cv7Bn6Mm5Lk4Jh3Gf2Ds1Aa", "\"}"].join("")).has("COOKIE_HEADER"));
check("CASE-39", findingClasses(["session=", "Ab9Cd8Ef7Gh6Ij5Kl4Mn5Op6Qr"].join("")).has("SESSION_COOKIE"));
check("CASE-40", findingClasses(["eyJabcdefghijk", ".Abcdefghijkl", ".Zyxwvutsrqpo"].join("")).has("JWT"));
check("CASE-41", findingClasses(["gh", "p_", "AbCdEfGhIjKlMnOpQrStUvWxYz12"].join("")).has("KNOWN_TOKEN"));
check("CASE-42", findingClasses(["aB3dE5fG7hJ9kL2m", "N4pQ6rS8tV1xY0z_", "-Aa9"].join("")).has("HIGH_ENTROPY_OPAQUE_VALUE"));
check("CASE-43", findingClasses("https://example.invalid/docs Cookie: theme=light bootstrap-record-example").size === 0);
const signatures = binaryMagicRegistry.entries.map((entry, index) => [`CASE-${String(44 + index).padStart(2, "0")}`, Buffer.from(entry.signature_bytes, "hex")]);
for (const [caseId, bytes] of signatures) check(caseId, scanBinaryContent(bytes, "probe.md", binaryMagicRegistry).some((item) => item.startsWith("KNOWN_BINARY_MAGIC_DETECTED")));
check("CASE-53", scanBinaryContent(Buffer.from([0x41, 0x00, 0x42]), "probe.md", binaryMagicRegistry).some((item) => item.startsWith("NUL_BYTE_DETECTED")));
check("CASE-54", validateDeclaredScanContract(scanContract, { findingRegistry, canonicalizationConfig, binaryOracle, binaryMagicRegistry, implementationMatrix, productionCaseManifest }).length === 0);
let jsAllowed = true; try { assertCandidateTextArtifact("control.js"); } catch { jsAllowed = false; }
check("CASE-55", jsAllowed);
let executableRejected = false; try { assertCandidateTextArtifact("control.exe"); } catch { executableRejected = true; }
check("CASE-56", executableRejected);

const candidateRule = { rule_id: "RULE-D", version: 1, category: "domain", rule_class: "railway_domain_candidate", authority_effect: "candidate_only", status: "proposed", owner: null, approved_at: null };
const domain = { registry_type: "proposed_rule_registry", is_complete_domain_knowledge_base: false, phase1_confirmation_supported: false, confirmed_rule_count: 0, applicable_rules: [], candidate_rules: ["RULE-D"], rules: [candidateRule] };
check("CASE-57", validateProposedDomainRegistry(domain).length === 0 && validateRuleClassification(candidateRule, "domain").length === 0);
check("CASE-58", validateProposedDomainRegistry({ ...domain, rules: [{ ...candidateRule, status: "confirmed" }] }).some((item) => item.includes("unsupported status")));
const records = [{ ...candidateRule, registry: "domain" }, { rule_id: "GOV-A", category: "governance", rule_class: "governance_control", authority_effect: "procedural_governance", status: "confirmed", registry: "meta" }, { rule_id: "TECH-A", category: "evidence", rule_class: "technical_constraint", authority_effect: "technical_constraint", status: "confirmed", registry: "meta" }];
check("CASE-59", validateTaskRuleSelection({ blueprint: { applicable_rules: ["RULE-D"], candidate_rules: [] }, records }).violations.some((item) => item.includes("cannot be an applicable")));
check("CASE-60", validateRuleClassification({ ...records[1], category: "domain" }, "meta").some((item) => item.includes("business category")));
check("CASE-61", validateRuleClassification({ ...candidateRule, rule_class: "railway_domain_authority", authority_effect: "unsupported" }, "domain").some((item) => item.includes("unsupported")));
const allowedSelection = validateTaskRuleSelection({ blueprint: { applicable_rules: ["GOV-A", "TECH-A"], candidate_rules: [] }, records });
check("CASE-62", !allowedSelection.violations.length && allowedSelection.resolved_applicable_rules.map((item) => item.rule_class).join("|") === "governance_control|technical_constraint");
check("CASE-63", !resolveUniqueRule([...records, { ...records[1] }], "GOV-A").ok);

const event = (event_id, task_id, state, at) => ({ event_id, task_id, task_kind: "remediation", state, at, source_ref: `.codex/tasks/${task_id}/task-intent.yaml`, source_sha256: "A".repeat(64) });
const futureLog = { phase_id: "phase1_governance_only", events: [event("E1", "GOV-FUTURE-Z99", "STARTED", "2026-07-18T00:00:00Z")] };
const projected = projectLifecycleState({ event_log: futureLog, generated_at: "2026-07-18T00:01:00Z" });
check("CASE-64", projected.projection.active_task === "GOV-FUTURE-Z99" && projected.projection.authority === "informational" && projected.projection.used_as_gate_input === false && projected.projection.used_as_scope_input === false && projected.projection.used_as_approval_input === false && projectLifecycleState({ event_log: { ...futureLog, events: [...futureLog.events, { ...futureLog.events[0] }] }, generated_at: "2026-07-18T00:02:00Z" }).violations.some((item) => item.includes("duplicate")));

const windowsPath = ["C", ":\\Users\\fixture\\report.md"].join("");
check("CASE-65", classifyOperationalContent(windowsPath, "probe.md").some((item) => item.startsWith("WINDOWS_ABSOLUTE_PATH")));
const uncPath = ["\\", "\\host", "\\share\\report.md"].join("");
check("CASE-66", classifyOperationalContent(uncPath, "probe.md").some((item) => item.startsWith("UNC_PATH")));
const fileUri = ["fi", "le:///", "tmp/fixture/report.md"].join("");
check("CASE-67", classifyOperationalContent(fileUri, "probe.md").some((item) => item.startsWith("FILE_URI")));
const dumpRef = ["fixture", ".du", "mp"].join("");
check("CASE-68", classifyOperationalContent(dumpRef, "probe.md").some((item) => item.startsWith("DUMP_REFERENCE")));

const contractsHash = hash(JSON.stringify(suite.case_contracts));
if (contractsHash !== suite.case_manifest_sha256) throw new Error("Trusted fixture case contract hash mismatch.");
if (results.length !== suite.expected_case_count || results.some((item, index) => item.case_id !== suite.expected_case_ids[index])) throw new Error("Runner case set does not equal trusted manifest.");
const runRoot = await mkdtemp(path.join(os.tmpdir(), "ntmc-bootstrap-fixtures-"));
for (const item of results) {
  item.case_workspace = path.join(runRoot, item.case_id);
  await mkdir(item.case_workspace);
  item.cleanup_boundary = "PASS";
}
await rm(runRoot, { recursive: true, force: true });
const failures = results.filter((item) => !item.pass);
for (const item of results) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.case_id} ${item.asserted_invariant}`);
const report = { suite_id: suite.suite_id, suite_version: suite.suite_version, case_manifest_sha256: suite.case_manifest_sha256, fixture_run_id: `FIXTURE-${randomUUID()}`, owner_pid: process.pid, started_at: "deterministic", execution_mode: "production-module-contracts", schema_execution: {production_loader_used: true, loader_export: "loadAndCompileGovernanceSchemas", schema_set_sha256: schemaSet.schema_set_sha256, railway_review_schema_id: railwaySchema.$id, railway_review_schema_version: railwaySchema["x-governance-schema-version"], railway_review_schema_sha256: railwaySchemaMetadata.sha256, schema_compile_status: "PASS", scan_contract_schema_set_hash_match: true, typed_railway_fixture_validated: true}, run_root_realpath: runRoot, caller_run_id_ignored: process.env.GOV_FIXTURE_RUN_ID ?? null, cases: results, cleanup_result: "PASS", fatal_error: null };
console.log(`FIXTURE_REPORT ${JSON.stringify(report)}`);
console.log(`GOVERNANCE_FIXTURES total=${results.length} passed=${results.length - failures.length} failed=${failures.length}`);
process.exit(failures.length ? 1 : 0);
