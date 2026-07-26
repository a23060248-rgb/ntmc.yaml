import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tasksRoot = path.resolve(taskRoot, "..");
const inputRoot = path.join(tasksRoot, "GOV-MAGP-PLATFORM-DESIGN-AND-IMPLEMENTATION-BLUEPRINT-01");
const expectedInput = { file_count: 227, manifest_sha256: "C5A7ABF5FC10E069BC3127B439B5C61DF1A83D016B5F1086AEEF6318855B6590" };
const expectedCounts = { PHYSICAL_PERSISTENCE_DECISIONS: 13, API_AND_EVENT_DECISIONS: 14, SECURITY_AND_DEPLOYMENT_DECISIONS: 11, IMPLEMENTATION_BLUEPRINT_DECISIONS: 11, IMPLEMENTATION_AUTHORIZATION_DECISIONS: 7 };
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const files = (root) => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(root, entry.name)) : [path.join(root, entry.name)]);
const digest = (root, base = root, exclusions = new Set()) => {
  const entries = files(root).map((file) => ({ relative_path: path.relative(base, file).split(path.sep).join("/"), file })).filter((x) => !exclusions.has(x.relative_path)).map((x) => ({ relative_path: x.relative_path, sha256: sha(fs.readFileSync(x.file)), bytes: fs.statSync(x.file).size })).sort((a, b) => a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0);
  return { file_count: entries.length, manifest_sha256: sha(Buffer.from(entries.map((x) => `${x.relative_path}|${x.sha256}|${x.bytes}`).join("\n"), "utf8")), entries };
};
const bind = (file) => ({ sha256: sha(fs.readFileSync(file)), bytes: fs.statSync(file).size });
const read = (relative) => JSON.parse(fs.readFileSync(path.join(taskRoot, relative), "utf8"));
const need = (condition, detail) => { if (!condition) throw new Error(detail); };

const structured = files(taskRoot).filter((file) => file.endsWith(".json") || file.endsWith(".yaml"));
for (const file of structured) JSON.parse(fs.readFileSync(file, "utf8"));
const input = digest(inputRoot);
need(input.file_count === expectedInput.file_count && input.manifest_sha256 === expectedInput.manifest_sha256, "7A-1 input binding changed");
const registerPath = path.join(taskRoot, "human-integrated-adoption-decision-package", "decision-register.json");
const recommendationPath = path.join(taskRoot, "human-integrated-adoption-decision-package", "codex-recommendation-matrix.json");
const proposalPath = path.join(taskRoot, "human-integrated-adoption-decision-package", "exact-proposal-binding.json");
const register = JSON.parse(fs.readFileSync(registerPath, "utf8"));
const recommendations = JSON.parse(fs.readFileSync(recommendationPath, "utf8"));
const proposal = JSON.parse(fs.readFileSync(proposalPath, "utf8"));
const exact = read("human-integrated-adoption-decision-package/exact-decision-binding.json");
need(register.total_decision_count === 56 && register.decisions.length === 56 && register.unresolved_blocking_count === 56, "decision count invalid");
need(JSON.stringify(register.decision_group_counts) === JSON.stringify(expectedCounts), "group counts invalid");
need(new Set(register.decisions.map((x) => x.decision_id)).size === 56, "decision IDs not unique");
const requiredFields = ["decision_id", "decision_group", "decision_title", "exact_options", "current_status", "codex_recommendation", "recommendation_rationale", "affected_artifacts", "architecture_impact", "object_library_impact", "logical_contract_impact", "persistence_impact", "api_event_impact", "security_impact", "deployment_impact", "implementation_impact", "migration_impact", "compatibility_risk", "rollback_difficulty", "human_gate_requirement", "blocking_status", "available_human_decisions"];
for (const item of register.decisions) {
  need(requiredFields.every((field) => Object.hasOwn(item, field)), `decision fields missing: ${item.decision_id}`);
  need(item.current_status === "PENDING_HUMAN_DECISION" && item.human_decision === null && item.codex_filled_human_decision === false, `decision was filled: ${item.decision_id}`);
  need(item.affected_artifacts.length > 0 && item.affected_artifacts.every((relative) => fs.existsSync(path.join(inputRoot, ...relative.split("/")))), `decision trace invalid: ${item.decision_id}`);
}
need(recommendations.total_recommendation_count === 56 && recommendations.nonbinding_recommendations_only === true && recommendations.human_adoption_implied === false, "recommendation matrix invalid");
need(exact.decision_register_sha256 === bind(registerPath).sha256 && exact.recommendation_matrix_sha256 === bind(recommendationPath).sha256 && exact.proposal_binding_sha256 === bind(proposalPath).sha256, "exact decision hashes invalid");
need(exact.total_decision_count === 56 && exact.unresolved_blocking_count === 56 && exact.unresolved_non_blocking_count === 0, "exact decision binding counts invalid");

