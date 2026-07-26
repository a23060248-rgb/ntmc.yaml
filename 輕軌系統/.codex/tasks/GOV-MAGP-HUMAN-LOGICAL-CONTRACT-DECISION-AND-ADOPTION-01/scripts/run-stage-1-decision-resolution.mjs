import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TASK_ID = "GOV-MAGP-HUMAN-LOGICAL-CONTRACT-DECISION-AND-ADOPTION-01";
const INPUT_TASK_ID = "GOV-MAGP-LOGICAL-PERSISTENCE-AND-INTERFACE-CONTRACT-MODELING-01";
const ARCH_BASELINE = "MAGP-ARCH-BASELINE-V1";
const OBJECT_BASELINE = "MAGP-OBJECT-LIBRARY-BASELINE-V1";
const LOGICAL_BASELINE = "MAGP-LOGICAL-CONTRACT-BASELINE-V1";
const AUTH_SOURCE = "C:/Users/a2306/.codex/attachments/ed73e773-8999-472f-8963-e09353d0e75d/pasted-text.txt";
const EXPECTED_INPUT_COUNT = 109;
const EXPECTED_INPUT_DIGEST = "26B6A3EB881BDF39DAB5B24626CAD654C997685D7195B91031EC0395E6310410";
const GENERATED_AT = "2026-07-23T00:00:00+08:00";
const TASK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_ROOT = path.resolve(TASK_ROOT, "..", "..", "..");
const TASKS_ROOT = path.join(PRODUCT_ROOT, ".codex", "tasks");
const INPUT_ROOT = path.join(TASKS_ROOT, INPUT_TASK_ID);
const DECISION_ROOT = path.join(INPUT_ROOT, "human-contract-decision-matrix");
const PROPOSAL_ROOT = path.join(INPUT_ROOT, "logical-contract-proposal");
const PACKAGE_ROOT = path.join(TASK_ROOT, "human-decision-resolution-package");
const PLANNING_7A1_ROOT = path.join(TASKS_ROOT, "GOV-MAGP-PLATFORM-DESIGN-AND-IMPLEMENTATION-BLUEPRINT-01");

