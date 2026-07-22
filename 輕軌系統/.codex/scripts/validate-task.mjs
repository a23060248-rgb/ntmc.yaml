import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath, safeNewPath, verifyCreatedPath, validateRelativeRef } from "./lib/path-safety.mjs";
import { validateSchema } from "./lib/schema-validator.mjs";
import { collectGovernanceCommitRefs } from "./lib/governance-commit-manifest.mjs";
import { computeEffectiveScope, resolveActorScope } from "./lib/governance/scope-lattice.mjs";
import { resolveUniqueArtifact, resolveUniqueRequirement, validateUniqueArtifacts, validateUniqueRequirements } from "./lib/governance/identity-resolver.mjs";
import { BOOTSTRAP_ASSURANCE, BOOTSTRAP_RECORD_TYPE, canonical, canonicalSha256, sha256, validateBootstrapCandidateRecord } from "./lib/governance/typed-proof.mjs";
import { assertCandidateTextArtifact, assertTextArtifact, scanText, classifyOperationalContent, scanBinaryContent } from "./lib/governance/scanner-pipeline.mjs";
import { loadScannerContractBundle, validateBootstrapScanReport } from "./lib/governance/scanner-report.mjs";
import { computeAuthoritativeGateMap, exitForGateMap, projectAuthoritativeGateMap, resolveTargetGate, validateGateDependencyMatrix } from "./lib/governance/gate-router.mjs";
import { routeDomainReview, validateDomainReviewRouting } from "./lib/governance/domain-review-routing.mjs";
import { validateProposedDomainRegistry } from "./lib/governance/proposed-domain-rules.mjs";
import { validateRuleClassification, validateTaskRuleSelection } from "./lib/governance/rule-class.mjs";
import { loadAndCompileGovernanceSchemas } from "./lib/governance/governance-schema-loader.mjs";
import { validateFormalRailwayReviewerBinding } from "./lib/governance/reviewer-identity-binding.mjs";
import { resolveReferencedEvidence } from "./lib/governance/evidence-resolver.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDir, "..", "..");
const outcomes = new Set(["PASS", "PASS_WITH_CONDITIONS", "BLOCKER", "NEEDS_HUMAN_DECISION"]);
const l3Reviews = ["code", "security", "railway-domain"];
const requiredFiles = ["task-intent.yaml", "classification.yaml", "blueprint.yaml", "implementation-plan.md", "implementation-handoff.yaml", "artifact-manifest.yaml", "human-approval.yaml", "traceability.yaml", "final-summary.md"];
const schemaFiles = {
  "task-intent.yaml": "task-intent.schema.json",
  "classification.yaml": "classification.schema.json",
  "blueprint.yaml": "blueprint.schema.json",
  "implementation-handoff.yaml": "implementation-handoff.schema.json",
  "artifact-manifest.yaml": "artifact-manifest.schema.json",
  "human-approval.yaml": "human-approval.schema.json",
  "traceability.yaml": "traceability.schema.json"
};

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument ${key}`);
    if (key === "--write-graph") values.writeGraph = true;
    else {
      if (argv[index + 1] === undefined) throw new Error(`Missing value for ${key}`);
      values[key.slice(2)] = argv[++index];
    }
  }
  return values;
}

function expectedGraph(traceability) {
  const nodes = [...traceability.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...traceability.edges].sort((a, b) => `${a.from}|${a.relation}|${a.to}`.localeCompare(`${b.from}|${b.relation}|${b.to}`));
  return { schema_version: 1, task_id: traceability.task_id, generated_at: traceability.generated_at, generated_by: ".codex/scripts/validate-task.mjs", source_digest_sha256: sha256(JSON.stringify(canonical({ nodes, edges }))), nodes, edges };
}

function containsPlaceholder(value) {
  if (typeof value === "string") return /\b(?:TBD|TODO|PLACEHOLDER)\b|<TASK-ID>/i.test(value);
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (value && typeof value === "object") return Object.values(value).some(containsPlaceholder);
  return false;
}

async function readJsonSafe(projectRoot, ref, errors) {
  try { return JSON.parse(await readFile(await safeExistingPath(projectRoot, ref), "utf8")); }
  catch (error) { errors.push(`PARSE ${ref}: ${error.message}`); return null; }
}

async function validateGovernanceBase(projectRoot, errors) {
  const config = await readFile(await safeExistingPath(projectRoot, ".codex/config.toml"), "utf8");
  if (!/^max_threads\s*=\s*4$/m.test(config) || !/^max_depth\s*=\s*1$/m.test(config) || !/^interrupt_message\s*=\s*true$/m.test(config)) errors.push("CONFIG agent concurrency contract is invalid.");
  const agentsDir = await safeExistingPath(projectRoot, ".codex/agents");
  const agentFiles = (await readdir(agentsDir)).filter((name) => name.endsWith(".toml")).sort();
  if (agentFiles.length !== 10 || agentFiles.includes("orchestrator.toml")) errors.push(`AGENTS expected exactly 10 non-orchestrator TOML files; found ${agentFiles.length}.`);
  for (const agentFile of agentFiles) {
    const text = await readFile(await safeExistingPath(projectRoot, `.codex/agents/${agentFile}`), "utf8");
    for (const field of ["name", "description", "sandbox_mode", "developer_instructions"]) if (!new RegExp(`^${field}\\s*=`, "m").test(text)) errors.push(`AGENT_TOML ${agentFile} missing ${field}.`);
    if (!/^sandbox_mode\s*=\s*"(read-only|workspace-write)"$/m.test(text)) errors.push(`AGENT_TOML ${agentFile} unsupported sandbox_mode.`);
  }
  const phasePolicy = await readJsonSafe(projectRoot, ".codex/governance/phase-policy.yaml", errors);
  if (!phasePolicy || phasePolicy.phase_id !== "phase1_governance_only" || phasePolicy.governance_mode !== "bootstrap" || phasePolicy.product_write_allowed || phasePolicy.database_write_allowed) errors.push("PHASE_POLICY bootstrap Phase 1 policy is missing or permits product/database writes.");
  const phaseStatus = await readJsonSafe(projectRoot, ".codex/governance/phase-status.json", errors);
  if (phaseStatus && (phaseStatus.authority !== "informational" || phaseStatus.used_as_gate_input !== false || phaseStatus.used_as_scope_input !== false || phaseStatus.used_as_approval_input !== false || phaseStatus.product_writes_allowed || phaseStatus.database_operations_allowed)) errors.push("PHASE_STATUS must be informational, non-authoritative, unused for Gate/scope/approval, and product/database locked.");
  const agentPolicy = await readJsonSafe(projectRoot, ".codex/governance/agent-path-policy.yaml", errors);
  if (!agentPolicy || agentPolicy.runtime_isolation !== false || Object.keys(agentPolicy.roles ?? {}).length !== 10) errors.push("AGENT_POLICY machine-readable role policy is incomplete or overclaims runtime isolation.");
  let scanBundle = null;
  try { scanBundle = await loadScannerContractBundle(projectRoot); errors.push(...scanBundle.violations); }
  catch (error) { errors.push(`SCAN_CONTRACT ${error.message}`); }
  const scanContract = scanBundle?.contract ?? null;
  const bootstrapPolicy = await readJsonSafe(projectRoot, ".codex/governance/bootstrap-trust-policy.yaml", errors);
  if (!bootstrapPolicy || bootstrapPolicy.governance_mode !== "bootstrap" || bootstrapPolicy.validator_provenance !== "untrusted-workspace" || bootstrapPolicy.proof_assurance !== BOOTSTRAP_ASSURANCE || bootstrapPolicy.git_trust_anchor !== false || bootstrapPolicy.steady_state_transition_present !== false) errors.push("BOOTSTRAP_TRUST_POLICY trust boundary is incomplete or overclaims authority.");
  const gatePolicy = await readJsonSafe(projectRoot, ".codex/governance/gate-policy.yaml", errors);
  const gateDependencyMatrix = await readJsonSafe(projectRoot, ".codex/governance/gate-dependency-matrix.yaml", errors);
  if (gateDependencyMatrix) errors.push(...validateGateDependencyMatrix(gateDependencyMatrix));
  const gateNames = ["bootstrap_candidate_review", "bootstrap_human_commit", "steady_state_governance_preparation", "steady_state_governance_execution", "migration_320_execution"];
  const expectedStatuses = {bootstrap_candidate_review: "NO-GO", bootstrap_human_commit: "NO-GO", steady_state_governance_preparation: "DISABLED", steady_state_governance_execution: "DISABLED", migration_320_execution: "NO-GO"};
  if (!gatePolicy || gatePolicy.governance_mode !== "bootstrap" || gateNames.some((name) => !gatePolicy.gates?.[name] || gatePolicy.current_status?.[name] !== expectedStatuses[name]) || gatePolicy.gates?.bootstrap_human_commit?.human_exclusive !== true || gatePolicy.gates?.steady_state_governance_preparation?.enabled !== false || gatePolicy.gates?.steady_state_governance_execution?.enabled !== false) errors.push("GATE_POLICY five routed Gates are incomplete or not fail-closed/disabled.");
  let schemaSet = null;
  try { schemaSet = await loadAndCompileGovernanceSchemas(projectRoot); }
  catch (error) { errors.push(`SCHEMA_SET ${error.message}`); }
  const skill = await readFile(await safeExistingPath(projectRoot, ".agents/skills/task-classification/SKILL.md"), "utf8");
  if (!skill.match(/^---\r?\n([\s\S]*?)\r?\n---/) || /\b(?:TBD|TODO|PLACEHOLDER)\b/i.test(skill)) errors.push("SKILL task-classification metadata is invalid or contains placeholders.");
  return { phasePolicy, agentPolicy, scanContract, scanBundle, bootstrapPolicy, gatePolicy, gateDependencyMatrix, schemaSet };
}

async function migration320Reasons(projectRoot, errors) {
  const reasons = [];
  const base = ".codex/tasks/GOV-M320-DRYRUN";
  const blueprint = await readJsonSafe(projectRoot, `${base}/blueprint.yaml`, errors);
  const findings = await readJsonSafe(projectRoot, `${base}/review-findings.yaml`, errors);
  const approval = await readJsonSafe(projectRoot, `${base}/human-approval.yaml`, errors);
  const evidence = await readJsonSafe(projectRoot, `${base}/test-evidence.yaml`, errors);
  for (const ruleId of blueprint?.candidate_rules ?? []) reasons.push(`Migration 320 candidate Rule ${ruleId} lacks human business authority.`);
  for (const blocker of findings?.blockers ?? []) reasons.push(`Migration 320 blocker remains: ${blocker}.`);
  const domain = (findings?.reviews ?? []).find((item) => item.type === "railway-domain");
  if (domain?.outcome !== "PASS") reasons.push(`Migration 320 Domain decision is ${domain?.outcome ?? "missing"}.`);
  const compatibility = (findings?.reviews ?? []).find((item) => item.type === "compatibility");
  if (compatibility?.outcome !== "PASS") reasons.push(`Migration 320 compatibility decision is ${compatibility?.outcome ?? "missing"}.`);
  if (approval?.status !== "approved" || (approval?.approvals ?? []).some((item) => item.stage === "final_commit_approval" && item.status !== "approved")) reasons.push("Migration 320 human execution approval is pending.");
  if ((evidence?.checks ?? []).some((item) => item.result !== "PASS")) reasons.push("Migration 320 database or compatibility evidence is not fully PASS.");
  return reasons;
}

async function scanGovernanceCommit(projectRoot, errors, schemaSet, scanBundle) {
  const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
  const manifestBytes = await readFile(await safeExistingPath(projectRoot, manifestRef));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const schema = schemaSet?.byName.get("governance-commit-manifest.schema.json");
  if (schema) for (const issue of validateSchema(schema, manifest, manifestRef)) errors.push(`SCHEMA ${issue}`);
  const expectedRefs = await collectGovernanceCommitRefs(projectRoot);
  const listedRefs = (manifest.artifacts ?? []).map((item) => item.path);
  if (new Set(listedRefs).size !== listedRefs.length) errors.push("GOVERNANCE_MANIFEST duplicate included path.");
  const expectedSet = new Set(expectedRefs), listedSet = new Set(listedRefs);
  for (const ref of expectedRefs) if (!listedSet.has(ref)) errors.push(`GOVERNANCE_MANIFEST missing included path ${ref}.`);
  for (const ref of listedRefs) if (!expectedSet.has(ref)) errors.push(`GOVERNANCE_MANIFEST unexpected included path ${ref}.`);
  const files = [];
  for (const artifact of manifest.artifacts ?? []) {
    const ref = artifact.path;
    try {
      assertCandidateTextArtifact(ref);
      const bytes = await readFile(await safeExistingPath(projectRoot, ref));
      const digest = sha256(bytes);
      files.push({ path: ref, sha256: digest });
      if (digest !== artifact.sha256.toUpperCase()) errors.push(`GOVERNANCE_MANIFEST hash mismatch ${ref}.`);
      for (const finding of scanBinaryContent(bytes, ref, scanBundle?.binaryMagicRegistry)) errors.push(`GOVERNANCE_BINARY ${finding}`);
      const text = bytes.toString("utf8");
      for (const finding of scanText(text, ref)) errors.push(`GOVERNANCE_SECRET ${finding}`);
      for (const finding of classifyOperationalContent(text, ref)) errors.push(`GOVERNANCE_OPERATIONAL_PATH ${finding}`);
    } catch (error) { errors.push(`GOVERNANCE_SCAN ${ref}: ${error.message}`); }
  }
  return { manifest, manifestBytes, files: files.sort((a, b) => a.path.localeCompare(b.path)), listedRefs };
}

async function loadRuleRegistry(projectRoot, errors, schemaSet) {
  const schema = schemaSet?.byName.get("rule.schema.json");
  const records = [];
  const metaDir = await safeExistingPath(projectRoot, ".codex/meta-rules");
  for (const name of (await readdir(metaDir)).filter((item) => item.endsWith(".yaml")).sort()) {
    const document = await readJsonSafe(projectRoot, `.codex/meta-rules/${name}`, errors);
    for (const [index, rule] of (document?.rules ?? []).entries()) {
      if (schema) for (const issue of validateSchema(schema, rule, `.codex/meta-rules/${name}.rules[${index}]`)) errors.push(`SCHEMA ${issue}`);
      errors.push(...validateRuleClassification(rule, "meta"));
      records.push({ ...rule, registry: "meta", source_ref: `.codex/meta-rules/${name}` });
    }
  }
  const domain = await readJsonSafe(projectRoot, ".codex/domain/index.yaml", errors);
  errors.push(...validateProposedDomainRegistry(domain));
  for (const [index, rule] of (domain?.rules ?? []).entries()) {
    if (schema) for (const issue of validateSchema(schema, rule, `.codex/domain/index.yaml.rules[${index}]`)) errors.push(`SCHEMA ${issue}`);
    errors.push(...validateRuleClassification(rule, "domain"));
    records.push({ ...rule, registry: "domain", source_ref: ".codex/domain/index.yaml" });
  }
  const counts = new Map();
  for (const rule of records) counts.set(rule.rule_id, (counts.get(rule.rule_id) ?? 0) + 1);
  for (const [ruleId, count] of counts) if (count !== 1) errors.push(`RULE duplicate Rule ID ${ruleId} resolved ${count} times.`);
  return { records, domain };
}

function automaticReviews(classification) {
  if (classification.level === "L1") return ["qa-readback"];
  if (classification.level === "L3") {
    const required = [...l3Reviews];
    if ((classification.execution_categories ?? []).some((item) => ["migration", "database", "backward-compatibility", "rollback"].includes(item))) required.push("compatibility");
    else if ((classification.triggers ?? []).some((item) => ["migration", "backward compatibility", "formal data provenance"].includes(item))) required.push("compatibility");
    return required;
  }
  const required = ["code"];
  if ((classification.execution_categories ?? []).some((item) => ["credential", "external-system", "sensitive-evidence", "security"].includes(item))) required.push("security");
  if ((classification.execution_categories ?? []).includes("domain-rule")) required.push("railway-domain");
  return required;
}

async function validateBootstrapRecordRef({ projectRoot, recordRef, scannerReportRef, expected, governance, errors, gateReasons, schemaSet }) {
  try {
    validateRelativeRef(recordRef);
    validateRelativeRef(scannerReportRef);
    const record = JSON.parse(await readFile(await safeExistingPath(projectRoot, recordRef), "utf8"));
    const schema = schemaSet?.byName.get("bootstrap-candidate-record.schema.json");
    if (schema) for (const issue of validateSchema(schema, record, recordRef)) errors.push(`SCHEMA ${issue}`);
    errors.push(...validateBootstrapCandidateRecord(record, expected).violations);
    const scannerReportBytes = await readFile(await safeExistingPath(projectRoot, scannerReportRef));
    const scannerReport = JSON.parse(scannerReportBytes.toString("utf8"));
    if (sha256(scannerReportBytes) !== record.scanner_report_sha256) errors.push("BOOTSTRAP_CANDIDATE scanner report SHA256 mismatch.");
    if (scannerReport.report_type === "BOOTSTRAP_DETERMINISTIC_SCAN_REPORT") {
      gateReasons.push("Legacy scanner report cannot satisfy the bootstrap candidate Gate.");
      return { record, scannerReport, legacy: true };
    }
    const reportSchema = schemaSet?.byName.get("bootstrap-scan-report.schema.json");
    if (reportSchema) for (const issue of validateSchema(reportSchema, scannerReport, scannerReportRef)) errors.push(`SCHEMA ${issue}`);
    const checked = await validateBootstrapScanReport({projectRoot, report: scannerReport, manifestBytes: governance.manifestBytes, includedFiles: governance.files, scannedFiles: governance.files});
    errors.push(...checked.violations);
    if (scannerReport.results?.result !== "PASS" || scannerReport.results?.finding_count !== 0) errors.push("BOOTSTRAP_CANDIDATE scanner report is not a zero-finding bootstrap PASS record.");
    const bindings = scannerReport.scan_contract ?? {};
    for (const field of ["contract_sha256", "finding_registry_sha256", "canonicalization_config_sha256", "binary_oracle_config_sha256", "binary_magic_registry_sha256", "schema_set_sha256", "evidence_schema_registry_sha256", "referenced_evidence_policy_sha256"]) {
      const recordField = field === "contract_sha256" ? "scan_contract_sha256" : field;
      if (bindings[field] !== record[recordField]) errors.push(`BOOTSTRAP_CANDIDATE scanner contract binding ${field} disagrees with candidate record.`);
    }
    return { record, scannerReport, legacy: false };
  } catch (error) { errors.push(`BOOTSTRAP_CANDIDATE ${recordRef}: ${error.message}`); return null; }
}

export async function validateTask(taskId, options = {}) {
  const projectRoot = options.projectRoot ?? defaultProjectRoot;
  const errors = [];
  const candidateReasons = [];
  const migrationReasons = [];
  const gateReasons = candidateReasons;
  let targetGate = null;
  try { targetGate = resolveTargetGate(options.targetGate); }
  catch (error) { return {exitCode: 1, calculatedGate: "NO-GO", errors: [`ARGUMENT ${error.message}`], gateReasons: [], candidateReasons: [], migrationReasons: [], gateResults: computeAuthoritativeGateMap({candidate_gate_blockers: ["STRUCTURAL_VALIDATION_FAILED"], migration_320_gate_blockers: ["STRUCTURAL_VALIDATION_FAILED"]}), effectiveScope: null}; }
  if (!/^[A-Z][A-Z0-9-]{2,63}$/.test(taskId ?? "")) return { exitCode: 1, calculatedGate: "NO-GO", errors: ["TASK_ID invalid Task ID."], gateReasons: [], candidateReasons: [], migrationReasons: [], gateResults: computeAuthoritativeGateMap({candidate_gate_blockers: ["STRUCTURAL_VALIDATION_FAILED"], migration_320_gate_blockers: ["STRUCTURAL_VALIDATION_FAILED"]}), effectiveScope: null };

  let phasePolicy, agentPolicy, scanBundle, schemaSet;
  try { ({ phasePolicy, agentPolicy, scanBundle, schemaSet } = await validateGovernanceBase(projectRoot, errors)); }
  catch (error) { errors.push(`GOVERNANCE_BASE ${error.message}`); }
  try { migrationReasons.push(...await migration320Reasons(projectRoot, errors)); }
  catch (error) { errors.push(`MIGRATION_320_GATE ${error.message}`); }
  const taskBase = `.codex/tasks/${taskId}`;
  const documents = {}, rawTexts = {}, schemas = {};
  for (const schemaName of new Set(Object.values(schemaFiles))) {
    schemas[schemaName] = schemaSet?.byName.get(schemaName) ?? null;
    if (!schemas[schemaName]) errors.push(`SCHEMA_SET required schema ${schemaName} is unavailable.`);
  }
  for (const name of requiredFiles) {
    try {
      const text = await readFile(await safeExistingPath(projectRoot, `${taskBase}/${name}`), "utf8");
      rawTexts[name] = text;
      if (!text.trim()) errors.push(`REQUIRED ${name} is empty.`);
      if (/\b(?:TBD|TODO|PLACEHOLDER)\b|<TASK-ID>/i.test(text)) errors.push(`PLACEHOLDER ${name} contains a forbidden placeholder.`);
      if (name.endsWith(".yaml")) documents[name] = JSON.parse(text);
    } catch (error) { errors.push(`REQUIRED ${name}: ${error.message}`); }
  }
  for (const [name, schemaName] of Object.entries(schemaFiles)) {
    if (!documents[name] || !schemas[schemaName]) continue;
    for (const issue of validateSchema(schemas[schemaName], documents[name], name)) errors.push(`SCHEMA ${issue}`);
    if (documents[name].task_id !== taskId) errors.push(`TASK_ID ${name} does not match ${taskId}.`);
    if (containsPlaceholder(documents[name])) errors.push(`PLACEHOLDER ${name} contains a forbidden placeholder.`);
  }

  const intent = documents["task-intent.yaml"], classification = documents["classification.yaml"], blueprint = documents["blueprint.yaml"];
  const handoff = documents["implementation-handoff.yaml"], taskManifest = documents["artifact-manifest.yaml"], approval = documents["human-approval.yaml"], traceability = documents["traceability.yaml"];
  let referencedEvidenceValidation = null;
  try { referencedEvidenceValidation = await resolveReferencedEvidence({ projectRoot, taskId, manifest: taskManifest, schemaSet }); }
  catch (error) { errors.push(`REFERENCED_EVIDENCE RESOLVER_FAILED: ${error.message}`); }
  if (!referencedEvidenceValidation) referencedEvidenceValidation = {active_manifest_contract:false, disposition:"RESOLVER_FAILED", complete:false, errors:[], evidence:[]};
  errors.push(...(referencedEvidenceValidation.errors ?? []));
  if (!referencedEvidenceValidation.complete) gateReasons.push(`Referenced evidence validation is ${referencedEvidenceValidation.disposition}.`);
  if (!referencedEvidenceValidation.active_manifest_contract) {
    for (const [name, schemaName] of [["test-evidence.yaml", "test-evidence.schema.json"], ["security-evidence.yaml", "security-evidence.schema.json"], ["review-findings.yaml", "review-findings.schema.json"]]) {
      const ref = `${taskBase}/${name}`;
      const document = await readJsonSafe(projectRoot, ref, errors);
      if (document) {
        documents[name] = document;
        const schema = schemaSet?.byName.get(schemaName);
        if (schema) for (const issue of validateSchema(schema, document, name)) errors.push(`SCHEMA ${issue}`);
        if (document.task_id !== taskId) errors.push(`TASK_ID ${name} does not match ${taskId}.`);
      }
    }
  }
  const evidence = referencedEvidenceValidation.evidence?.find((item) => item.evidence_type === "test_evidence")?.document ?? documents["test-evidence.yaml"];
  const securityEvidence = referencedEvidenceValidation.evidence?.find((item) => item.evidence_type === "security_evidence")?.document ?? documents["security-evidence.yaml"];
  const findings = referencedEvidenceValidation.evidence?.find((item) => item.evidence_type === "review_findings")?.document ?? documents["review-findings.yaml"];
  const { records: ruleRecords = [], domain = null } = await loadRuleRegistry(projectRoot, errors, schemaSet).catch((error) => { errors.push(`RULE_REGISTRY ${error.message}`); return {}; });

  let governance = { manifest: null, manifestBytes: null, files: [], listedRefs: [] };
  const scanErrorCount = errors.length;
  try { governance = await scanGovernanceCommit(projectRoot, errors, schemaSet, scanBundle); }
  catch (error) { errors.push(`GOVERNANCE_SCAN ${error.message}`); }
  const governanceScanPassed = errors.length === scanErrorCount;

  const effectiveScope = computeEffectiveScope({
    phase_policy: phasePolicy,
    task_intent: intent,
    classification,
    blueprint,
    role_policy: agentPolicy,
    agent_assignments: blueprint?.agent_assignments
  });
  errors.push(...effectiveScope.violations);
  gateReasons.push(...(effectiveScope.gate_violations ?? []));
  if (effectiveScope.product_write_allowed || effectiveScope.database_write_allowed) errors.push("SCOPE Phase 1 effective scope cannot permit product or database writes.");
  if (classification && blueprint && classification.level !== blueprint.risk.level) errors.push("CLASSIFICATION classification and Blueprint levels differ.");
  const actorScope = resolveActorScope({ handoff, effectiveScope });
  errors.push(...actorScope.violations);

  if (agentPolicy?.roles?.["database-engineer"] && !agentPolicy.roles["database-engineer"].prohibited_actions.includes("apply-migration")) errors.push("AGENT_POLICY database-engineer must prohibit apply-migration.");
  if (agentPolicy?.roles?.["qa-engineer"] && !agentPolicy.roles["qa-engineer"].prohibited_actions.includes("modify-product-source")) errors.push("AGENT_POLICY qa-engineer must prohibit product source modification.");
  if (agentPolicy?.roles?.["railway-domain-reviewer"] && !agentPolicy.roles["railway-domain-reviewer"].prohibited_actions.includes("confirm-domain-rule")) errors.push("AGENT_POLICY railway-domain-reviewer must prohibit Rule confirmation.");

  let ruleSelection = { violations: [], resolved_applicable_rules: [], resolved_candidate_rules: [] };
  if (blueprint) {
    ruleSelection = validateTaskRuleSelection({ blueprint, records: ruleRecords });
    errors.push(...ruleSelection.violations);
    if ((blueprint.candidate_rules ?? []).length) migrationReasons.push("Candidate Domain Rules require a human business decision before Migration 320 execution.");
    if (classification?.level === "L3" && !blueprint.rollback_restore?.required && !/not applicable|not-applicable/i.test(blueprint.rollback_restore?.evidence_or_reason ?? "")) errors.push("ROLLBACK L3 requires rollback/restore evidence or an explicit not-applicable reason.");
  }

  const validArtifactEvidence = new Set();
  errors.push(...validateUniqueArtifacts(taskManifest?.artifacts ?? []));
  for (const artifact of taskManifest?.artifacts ?? []) {
    try {
      const normalized = validateRelativeRef(artifact.path);
      assertTextArtifact(normalized, artifact.authority);
      const content = await readFile(await safeExistingPath(projectRoot, normalized));
      const hashMatches = sha256(content) === artifact.sha256.toUpperCase();
      if (!hashMatches) errors.push(`HASH ${artifact.path} SHA256 mismatch.`);
      const binaryFindings = scanBinaryContent(content, artifact.path, scanBundle?.binaryMagicRegistry);
      for (const finding of binaryFindings) errors.push(`BINARY ${finding}`);
      const text = content.toString("utf8");
      const credentialFindings = scanText(text, artifact.path);
      const operationalFindings = classifyOperationalContent(text, artifact.path);
      const hasDumpReference = operationalFindings.some((item) => item.startsWith("DUMP_REFERENCE"));
      if (artifact.evidence_scope === "governance_artifact" && artifact.commit_inclusion !== true) errors.push(`EVIDENCE ${artifact.artifact_id} governance artifact must be commit_inclusion=true.`);
      if (["external_reference", "local_review_record"].includes(artifact.evidence_scope) && artifact.commit_inclusion !== false) errors.push(`EVIDENCE ${artifact.artifact_id} non-candidate evidence must be commit_inclusion=false.`);
      if (artifact.evidence_scope === "external_reference" && artifact.content_scan_status === "FULL") errors.push(`EVIDENCE ${artifact.artifact_id} external reference cannot claim FULL scan.`);
      if (artifact.contains_operational_paths !== Boolean(operationalFindings.length)) errors.push(`EVIDENCE ${artifact.artifact_id} operational-path classification disagrees with content scan.`);
      if (artifact.contains_dump_reference !== hasDumpReference) errors.push(`EVIDENCE ${artifact.artifact_id} dump-reference classification disagrees with content scan.`);
      if (credentialFindings.length) {
        for (const finding of credentialFindings) errors.push(`SECRET ${finding}`);
        if (artifact.credential_scan_status !== "FAIL") errors.push(`EVIDENCE ${artifact.artifact_id} credential_scan_status must be FAIL.`);
      } else if (artifact.credential_scan_status === "FAIL") errors.push(`EVIDENCE ${artifact.artifact_id} credential_scan_status FAIL has no finding.`);
      if (artifact.evidence_scope === "governance_artifact" && operationalFindings.length) for (const finding of operationalFindings) errors.push(`GOVERNANCE_OPERATIONAL_PATH ${finding}`);
      if (hashMatches && !credentialFindings.length && !binaryFindings.length) validArtifactEvidence.add(artifact.artifact_id);
    } catch (error) { errors.push(`ARTIFACT ${artifact.path}: ${error.message}`); }
  }
  for (const [name, text] of Object.entries(rawTexts)) for (const finding of scanText(text, `${taskBase}/${name}`)) errors.push(`SECRET ${finding}`);
  if (evidence?.product_tests_run || evidence?.database_operations_run) errors.push("EVIDENCE Phase 1 cannot claim product tests or database operations.");

  const requirements = evidence?.requirements ?? [];
  const checks = evidence?.checks ?? [];
  errors.push(...validateUniqueRequirements(requirements));
  const checkIds = new Set();
  for (const check of checks) {
    if (checkIds.has(check.check_id)) errors.push(`EVIDENCE duplicate check_id ${check.check_id}.`);
    checkIds.add(check.check_id);
    if (Object.hasOwn(check, "waiver_artifact_id")) errors.push(`EVIDENCE ${check.requirement_id} contains unsupported Phase 1 waiver data.`);
    if (check.result === "NOT_APPLICABLE") errors.push(`EVIDENCE ${check.requirement_id} NOT_APPLICABLE is invalid in Phase 1.`);
    if (check.result !== "PASS") gateReasons.push(`Evidence ${check.requirement_id} is ${check.result}.`);
  }
  const requiredEvidence = [...new Set([...(classification?.evidence_required ?? []), ...(blueprint?.evidence_required ?? [])])];
  for (const requirementId of requiredEvidence) {
    const matchingChecks = checks.filter((check) => check.requirement_id === requirementId);
    const matchingArtifacts = (taskManifest?.artifacts ?? []).filter((artifact) => artifact.artifact_id === requirementId && validArtifactEvidence.has(artifact.artifact_id));
    if (matchingChecks.length + matchingArtifacts.length !== 1) errors.push(`EVIDENCE required evidence ${requirementId} resolved to ${matchingChecks.length + matchingArtifacts.length}; exactly one PASS verdict or valid artifact is required.`);
    if (matchingChecks.length === 1 && matchingChecks[0].result !== "PASS") gateReasons.push(`Required evidence ${requirementId} is not PASS.`);
    if (requirements.some((item) => item.requirement_id === requirementId)) errors.push(...resolveUniqueRequirement(requirements, requirementId).violations);
    if (matchingArtifacts.length === 1) errors.push(...resolveUniqueArtifact(taskManifest.artifacts, requirementId).violations);
  }
  for (const requirement of requirements) {
    const verdicts = checks.filter((check) => check.requirement_id === requirement.requirement_id);
    if (verdicts.length > 1) errors.push(`EVIDENCE requirement ${requirement.requirement_id} has ${verdicts.length} verdicts.`);
  }

  if (securityEvidence?.claims && securityEvidence?.scan_contract) {
    const external = (taskManifest?.artifacts ?? []).filter((item) => item.evidence_scope === "external_reference");
    const currentBootstrapScan = securityEvidence.scan_contract?.scan_contract_version === 5;
    if (currentBootstrapScan && securityEvidence.claims.declared_scan_contract_executed !== true) errors.push("SECURITY_EVIDENCE declared scanner contract execution must be true.");
    if (currentBootstrapScan && securityEvidence.claims.no_findings_within_declared_contract !== governanceScanPassed) errors.push("SECURITY_EVIDENCE finding claim disagrees with deterministic manifest scan.");
    if (securityEvidence.claims.external_evidence_globally_clean !== undefined && securityEvidence.claims.external_evidence_globally_clean !== false) errors.push("SECURITY_EVIDENCE cannot claim external evidence globally clean.");
    if (securityEvidence.claims.global_sensitive_data_absence_verified !== undefined && securityEvidence.claims.global_sensitive_data_absence_verified !== false) errors.push("SECURITY_EVIDENCE cannot claim global sensitive-data absence.");
    if (currentBootstrapScan && securityEvidence.scan_contract.manifest_sha256 !== sha256(governance.manifestBytes ?? "")) errors.push("SECURITY_EVIDENCE manifest hash mismatch.");
    if (currentBootstrapScan && (securityEvidence.scan_contract.scanned_file_count !== governance.files.length || securityEvidence.scan_contract.scanned_file_set_sha256 !== canonicalSha256(governance.files))) errors.push("SECURITY_EVIDENCE scanned file set does not match the manifest.");
    if (currentBootstrapScan) {
      const expectedScannerBindings = {
        contract_sha256: scanBundle?.hashes?.contract_sha256,
        finding_registry_sha256: scanBundle?.hashes?.finding_registry_sha256,
        canonicalization_config_sha256: scanBundle?.hashes?.canonicalization_config_sha256,
        binary_oracle_config_sha256: scanBundle?.hashes?.binary_oracle_config_sha256,
        binary_magic_registry_sha256: scanBundle?.hashes?.binary_magic_registry_sha256,
        schema_set_sha256: scanBundle?.hashes?.schema_set_sha256
      };
      for (const [field, expected] of Object.entries(expectedScannerBindings)) {
        if (securityEvidence.scan_contract[field] !== expected) errors.push(`SECURITY_EVIDENCE scanner binding ${field} mismatch.`);
      }
    }
    if (!currentBootstrapScan) gateReasons.push("Legacy scanner evidence cannot satisfy the bootstrap candidate Gate.");
    const byArtifact = new Map((securityEvidence.external_evidence ?? []).map((item) => [item.artifact_id, item]));
    for (const artifact of external) {
      const item = byArtifact.get(artifact.artifact_id);
      if (!item) { errors.push(`SECURITY_EVIDENCE missing external artifact ${artifact.artifact_id}.`); continue; }
      for (const field of ["path", "evidence_scope", "commit_inclusion", "content_scan_status", "contains_operational_paths", "contains_dump_reference", "credential_scan_status", "redaction_status", "source_verification_status"]) if (item[field] !== artifact[field]) errors.push(`SECURITY_EVIDENCE ${artifact.artifact_id} field ${field} disagrees with manifest.`);
    }
  }

  const requiredReviewTypes = new Set([...(classification?.required_reviews ?? []), ...automaticReviews(classification ?? { level: "L3", execution_categories: [] })]);
  const classificationAgents = new Set(classification?.required_agents ?? []), blueprintAgents = new Set(blueprint?.required_agents ?? []);
  if (classification && blueprint && (classificationAgents.size !== blueprintAgents.size || [...classificationAgents].some((role) => !blueprintAgents.has(role)))) errors.push("AGENTS classification and Blueprint required_agents must match.");
  const reviewList = findings?.reviews ?? [], byType = new Map(), sessions = new Map(), reviewerRuns = new Map();
  let typedDomainRouting = null;
  for (const review of reviewList) {
    if (!outcomes.has(review.outcome)) errors.push(`REVIEW unknown outcome ${review.outcome}.`);
    if (byType.has(review.type)) errors.push(`REVIEW duplicate review type ${review.type}.`);
    else byType.set(review.type, review);
    const conditions = review.conditions ?? [], decisions = review.decisions_required ?? [];
    if (review.outcome === "PASS" && (conditions.length || decisions.length)) errors.push(`REVIEW ${review.type} PASS must have no conditions or decisions.`);
    if (review.outcome === "PASS_WITH_CONDITIONS") {
      if (!conditions.length || decisions.length) errors.push(`REVIEW ${review.type} conditional outcome is malformed.`);
      if (conditions.some((item) => item.status !== "resolved")) gateReasons.push(`${review.type} review has unresolved conditions.`);
      for (const condition of conditions.filter((item) => item.status === "resolved")) if (!condition.resolution_evidence?.length || !condition.reviewer_revalidation) errors.push(`REVIEW ${review.type} resolved condition lacks evidence/revalidation.`);
    }
    const domainRouting = review.type === "railway-domain" ? routeDomainReview(review) : null;
    if (domainRouting) {
      if (domainRouting.typed) {
        const typedReview = {review_scope: review.review_scope, reviewer_binding: review.reviewer_binding, governance_mechanism_outcome: review.governance_mechanism_outcome, external_decisions: review.external_decisions};
        const dedicatedSchema = schemaSet?.byName.get("railway-domain-review.schema.json");
        if (!dedicatedSchema) errors.push("SCHEMA_SET Railway Domain Review Schema is unavailable.");
        else for (const issue of validateSchema(dedicatedSchema, typedReview, `review-findings.yaml.reviews[${reviewList.indexOf(review)}].railway-domain`)) errors.push(`SCHEMA ${issue}`);
        for (const issue of await validateFormalRailwayReviewerBinding({projectRoot, review, blueprint, handoff, governanceManifest: governance.manifest})) errors.push(`REVIEWER_BINDING ${issue}`);
      }
      errors.push(...domainRouting.violations);
      candidateReasons.push(...domainRouting.candidate_reasons);
      migrationReasons.push(...domainRouting.migration_320_reasons);
      if (domainRouting.typed) typedDomainRouting = domainRouting;
    }
    if (review.outcome === "BLOCKER") {
      if (review.type !== "railway-domain" || !domainRouting?.typed) gateReasons.push(`${review.type} review returned BLOCKER.`);
      if (!(review.finding_refs ?? []).length) errors.push(`REVIEW ${review.type} BLOCKER lacks finding reference.`);
    }
    if (review.outcome === "NEEDS_HUMAN_DECISION") {
      if (review.type !== "railway-domain") gateReasons.push(`${review.type} review returned NEEDS_HUMAN_DECISION.`);
      if (!decisions.length) errors.push(`REVIEW ${review.type} lacks structured decision data.`);
    }
  }
  for (const type of requiredReviewTypes) {
    const role = type === "qa-readback" ? "qa-engineer" : `${type}-reviewer`;
    if (!classificationAgents.has(role) || !blueprintAgents.has(role)) errors.push(`AGENTS required review ${type} requires role ${role}.`);
    const review = byType.get(type);
    if (!review) { gateReasons.push(`Missing required ${type} review.`); continue; }
    if (review.formal && review.reviewer !== role) errors.push(`REVIEW_ROLE ${type} formal reviewer must equal required role ${role}.`);
    if (!review.formal) gateReasons.push(`${type} review is not formal.`);
    if (classification?.level === "L3") {
      if (!review.reviewer_run_id || !review.session_id) gateReasons.push(`${type} review lacks run/session identity.`);
      if (review.session_id === handoff?.agent_session_ref) gateReasons.push(`${type} reviewer session matches implementer session.`);
      if (review.session_id && sessions.has(review.session_id)) gateReasons.push(`${type} reuses reviewer session.`);
      if (review.reviewer_run_id && reviewerRuns.has(review.reviewer_run_id)) gateReasons.push(`${type} reuses reviewer run.`);
      if (review.session_id) sessions.set(review.session_id, type);
      if (review.reviewer_run_id) reviewerRuns.set(review.reviewer_run_id, type);
    }
  }
  if ((blueprint?.candidate_rules ?? []).length && byType.get("railway-domain")?.outcome !== "NEEDS_HUMAN_DECISION") migrationReasons.push("Candidate Rules lack a Railway Domain NEEDS_HUMAN_DECISION record.");
  if ((findings?.blockers ?? []).length) {
    if (taskId === "GOV-M320-DRYRUN") migrationReasons.push("Top-level Migration 320 blockers remain recorded.");
    else gateReasons.push("Top-level unresolved candidate blockers remain recorded.");
  }
  if ((findings?.conditions ?? []).some((item) => item.status !== "resolved")) gateReasons.push("Top-level review conditions remain open.");
  if (intent?.status === "DRAFT" || classification?.classification_status === "proposed") gateReasons.push("Task or classification remains draft/proposed.");

  if (classification?.level === "L3") {
    if (!classification.human_approval?.required || !blueprint?.human_approval?.required || !approval?.required) errors.push("L3 human approval must be required.");
    const expectedStages = ["scope_approval", "execution_approval", "review_completion", "final_commit_approval"];
    if (JSON.stringify(classification.human_approval?.stages ?? []) !== JSON.stringify(expectedStages)) errors.push("L3 classification must declare four ordered stages.");
    const approvalByStage = new Map();
    for (const item of approval?.approvals ?? []) {
      if (approvalByStage.has(item.stage)) errors.push(`APPROVAL duplicate stage ${item.stage}.`);
      else approvalByStage.set(item.stage, item);
    }
    for (const stage of expectedStages) if (!approvalByStage.has(stage)) errors.push(`APPROVAL missing L3 stage ${stage}.`);
    const scopeApproval = approvalByStage.get("scope_approval"), executionApproval = approvalByStage.get("execution_approval");
    if (scopeApproval?.status !== "approved") gateReasons.push("L3 scope approval is not approved.");
    if (scopeApproval && handoff?.started_at && Date.parse(scopeApproval.at) > Date.parse(handoff.started_at)) errors.push("APPROVAL scope approval occurred after implementation start.");
    const executionCategories = classification.execution_categories;
    if (!Array.isArray(executionCategories) || !executionCategories.length) gateReasons.push("Structured execution categories are missing; execution sensitivity fails closed.");
    const sensitiveExecution = (executionCategories ?? []).some((item) => ["migration", "database", "credential", "external-system", "sensitive-evidence", "git-mutation", "destructive"].includes(item));
    if (sensitiveExecution && executionApproval?.status !== "approved") gateReasons.push("Sensitive L3 execution approval is not approved.");
    if (!sensitiveExecution && !["approved", "not-required"].includes(executionApproval?.status)) gateReasons.push("L3 execution approval is unresolved.");
    const finalApproval = approvalByStage.get("final_commit_approval");
    const reviewsComplete = [...requiredReviewTypes].every((type) => {
      const review = byType.get(type);
      return review?.formal && (review.outcome === "PASS" || (review.outcome === "PASS_WITH_CONDITIONS" && review.conditions?.length && review.conditions.every((item) => item.status === "resolved" && item.resolution_evidence?.length && item.reviewer_revalidation)));
    });
    if (approvalByStage.get("review_completion")?.status === "approved" && (!reviewsComplete || findings?.blockers?.length || findings?.conditions?.some((item) => item.status !== "resolved"))) errors.push("APPROVAL review completion precedes complete clean Reviews.");

    const manifestSha = governance.manifestBytes ? sha256(governance.manifestBytes) : null;
    const fileSetSha = governance.files.length ? canonicalSha256(governance.files) : null;
    const hasBootstrapRecord = Boolean(approval?.bootstrap_candidate_ref);
    const hasBootstrapScanner = Boolean(approval?.bootstrap_scanner_report_ref);
    if (hasBootstrapRecord !== hasBootstrapScanner) errors.push("BOOTSTRAP_CANDIDATE candidate record and scanner report refs must be supplied together.");
    if (hasBootstrapRecord && hasBootstrapScanner) await validateBootstrapRecordRef({
      projectRoot,
      recordRef: approval.bootstrap_candidate_ref,
      scannerReportRef: approval.bootstrap_scanner_report_ref,
      expected: { record_type: BOOTSTRAP_RECORD_TYPE, assurance: BOOTSTRAP_ASSURANCE, task_id: approval.bootstrap_candidate_subject_task_id ?? taskId, manifest_sha256: manifestSha, included_file_set_sha256: fileSetSha, file_count: governance.files.length, scan_contract_sha256: scanBundle?.hashes?.contract_sha256, finding_registry_sha256: scanBundle?.hashes?.finding_registry_sha256, canonicalization_config_sha256: scanBundle?.hashes?.canonicalization_config_sha256, binary_oracle_config_sha256: scanBundle?.hashes?.binary_oracle_config_sha256, binary_magic_registry_sha256: scanBundle?.hashes?.binary_magic_registry_sha256, schema_set_sha256: scanBundle?.hashes?.schema_set_sha256, evidence_schema_registry_sha256: scanBundle?.hashes?.evidence_schema_registry_sha256, referenced_evidence_policy_sha256: scanBundle?.hashes?.referenced_evidence_policy_sha256 },
      governance,
      errors,
      gateReasons,
      schemaSet
    });
    else gateReasons.push("Bootstrap candidate record and bound scanner report are missing.");
    if (finalApproval?.status === "approved") {
      if (!hasBootstrapRecord || !hasBootstrapScanner) errors.push("APPROVAL bootstrap human commit decision requires an exact internally consistent candidate and scanner record.");
      if (!reviewsComplete || findings?.blockers?.length || findings?.conditions?.some((item) => item.status !== "resolved") || candidateReasons.length) errors.push("APPROVAL final commit precedes a clear deterministic candidate-review gate.");
    }
    const dated = expectedStages.map((stage) => approvalByStage.get(stage)).filter((item) => item && ["approved", "not-required"].includes(item.status)).map((item) => Date.parse(item.at));
    if (dated.some((value, index) => index > 0 && value < dated[index - 1])) errors.push("APPROVAL stage chronology is invalid.");
    if (executionApproval && handoff?.started_at && Date.parse(executionApproval.at) > Date.parse(handoff.started_at)) errors.push("APPROVAL execution decision occurred after implementation start.");
  } else if (approval?.required && approval.status !== "approved") gateReasons.push("Required human approval is not approved.");

  if (traceability) {
    const nodeIds = traceability.nodes.map((node) => node.id);
    if (new Set(nodeIds).size !== nodeIds.length) errors.push("GRAPH traceability node IDs must be unique.");
    for (const ref of [...traceability.nodes.map((node) => node.source_ref), ...traceability.edges.map((edge) => edge.source_ref)]) {
      const fileRef = ref.replace(/:(\d+)$/, "");
      try { await safeExistingPath(projectRoot, fileRef); } catch (error) { errors.push(`GRAPH source_ref ${ref}: ${error.message}`); }
    }
    for (const edge of traceability.edges) if (!nodeIds.includes(edge.from) || !nodeIds.includes(edge.to)) errors.push(`GRAPH edge ${edge.from}->${edge.to} references missing node.`);
  }

  const approvalByStage = new Map((approval?.approvals ?? []).map((item) => [item.stage, item]));
  const gateResults = computeAuthoritativeGateMap({
    candidate_gate_blockers: candidateReasons,
    referenced_evidence_validation: referencedEvidenceValidation,
    human_commit: {
      session_b_pass: approval?.session_b_outcome === "PASS",
      human_exact_manifest_approved: approval?.human_exact_manifest_approved === true,
      post_review_baseline_unchanged: approval?.post_review_baseline_unchanged === true,
      explicit_first_commit_authorization: approval?.status === "approved" && approvalByStage.get("final_commit_approval")?.status === "approved"
    },
    steady_state_anchor: {
      bootstrap_commit_sha: approval?.bootstrap_commit_sha,
      bootstrap_manifest_sha256: approval?.bootstrap_manifest_sha256,
      human_bootstrap_attestation: approval?.human_bootstrap_attestation
    },
    migration_320_gate_blockers: migrationReasons
  });
  const projection = projectAuthoritativeGateMap(gateResults);
  const calculatedGate = projection.calculated_gate;
  for (const [field, expected] of Object.entries(projection)) if (Object.hasOwn(findings ?? {}, field) && findings[field] !== expected) errors.push(`GATE_PROJECTION ${field}=${findings[field]} disagrees with authoritative projection ${expected}.`);
  const summaryGate = rawTexts["final-summary.md"]?.match(/^\s*(?:overall_gate|calculated gate)\s*[:=]\s*(?:\*\*)?(GO|NO-GO)(?:\*\*)?\s*$/im)?.[1];
  if (summaryGate && summaryGate !== calculatedGate) errors.push(`GATE final summary disagrees with ${calculatedGate}.`);
  if (!errors.length && traceability) {
    const graph = expectedGraph(traceability), graphRef = `${taskBase}/task-graph.json`;
    if (options.writeGraph) {
      const graphPath = await safeNewPath(projectRoot, graphRef);
      await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, { encoding: "utf8", flag: "w" });
      await verifyCreatedPath(projectRoot, graphRef);
    } else {
      const existing = await readJsonSafe(projectRoot, graphRef, errors);
      if (existing && JSON.stringify(canonical(existing)) !== JSON.stringify(canonical(graph))) errors.push("GRAPH task-graph.json is stale.");
    }
  }
  const exitCode = exitForGateMap(gateResults, {structural_valid: errors.length === 0, target_gate: targetGate});
  return { exitCode, calculatedGate, projection, targetGate, gateResults, errors, gateReasons: candidateReasons, candidateReasons, migrationReasons, effectiveScope, actorScope, ruleSelection, proofAssurance: BOOTSTRAP_ASSURANCE, typedDomainRouting, referencedEvidenceValidation };
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(`VALIDATION_ERROR ARGUMENT: ${error.message}`); process.exit(1); }
  const result = await validateTask(args["task-id"], { writeGraph: Boolean(args.writeGraph), targetGate: args["target-gate"] });
  for (const error of result.errors) console.error(`VALIDATION_ERROR ${error}`);
  for (const reason of result.candidateReasons ?? []) console.error(`GATE_NO_GO bootstrap_candidate_review ${reason}`);
  for (const reason of result.migrationReasons ?? []) console.error(`GATE_NO_GO migration_320_execution ${reason}`);
  console.log(`GATE_RESULTS ${JSON.stringify(result.gateResults)}`);
  const selected = result.targetGate ? `${result.targetGate}:${result.gateResults[result.targetGate]?.status}` : "conservative:aggregate";
  console.log(`VALIDATE_TASK_RESULT task_id=${args["task-id"] ?? ""} calculated_gate=${result.calculatedGate} target_gate=${selected} structural=${result.errors.length ? "INVALID" : "VALID"} exit=${result.exitCode} bootstrap_candidate_review=${result.gateResults.bootstrap_candidate_review.status} bootstrap_human_commit=${result.gateResults.bootstrap_human_commit.status} steady_state_preparation=${result.gateResults.steady_state_preparation.status} steady_state_execution=${result.gateResults.steady_state_execution.status} migration_320_execution=${result.gateResults.migration_320_execution.status} proof_assurance=${result.proofAssurance}`);
  process.exit(result.exitCode);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