const groupRoots = {
  physical_persistence: ["physical-persistence-design"], database: ["database-proposal"], migration: ["migration-strategy"], formal_api: ["formal-interface-api-design", "api-contract-proposal"], event_contract: ["event-contract-design", "event-contract-proposal"], security_architecture: ["security-architecture"], deployment_topology: ["deployment-topology-planning", "observability-planning", "resilience-planning"], implementation_blueprint: ["backend-module-planning", "human-review-console-planning", "agent-runtime-planning", "implementation-blueprint-proposal"], testing_assurance: ["testing-and-assurance-plan"]
};
for (const [name, roots] of Object.entries(groupRoots)) {
  const parts = roots.map((root) => ({ root, ...digest(path.join(inputRoot, root), inputRoot) }));
  const computed = sha(Buffer.from(parts.map((x) => `${x.root}|${x.manifest_sha256}|${x.file_count}`).join("\n"), "utf8"));
  need(proposal.proposal_groups[name].manifest_sha256 === computed, `proposal hash invalid: ${name}`);
}
need(proposal.architecture_baseline_hash === "32A064D90A2051DFC7B28962F9757F7947E6A4863615628C1E99169FE91C128C", "architecture baseline hash invalid");
need(proposal.object_library_baseline_hash === "907F7D7F58739182FEC731AD562D6142C522E5958144F0A34AAE240465E2B8CE", "object baseline hash invalid");
need(proposal.logical_contract_baseline_hash === "A5DC37FFBDFE5857EBD0B0995C28325A83887B59833DBA7260B46F2851305E6B", "logical baseline hash invalid");
const legacy = read("human-integrated-adoption-decision-package/legacy-decision-traceability.json");
need(legacy.source_decision_count === 20 && legacy.all_traced === true && legacy.mappings.every((x) => x.integrated_decision_ids.length > 0), "legacy decision trace invalid");
const form = read("human-integrated-adoption-decision-package/human-decision-form.json");
need(form.decision_status === "PENDING_HUMAN_DECISION" && form.human_decision_type === null && form.human_authority_attestation === false && form.codex_completed_human_fields === false, "Human form was filled");
need(form.decision_register_sha256 === bind(registerPath).sha256 && form.recommendation_matrix_sha256 === bind(recommendationPath).sha256 && form.proposal_binding_sha256 === bind(proposalPath).sha256, "Human form hashes invalid");
const stage1 = read("stage-1-result.json");
need(stage1.result === "STAGE_1_COMPLETE" && stage1.total_pending_decisions === 56 && stage1.current_design_status === "PROPOSED_NOT_ADOPTED" && stage1.phase_0_1 === "NOT_AUTHORIZED" && stage1.stage_2_started === false, "stage result invalid");
const validation = read("stage-1-validation-results.json");
need(validation.status === "PASS_15_OF_15" && validation.required_tests.every((x) => x.status === "PASS"), "Stage 1 QA invalid");
need(!fs.existsSync(path.join(taskRoot, "human-integrated-design-adoption")), "adoption created early");
need(!fs.existsSync(path.join(taskRoot, "adopted-design-baselines")), "Design Baselines created early");
need(!fs.existsSync(path.join(taskRoot, "phase-0-1-implementation-launch-package")), "launch package created early");
need(!fs.existsSync(path.join(taskRoot, "human-decision-intake", "raw-human-decision.txt")), "raw Human decision invented");
const phase = read("phase-authorization-result.json");
need(phase.phase_0 === "NOT_AUTHORIZED" && phase.phase_1 === "NOT_AUTHORIZED" && phase.product_code_modification === "NOT_AUTHORIZED" && phase.implementation_started === false, "phase authorization occurred early");
need(read("product-governance-integrity.json").files.every((x) => x.match), "product governance changed");
need(read("historical-artifact-integrity.json").historical_tasks.every((x) => x.match), "historical task changed");
const manifest = read("task-artifact-manifest.json");
const current = digest(taskRoot, taskRoot, new Set(manifest.exclusions));
need(current.file_count === manifest.file_count && current.manifest_sha256 === manifest.manifest_sha256, "task manifest not current");

console.log(JSON.stringify({ status: "PASS", parsed_structured_files: structured.length, total_pending_decisions: 56, decision_group_counts: expectedCounts, decision_register_sha256: bind(registerPath).sha256, recommendation_matrix_sha256: bind(recommendationPath).sha256, proposal_binding_sha256: bind(proposalPath).sha256, source_hid_traceability: "PASS_20_OF_20", stage_1_qa: validation.status, design_status: stage1.current_design_status, phase_0_1: stage1.phase_0_1, stage_2_started: false, design_baselines_created: false, launch_package_created: false, prohibited_execution: "NONE_OCCURRED", task_content_manifest_sha256: manifest.manifest_sha256 }, null, 2));