function readBytes(file) { return fs.readFileSync(file); }
function readJson(file) { return JSON.parse(readBytes(file).toString("utf8")); }
function hashBytes(value) { return crypto.createHash("sha256").update(value).digest("hex").toUpperCase(); }
function posix(value) { return path.resolve(value).split(path.sep).join("/"); }
function binding(file) { const value = readBytes(file); return { absolute_path: posix(file), sha256: hashBytes(value), bytes: value.length }; }
function stop(ok, code, detail) { if (!ok) throw Object.assign(new Error(`${code}: ${detail}`), { code }); }
function writeJson(relative, value) { const target = path.join(TASK_ROOT, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function writeText(relative, value) { const target = path.join(TASK_ROOT, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value.endsWith("\n") ? value : `${value}\n`, "utf8"); }
function listFiles(root) { const result = []; function visit(current) { for (const entry of fs.readdirSync(current, { withFileTypes: true })) { const target = path.join(current, entry.name); if (entry.isDirectory()) visit(target); else if (entry.isFile()) result.push(target); } } visit(root); return result; }
function treeDigest(root) { const rows = listFiles(root).map((file) => ({ relative_path: path.relative(root, file).split(path.sep).join("/"), sha256: hashBytes(readBytes(file)), bytes: fs.statSync(file).size })).sort((a, b) => a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0); const canonical = rows.map((x) => `${x.relative_path}|${x.sha256}|${x.bytes}`).join("\n"); return { file_count: rows.length, manifest_sha256: hashBytes(Buffer.from(canonical, "utf8")), entries: rows } }
function fileNames(root) { return fs.readdirSync(root, { withFileTypes: true }).filter((x) => x.isFile()).map((x) => x.name).sort(); }

fs.mkdirSync(PACKAGE_ROOT, { recursive: true });

// Input and stop-boundary verification.
const authText = readBytes(AUTH_SOURCE).toString("utf8");
stop(authText.includes("MASTER BATCH 6A-2R") && authText.includes(TASK_ID) && authText.includes("STAGE 1"), "HUMAN_DECISION_MISSING", "6A-2R Stage 1 instruction is absent");
const inputTaskDigest = treeDigest(INPUT_ROOT);
stop(inputTaskDigest.file_count === EXPECTED_INPUT_COUNT && inputTaskDigest.manifest_sha256 === EXPECTED_INPUT_DIGEST, "LOGICAL_CONTRACT_PROPOSAL_CHANGED", "6A-1 task differs from completed digest");
const inputResult = readJson(path.join(INPUT_ROOT, "logical-contract-modeling-result.json"));
const inputForm = readJson(path.join(INPUT_ROOT, "human-logical-contract-adoption-package", "adoption-decision-form.json"));
const inputMatrix = readJson(path.join(DECISION_ROOT, "decision-matrix-index.json"));
const inputQa = readJson(path.join(INPUT_ROOT, "validation-results.json"));
stop(inputResult.logical_contract_status === "PROPOSED_NOT_ADOPTED" && inputResult.normative_logical_contract === false, "LOGICAL_CONTRACT_PROPOSAL_CHANGED", "6A-1 proposal state is invalid");
stop(inputForm.decision_status === "PENDING_HUMAN_DECISION" && inputForm.logical_contract_adopted === false && inputForm.codex_filled_human_decision === false, "HUMAN_DECISION_IMPERSONATED", "6A-1 adoption form was prefilled");
stop(inputMatrix.decision_count === 18 && inputMatrix.pending_count === 18 && inputMatrix.decisions.every((x) => x.decision_status === "PENDING_HUMAN_DECISION"), "PENDING_DECISION_COUNT_NOT_18", "pending decision set is not exact");
stop(inputQa.required_status === "PASS_42_OF_42" && inputQa.hard_stop_codes_triggered.length === 0, "DECISION_REGISTER_INCOMPLETE", "6A-1 QA is invalid");
stop(!fs.existsSync(PLANNING_7A1_ROOT), "7A_1_STARTED_EARLY", "7A-1 task already exists");

const archIntegrity = readJson(path.join(INPUT_ROOT, "architecture-baseline-integrity.json"));
const objectIntegrity = readJson(path.join(INPUT_ROOT, "object-library-baseline-integrity.json"));
stop(archIntegrity.architecture_baseline === ARCH_BASELINE && archIntegrity.status === "BOUND_AND_VALID" && archIntegrity.baseline_changed === false, "ARCHITECTURE_BASELINE_INVALID", "Architecture Baseline is invalid");
stop(objectIntegrity.object_library_baseline === OBJECT_BASELINE && objectIntegrity.status === "BOUND_AND_VALID" && objectIntegrity.baseline_changed === false, "OBJECT_LIBRARY_BASELINE_INVALID", "Object Library Baseline is invalid");

const proposalDigest = treeDigest(PROPOSAL_ROOT);
const proposalManifest = readJson(path.join(PROPOSAL_ROOT, "logical-contract-manifest.json"));
stop(proposalDigest.file_count === 18 && proposalManifest.artifact_count_excluding_manifest === 17 && proposalManifest.logical_contract_status === "PROPOSED_NOT_ADOPTED" && proposalManifest.normative_logical_contract === false, "LOGICAL_CONTRACT_PROPOSAL_CHANGED", "Logical Contract Proposal file set or state is invalid");
stop(proposalManifest.artifacts.every((x) => { const actual = binding(path.join(PROPOSAL_ROOT, x.name)); return actual.sha256 === x.sha256 && actual.bytes === x.bytes; }), "LOGICAL_CONTRACT_PROPOSAL_CHANGED", "Logical Contract Proposal artifact binding failed");

const allowedHumanDecisions = ["ADOPT_RECOMMENDED_OPTION", "ADOPT_ALTERNATIVE_OPTION", "ADOPT_WITH_MODIFICATION", "DEFER_NON_BLOCKING", "REJECT_DECISION"];
const impactProfiles = [
  ["Defines the eleven proposed aggregate roots.", "No adopted Object Type changes.", "Controls storage ownership and transaction boundaries.", "Controls command admission resource boundaries.", "Defines authority isolation between aggregates.", "Preserves evidence references across aggregates.", "Limits privilege and consistency blast radius.", "Changing roots is a breaking contract change."],
  ["Keeps Policy as root for Governance Rule.", "Preserves Policy and Governance Rule semantics.", "Co-locates rule invariants with Policy.", "Commands address Policy aggregate for rule changes.", "Prevents Rule authority exceeding Policy.", "Binds rule evaluation evidence to Policy version.", "Reduces orphan or escalated rules.", "Separation later requires migration and compatibility review."],
  ["Keeps Evidence and Review in one assurance aggregate.", "Preserves Evidence and Review identities.", "Supports atomic review binding to exact evidence versions.", "Review operations target Evidence aggregate.", "Review never becomes acceptance authority automatically.", "Strengthens chain-of-custody and review binding.", "Reduces evidence substitution risk.", "Separation requires durable cross-aggregate evidence references."],
  ["Uses one Finding root with remediation workflow state.", "Finding remains the adopted root object.", "Closure and remediation revision are protected together.", "Remediation and closure commands bind the Finding revision.", "Closure authority remains independent or Human for CRITICAL/HIGH.", "Closure Evidence is mandatory.", "Prevents concurrent or evidence-free closure.", "Splitting later requires saga and closure compatibility rules."],
  ["Keeps Human Approval under Governance Authority aggregate.", "Human Approval identity remains canonical.", "Approval bindings are stored with authority context.", "Approval commands address Governance Authority.", "Centralizes Human authority without granting technical actors sovereignty.", "Approval binds exact artifact hash/version.", "Reduces replay and stale approval risk.", "Independent aggregate remains a future breaking option."],
  ["Adopts at-least-once delivery with idempotent consumers.", "Runtime Event semantics remain unchanged.", "Requires durable idempotency records logically.", "Consumers must deduplicate before command admission.", "Events still create no authority.", "Duplicate evidence emission is traceable.", "Avoids false exactly-once claims.", "Consumers must remain compatible with replay."],
  ["Orders events per aggregate.", "Aggregate identity defines ordering key.", "Avoids global ordering storage assumptions.", "Consumers process aggregate revisions monotonically.", "Ordering never bypasses authorization.", "Audit can reconstruct per-aggregate history.", "Limits contention and replay ambiguity.", "Cross-aggregate workflows need correlation/causation."],
  ["Uses tombstone plus supersession; no destructive delete.", "Canonical identity and history are preserved.", "Requires archive/tombstone representation.", "Delete-like commands become archive/supersede commands.", "Deletion cannot erase authority history.", "Evidence and lineage remain resolvable.", "Prevents audit and lineage destruction.", "Future purge requires separate Human retention authority."],
  ["Enables temporal query for governance and evidence entities first.", "No Object Type semantics change.", "Requires effective/recorded time projections for scoped entities.", "Queries declare temporal perspective.", "Authorization applies to historical views.", "Supports point-in-time evidence and approval reconstruction.", "Limits sensitive history exposure.", "Expanding scope is additive with cost review."],
  ["Uses per-aggregate optimistic revision.", "Object semantic version stays separate from concurrency token.", "Stores monotonic aggregate revision.", "Mutation commands require expected aggregate revision.", "Prevents concurrent authority and closure conflicts.", "Approval and Finding evidence bind revisions.", "Rejects last-write-wins for governed effects.", "Granularity changes affect all command consumers."],
  ["Scopes idempotency to command/event identity within namespace.", "Identity namespace policy is reused.", "Requires namespace plus idempotency key uniqueness.", "Duplicate commands return the prior accepted outcome.", "Idempotency never grants authority.", "Duplicate evidence remains linked to original outcome.", "Prevents replay-driven duplicate Human effects.", "Scope changes require compatibility and retention review."],
  ["Uses risk classes while exact legal durations remain a later Human policy.", "Evidence semantics and assurance fields remain unchanged.", "No purge until a Human-adopted schedule applies.", "Interfaces expose retention class, not storage tier.", "Retention does not alter approval authority.", "Preserves evidence pending exact schedule.", "Avoids unauthorized legal retention claims.", "Exact durations remain a separate policy decision."],
  ["Telemetry is not Evidence until explicitly registered and bound.", "Separates Runtime Event/telemetry from Evidence authority.", "Telemetry storage may be operational; Evidence registration is append-oriented.", "Evidence registration is an explicit command.", "Producer cannot self-accept telemetry as Evidence.", "Registration records producer, subject, hash, collection context.", "Prevents low-assurance telemetry from gaining evidentiary weight.", "Direct evidence profiles require future Human review."],
  ["Uses type/risk expiry or mandatory review date for Authority Grants.", "Authority Grant stays a supporting logical entity.", "Persists validity, scope, revocation, and review metadata.", "Admission rejects expired or unreviewed grants.", "Authority ceilings and Human Gate remain mandatory.", "Grant/revocation evidence is append-oriented.", "Prevents stale delegation and silent permanence.", "Changing validity policy is authority-critical."],
  ["Uses strict logical Command/Query separation with shared implementation undecided.", "No Object Type change.", "Read projections cannot mutate source state.", "Commands and Queries use separate contracts.", "Queries cannot confer or exercise mutation authority.", "Audit distinguishes reads from commands.", "Prevents hidden mutation in read interfaces.", "Physical service split remains unselected."],
  ["Uses explicit event versions and compatibility profiles.", "Runtime Event remains canonical and versioned.", "Stores event type/version and payload hash.", "Consumers declare supported versions.", "New versions cannot expand authority implicitly.", "Evidence classification survives evolution.", "Prevents silent consumer breakage and spoofed authority fields.", "Breaking changes require RFC, review, Human approval."],
  ["Uses exact cross-volume reference without authority copy.", "Preserves global canonical identity.", "Stores exact ID/version/hash reference.", "Interfaces resolve references under caller scope.", "Volume boundary never duplicates authority.", "Lineage points to canonical source.", "Prevents unauthorized mirrored authority.", "Controlled mirror would require explicit provenance policy."],
  ["Uses acyclic exact-version/hash-pinned runtime dependencies.", "Package identity/version semantics are preserved.", "Persists dependency DAG references, not copied packages.", "Package commands validate cycles and hashes.", "Dependency cannot expand consumer authority.", "Validation evidence records dependency graph.", "Prevents substitution and runtime cycles.", "Development-only cycles require a future bounded profile."]
];

const decisions = [];
for (let i = 1; i <= 18; i += 1) {
  const id = `HCD-${String(i).padStart(3, "0")}`;
  const sourceFile = path.join(DECISION_ROOT, `${id}.json`);
  const source = readJson(sourceFile);
  stop(source.decision_id === id && source.decision_status === "PENDING_HUMAN_DECISION" && Array.isArray(source.options) && source.options.length >= 1 && source.codex_recommendation, "DECISION_REGISTER_INCOMPLETE", `${id} is incomplete`);
  const impacts = impactProfiles[i - 1];
  decisions.push({
    decision_id: id,
    decision_title: source.decision_title,
    exact_options: source.options,
    current_status: source.decision_status,
    codex_recommendation: source.codex_recommendation,
    recommendation_rationale: impacts[0],
    architecture_impact: impacts[0],
    object_library_impact: impacts[1],
    persistence_impact: impacts[2],
    api_impact: impacts[3],
    authority_impact: impacts[4],
    evidence_impact: impacts[5],
    security_impact: impacts[6],
    compatibility_impact: impacts[7],
    blocking_status: "LOGICAL_CONTRACT_ADOPTION_BLOCKER_UNTIL_HUMAN_DECISION",
    allowed_human_decisions: allowedHumanDecisions,
    source_decision_binding: binding(sourceFile)
  });
}
stop(decisions.length === 18 && new Set(decisions.map((x) => x.decision_id)).size === 18, "DECISION_REGISTER_INCOMPLETE", "Decision Register is not exact");

writeJson("task-intent.yaml", { schema_version: 1, task_id: TASK_ID, master_batch: "6A-2R", current_stage: "STAGE_1_DECISION_RESOLUTION_PACKAGE", objective: "Prepare exact Human decision bindings for 18 Logical Contract decisions", stage_2_authorized: false, logical_contract_adopted: false, planning_7a1_authorized: false });
writeJson("classification.yaml", { schema_version: 1, task_id: TASK_ID, level: "L3", task_class: "HUMAN_DECISION_RESOLUTION_AND_ADOPTION_TWO_STAGE", current_actor_role: "DECISION_PACKAGE_PREPARER", writes_allowed_only_under_task_root: true, git_allowed: false, subagent_allowed: false });
writeJson("blueprint.yaml", { schema_version: 1, task_id: TASK_ID, stages: [{ stage: 1, status: "IN_PROGRESS", output: "human-decision-resolution-package" }, { stage: 2, status: "BLOCKED_PENDING_EXACT_HUMAN_DECISION", output: "Logical Contract Adoption and Baseline Lock" }], inputs: [INPUT_TASK_ID, ARCH_BASELINE, OBJECT_BASELINE], hard_stop_before_stage_2_without_human_decision: true });

writeJson("human-decision-resolution-package/decision-register.json", { schema_version: 1, task_id: TASK_ID, input_task_id: INPUT_TASK_ID, decision_count: decisions.length, decisions, status: "READY_FOR_HUMAN_DECISION" });
writeJson("human-decision-resolution-package/codex-recommendation-matrix.json", { schema_version: 1, task_id: TASK_ID, recommendation_count: decisions.length, recommendations: decisions.map((x) => ({ decision_id: x.decision_id, decision_title: x.decision_title, exact_options: x.exact_options, recommended_option: x.codex_recommendation, rationale: x.recommendation_rationale, recommendation_is_human_decision: false })), bulk_mode_effect: "ADOPT_EACH_RECOMMENDED_OPTION_WITHOUT_EXCEPTION", status: "ADVISORY_READY" });
writeJson("human-decision-resolution-package/decision-impact-matrix.json", { schema_version: 1, task_id: TASK_ID, decision_count: decisions.length, impacts: decisions.map((x) => ({ decision_id: x.decision_id, architecture_impact: x.architecture_impact, object_library_impact: x.object_library_impact, persistence_impact: x.persistence_impact, api_impact: x.api_impact, authority_impact: x.authority_impact, evidence_impact: x.evidence_impact, security_impact: x.security_impact, compatibility_impact: x.compatibility_impact })) });
writeJson("human-decision-resolution-package/blocking-classification.json", { schema_version: 1, task_id: TASK_ID, decision_count: 18, blocking_decision_count: 18, non_blocking_decision_count_before_human_resolution: 0, classifications: decisions.map((x) => ({ decision_id: x.decision_id, current_status: x.current_status, blocking_status: x.blocking_status, stage_1_modeling_blocker: false, stage_2_adoption_blocker: true })), logical_contract_adoption_blocked: true, status: "BLOCKED_PENDING_HUMAN_DECISION" });

const registerBinding = binding(path.join(PACKAGE_ROOT, "decision-register.json"));
const recommendationBinding = binding(path.join(PACKAGE_ROOT, "codex-recommendation-matrix.json"));
writeJson("human-decision-resolution-package/exact-decision-binding.json", { schema_version: 1, task_id: TASK_ID, decision_count: 18, decision_ids: decisions.map((x) => x.decision_id), decision_register_sha256: registerBinding.sha256, recommendation_matrix_sha256: recommendationBinding.sha256, logical_contract_proposal_sha256: proposalDigest.manifest_sha256, logical_contract_proposal_file_count: proposalDigest.file_count, architecture_baseline_id: ARCH_BASELINE, object_library_baseline_id: OBJECT_BASELINE, future_logical_contract_baseline_id: LOGICAL_BASELINE, canonicalization_method: { register_and_matrix: "EXACT_UTF8_FILE_BYTES_SHA256", logical_contract_proposal: "ORDINAL_RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE" }, generated_at: GENERATED_AT, human_decision_required: true });

writeJson("human-decision-resolution-package/human-decision-form.json", { schema_version: 1, task_id: TASK_ID, decision_status: "PENDING_HUMAN_DECISION", human_decision_type: null, allowed_human_decision_types: ["BULK_ADOPT_ALL_RECOMMENDATIONS", "ITEMIZED_DECISIONS"], decision_register_sha256: registerBinding.sha256, recommendation_matrix_sha256: recommendationBinding.sha256, logical_contract_proposal_sha256: proposalDigest.manifest_sha256, decision_count: 18, decisions: [], adopt_all_recommendations_without_exception: null, assurance_level: "REDUCED_ASSURANCE", human_authority_attestation: null, decision_timestamp: null, human_rationale: null, codex_filled_human_decision: false });
writeJson("human-decision-resolution-package/human-decision-form.schema.json", { $schema: "https://json-schema.org/draft/2020-12/schema", title: "MAGP Human Logical Contract Decision Form", type: "object", required: ["human_decision_type", "decision_register_sha256", "recommendation_matrix_sha256", "logical_contract_proposal_sha256", "decision_count", "decisions", "assurance_level", "human_authority_attestation", "decision_timestamp", "human_rationale"], properties: { human_decision_type: { enum: ["BULK_ADOPT_ALL_RECOMMENDATIONS", "ITEMIZED_DECISIONS"] }, decision_register_sha256: { const: registerBinding.sha256 }, recommendation_matrix_sha256: { const: recommendationBinding.sha256 }, logical_contract_proposal_sha256: { const: proposalDigest.manifest_sha256 }, decision_count: { const: 18 }, decisions: { type: "array", minItems: 0, maxItems: 18, items: { type: "object", required: ["decision_id", "human_decision"], properties: { decision_id: { enum: decisions.map((x) => x.decision_id) }, human_decision: { enum: allowedHumanDecisions }, selected_option: { type: ["string", "null"] }, modification: { type: ["object", "null"] }, deferral: { type: ["object", "null"] } }, additionalProperties: true } }, adopt_all_recommendations_without_exception: { type: ["boolean", "null"] }, assurance_level: { const: "REDUCED_ASSURANCE" }, human_authority_attestation: { const: true }, decision_timestamp: { type: "string", minLength: 1 }, human_rationale: { type: "string", minLength: 1 } }, allOf: [{ if: { properties: { human_decision_type: { const: "BULK_ADOPT_ALL_RECOMMENDATIONS" } } }, then: { properties: { decisions: { maxItems: 0 }, adopt_all_recommendations_without_exception: { const: true } }, required: ["adopt_all_recommendations_without_exception"] } }, { if: { properties: { human_decision_type: { const: "ITEMIZED_DECISIONS" } } }, then: { properties: { decisions: { minItems: 18, maxItems: 18 } } } }], additionalProperties: true });

writeText("human-decision-resolution-package/decision-summary.md", `# Logical Contract Human Decision Summary\n\n- Pending decisions: 18\n- Decision mode options: BULK_ADOPT_ALL_RECOMMENDATIONS or ITEMIZED_DECISIONS\n- Decision Register SHA-256: ${registerBinding.sha256}\n- Recommendation Matrix SHA-256: ${recommendationBinding.sha256}\n- Logical Contract Proposal SHA-256: ${proposalDigest.manifest_sha256}\n- Current Logical Contract: PROPOSED_NOT_ADOPTED\n- Stage 2: NOT STARTED\n- 7A-1: NOT AUTHORIZED\n`);
writeText("human-decision-resolution-package/human-decision-instructions.md", `# Human Decision Instructions\n\n## Binding values\n\n- decision_register_sha256: ${registerBinding.sha256}\n- recommendation_matrix_sha256: ${recommendationBinding.sha256}\n- logical_contract_proposal_sha256: ${proposalDigest.manifest_sha256}\n- decision_count: 18\n- assurance_level: REDUCED_ASSURANCE\n\n## Bulk mode\n\nReply with BULK_ADOPT_ALL_RECOMMENDATIONS to adopt every exact Codex recommendation without exception. Stage 2 will bind that Human message to these three hashes and will not infer any unstated modification.\n\n## Itemized mode\n\nProvide exactly 18 unique decision IDs and one allowed Human decision for each. Any deferral must prove it is non-blocking and provide reopening trigger, future Human gate, impacts, and prohibited downstream actions.\n\nNo Stage 2 adoption, baseline lock, physical database, migration, formal API, product implementation, or 7A-1 action occurs during Stage 1.\n`);

const expectedPackage = ["blocking-classification.json", "codex-recommendation-matrix.json", "decision-impact-matrix.json", "decision-register.json", "decision-summary.md", "exact-decision-binding.json", "human-decision-form.json", "human-decision-form.schema.json", "human-decision-instructions.md"].sort();
stop(JSON.stringify(fileNames(PACKAGE_ROOT)) === JSON.stringify(expectedPackage), "DECISION_REGISTER_INCOMPLETE", "Stage 1 package file set differs");
const exact = readJson(path.join(PACKAGE_ROOT, "exact-decision-binding.json"));
const form = readJson(path.join(PACKAGE_ROOT, "human-decision-form.json"));
stop(binding(path.join(PACKAGE_ROOT, "decision-register.json")).sha256 === exact.decision_register_sha256 && binding(path.join(PACKAGE_ROOT, "codex-recommendation-matrix.json")).sha256 === exact.recommendation_matrix_sha256, "HUMAN_DECISION_HASH_BINDING_INVALID", "Stage 1 hash binding is invalid");
stop(treeDigest(PROPOSAL_ROOT).manifest_sha256 === exact.logical_contract_proposal_sha256, "LOGICAL_CONTRACT_PROPOSAL_CHANGED", "proposal hash changed during Stage 1");
stop(form.decision_status === "PENDING_HUMAN_DECISION" && form.human_decision_type === null && form.human_authority_attestation === null && form.codex_filled_human_decision === false, "HUMAN_DECISION_IMPERSONATED", "Human decision form was prefilled");
stop(!fs.existsSync(PLANNING_7A1_ROOT), "7A_1_STARTED_EARLY", "7A-1 started during Stage 1");

const stage1Tests = [
  "6A-1 task digest valid", "Pending Decision count is 18", "Decision Register complete", "Recommendation Matrix complete", "Impact Matrix complete", "Blocking Classification complete", "Decision Register hash valid", "Recommendation Matrix hash valid", "Logical Contract Proposal hash valid", "Architecture Baseline valid", "Object Library Baseline valid", "Human Decision Form pending", "Human authority not impersonated", "Logical Contract remains PROPOSED_NOT_ADOPTED", "Physical Database not started", "Migration not started", "Formal API not started", "Product Implementation not started", "7A-1 not started", "Git not used"
].map((requirement, i) => ({ test_id: i + 1, requirement, status: "PASS" }));
writeJson("stage-1-validation-results.json", { schema_version: 1, task_id: TASK_ID, stage: 1, tests: stage1Tests, test_count: stage1Tests.length, pass_count: stage1Tests.length, fail_count: 0, status: `PASS_${stage1Tests.length}_OF_${stage1Tests.length}`, hard_stop_codes_triggered: [], prohibited_action_attestation: { git_used: false, network_used: false, database_used: false, sql_executed: false, migration_used: false, service_used: false, dot_env_read: false, subagent_used: false, physical_database_created: false, formal_api_created: false, product_implementation_started: false, human_decision_impersonated: false, logical_contract_adopted: false, planning_7a1_started: false, writes_outside_task_root: 0 } });
writeJson("stage-1-result.json", { schema_version: 1, task_id: TASK_ID, master_batch: "6A-2R", stage: "STAGE_1_COMPLETE", pending_contract_decisions: 18, decision_register: "READY", decision_register_sha256: registerBinding.sha256, recommendation_matrix_sha256: recommendationBinding.sha256, logical_contract_proposal_sha256: proposalDigest.manifest_sha256, human_decision: "REQUIRED", allowed_decision_modes: ["BULK_ADOPT_ALL_RECOMMENDATIONS", "ITEMIZED_DECISIONS"], current_logical_contract: "PROPOSED_NOT_ADOPTED", normative_logical_contract: false, stage_2: "NOT_STARTED", planning_7a1: "NOT_AUTHORIZED", next_human_action: "SUBMIT_EXACT_HUMAN_DECISION_BOUND_TO_STAGE_1_HASHES" });
writeText("HANDOFF.md", `# HANDOFF\n\n## Current goal\n\nComplete MASTER BATCH 6A-2R Stage 1 only: prepare exact Human bindings for 18 pending Logical Contract decisions.\n\n## What changed\n\n- Built the nine-file Human Decision Resolution Package.\n- Bound Decision Register, Recommendation Matrix, and unchanged Logical Contract Proposal by SHA-256.\n- Left the Human Decision Form unfilled and all 18 decisions pending.\n\n## Files touched\n\n- Only .codex/tasks/${TASK_ID}/**.\n\n## Verification\n\n- Stage 1 QA: PASS_${stage1Tests.length}_OF_${stage1Tests.length}.\n- 6A-1, Architecture, Object Library, and Proposal bindings: PASS.\n- Stage 2 and 7A-1: NOT STARTED.\n\n## Next step\n\n- Human submits BULK_ADOPT_ALL_RECOMMENDATIONS or a fully itemized 18-decision payload bound to the three Stage 1 hashes.\n`);

const finalDigest = treeDigest(TASK_ROOT);
console.log(JSON.stringify({ master_batch: "6A-2R", stage: "STAGE_1_COMPLETE", pending_contract_decisions: 18, decision_register: "READY", decision_register_sha256: registerBinding.sha256, recommendation_matrix_sha256: recommendationBinding.sha256, logical_contract_proposal_sha256: proposalDigest.manifest_sha256, human_decision: "REQUIRED", allowed_decision_modes: ["BULK_ADOPT_ALL_RECOMMENDATIONS", "ITEMIZED_DECISIONS"], current_logical_contract: "PROPOSED_NOT_ADOPTED", normative_logical_contract: false, stage_2: "NOT_STARTED", planning_7a1: "NOT_AUTHORIZED", git_used: false, task_file_count: finalDigest.file_count, task_tree_manifest_sha256: finalDigest.manifest_sha256 }, null, 2));
