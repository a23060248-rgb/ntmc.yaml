import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tasksRoot = path.resolve(taskRoot, "..");
const inputRoot = path.join(tasksRoot, "GOV-MAGP-PLATFORM-DESIGN-AND-IMPLEMENTATION-BLUEPRINT-01");
const expected = {
  raw_sha256: "D8BCB658C1C7B47DBB8ED111834212582BB2546D0A5F099829180787CBF24D01", raw_bytes: 1763,
  decision_register: "9054408EC82C51914FAC3212CFCCE8601930FC9F761F06A4DB62644BED483FEC",
  recommendations: "8CA636ECA40FE2E3DA0A1CDA3A3F118290DDB57714FC3911A4F78B157171437D",
  proposal: "28342E6B8ABA66D366A9F7C6E0F33BE50AB5B3EC1EEC47498A6D48EA27AD84D3",
  input_tree: "C5A7ABF5FC10E069BC3127B439B5C61DF1A83D016B5F1086AEEF6318855B6590"
};
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const files = (root) => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(root, entry.name)) : [path.join(root, entry.name)]);
const digest = (root, base = root, exclusions = new Set()) => { const entries = files(root).map((file) => ({ relative_path: path.relative(base, file).split(path.sep).join("/"), file })).filter((x) => !exclusions.has(x.relative_path)).map((x) => ({ relative_path: x.relative_path, sha256: sha(fs.readFileSync(x.file)), bytes: fs.statSync(x.file).size })).sort((a, b) => a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0); return { file_count: entries.length, manifest_sha256: sha(Buffer.from(entries.map((x) => `${x.relative_path}|${x.sha256}|${x.bytes}`).join("\n"), "utf8")), entries }; };
const bind = (file) => ({ sha256: sha(fs.readFileSync(file)), bytes: fs.statSync(file).size });
const read = (relative) => JSON.parse(fs.readFileSync(path.join(taskRoot, relative), "utf8"));
const need = (condition, detail) => { if (!condition) throw new Error(detail); };

const structured = files(taskRoot).filter((file) => file.endsWith(".json") || file.endsWith(".yaml"));
for (const file of structured) JSON.parse(fs.readFileSync(file, "utf8"));
const input = digest(inputRoot);
need(input.file_count === 227 && input.manifest_sha256 === expected.input_tree, "7A-1 source tree changed");
const rawFile = path.join(taskRoot, "human-decision-intake", "raw-human-decision.txt");
const raw = bind(rawFile);
need(raw.sha256 === expected.raw_sha256 && raw.bytes === expected.raw_bytes, "raw Human bytes changed");
const human = JSON.parse(fs.readFileSync(rawFile, "utf8"));
need(Object.keys(human).length === 20 && human.human_decision_type === "BULK_ADOPT_ALL_RECOMMENDATIONS_AND_AUTHORIZE_PHASE_0_1" && human.total_decision_count === 56, "Human JSON shape invalid");
need(human.decision_register_sha256 === expected.decision_register && human.recommendation_matrix_sha256 === expected.recommendations && human.proposal_binding_sha256 === expected.proposal, "Human hashes invalid");
need(human.adopt_all_recommendations_without_exception === true && human.adopt_physical_persistence_design === true && human.adopt_formal_api_event_contract === true && human.adopt_security_deployment_architecture === true && human.adopt_implementation_blueprint === true, "design adoption fields invalid");
need(human.authorize_phase_0 === true && human.authorize_phase_1 === true && human.authorize_phase_2_or_later === false && human.authorize_database_execution === false && human.authorize_migration_execution === false && human.authorize_deployment === false, "authorization fields invalid");
need(human.assurance_level === "REDUCED_ASSURANCE" && human.human_authority_attestation === true && human.decision_timestamp === "2026-07-23T13:19:05+08:00", "Human authority fields invalid");
need(read("human-decision-intake/human-decision-schema-validation.json").status === "PASS", "schema validation invalid");
need(read("human-decision-intake/exact-binding-verification.json").result === "PASS_4_OF_4", "binding verification invalid");
need(read("human-decision-intake/human-decision-integrity.json").raw_bytes_preserved_unmodified === true, "raw integrity invalid");

const registerFile = path.join(taskRoot, "human-integrated-adoption-decision-package", "decision-register.json");
const recommendationFile = path.join(taskRoot, "human-integrated-adoption-decision-package", "codex-recommendation-matrix.json");
const proposalFile = path.join(taskRoot, "human-integrated-adoption-decision-package", "exact-proposal-binding.json");
need(bind(registerFile).sha256 === expected.decision_register && bind(recommendationFile).sha256 === expected.recommendations && bind(proposalFile).sha256 === expected.proposal, "Stage 1 artifacts changed");
const register = JSON.parse(fs.readFileSync(registerFile, "utf8"));
const ledgerFile = path.join(taskRoot, "human-integrated-design-adoption", "integrated-decision-resolution-ledger.json");
const ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
need(register.decisions.length === 56 && ledger.resolutions.length === 56 && ledger.unresolved_count === 0 && ledger.resolutions.every((x) => x.blocking_status === "RESOLVED"), "56 decision resolution invalid");
need(ledger.resolutions.filter((x) => x.final_effective_status === "HUMAN_ADOPTED").length === 49, "design resolution count invalid");
need(ledger.resolutions.find((x) => x.decision_id === "IAD-E-006").selected_option === "AUTHORIZED_ONLY_IN_SEPARATE_PHASE_0_1_TASK_AND_EXACT_SCOPE", "product modification boundary invalid");

const baselineDirs = ["persistence-design-baseline", "api-event-contract-baseline", "security-deployment-baseline", "implementation-blueprint-baseline"];
const baselineIds = ["MAGP-PERSISTENCE-DESIGN-BASELINE-V1", "MAGP-API-EVENT-CONTRACT-BASELINE-V1", "MAGP-SECURITY-DEPLOYMENT-BASELINE-V1", "MAGP-IMPLEMENTATION-BLUEPRINT-BASELINE-V1"];
const baselineHashes = {};
for (let index = 0; index < baselineDirs.length; index += 1) {
  const dir = path.join(taskRoot, "adopted-design-baselines", baselineDirs[index]);
  need(files(dir).length === 8, `baseline file count invalid: ${baselineDirs[index]}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "exact-artifact-manifest.json"), "utf8"));
  need(manifest.baseline_id === baselineIds[index] && manifest.source_bytes_copied_or_modified === false, `baseline manifest invalid: ${baselineDirs[index]}`);
  for (const entry of manifest.artifacts) {
    const source = path.join(inputRoot, ...entry.relative_path.split("/"));
    need(fs.existsSync(source) && bind(source).sha256 === entry.sha256 && bind(source).bytes === entry.bytes, `baseline source mismatch: ${entry.relative_path}`);
  }
  const artifactCanonical = manifest.artifacts.map((x) => `${x.relative_path}|${x.sha256}|${x.bytes}`).join("\n");
  need(sha(Buffer.from(artifactCanonical, "utf8")) === manifest.artifact_tree_sha256, `artifact tree invalid: ${baselineDirs[index]}`);
  const binding = JSON.parse(fs.readFileSync(path.join(dir, "hash-binding.json"), "utf8"));
  const expectedComponents = {
    "baseline-id": { sha256: sha(Buffer.from(baselineIds[index], "utf8")), bytes: Buffer.byteLength(baselineIds[index]) },
    "artifact-manifest": bind(path.join(dir, "exact-artifact-manifest.json")),
    "raw-human-decision": raw,
    "decision-register": bind(registerFile),
    "recommendation-matrix": bind(recommendationFile),
    "proposal-binding": bind(proposalFile),
    "decision-resolution-ledger": bind(ledgerFile)
  };
  for (const component of binding.components) need(component.sha256 === expectedComponents[component.label].sha256 && component.bytes === expectedComponents[component.label].bytes, `component invalid: ${baselineDirs[index]}/${component.label}`);
  const canonical = binding.components.map((x) => `${x.label}|${x.sha256}|${x.bytes}`).join("\n");
  need(sha(Buffer.from(canonical, "utf8")) === binding.baseline_content_sha256 && binding.binding_status === "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND", `baseline hash invalid: ${baselineDirs[index]}`);
  const record = JSON.parse(fs.readFileSync(path.join(dir, "baseline-record.json"), "utf8"));
  need(record.baseline_id === baselineIds[index] && record.baseline_content_sha256 === binding.baseline_content_sha256 && record.baseline_status === "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND", `baseline record invalid: ${baselineDirs[index]}`);
  baselineHashes[baselineIds[index]] = binding.baseline_content_sha256;
}

const adoptionRoot = path.join(taskRoot, "human-integrated-design-adoption");
need(files(adoptionRoot).length === 10, "adoption package file count invalid");
for (const record of ["physical-persistence-adoption-record.json", "formal-api-event-adoption-record.json", "security-deployment-adoption-record.json", "implementation-blueprint-adoption-record.json"]) need(read(`human-integrated-design-adoption/${record}`).status === "HUMAN_ADOPTED", `adoption status invalid: ${record}`);
need(read("human-integrated-design-adoption/adoption-integrity.json").status === "PASS", "adoption integrity invalid");

const launchRoot = path.join(taskRoot, "phase-0-1-implementation-launch-package");
need(files(launchRoot).length === 16, "launch package must contain 16 files");
const scope = read("phase-0-1-implementation-launch-package/exact-phase-scope.json");
need(scope.phase_0.authorized === true && scope.phase_0.item_count === 15 && scope.phase_1.authorized === true && scope.phase_1.item_count === 20 && scope.phase_2_or_later.authorized === false, "phase scope invalid");
const db = read("phase-0-1-implementation-launch-package/database-execution-boundary.json");
need(db.database_connection_authorized === false && db.sql_execution_authorized === false && db.seed_authorized === false, "database boundary invalid");
need(read("phase-0-1-implementation-launch-package/migration-boundary.json").migration_execution === false, "migration boundary invalid");
const phase = read("phase-authorization-result.json");
need(phase.phase_0 === "AUTHORIZED" && phase.phase_1 === "AUTHORIZED" && phase.phase_2_or_later === "NOT_AUTHORIZED" && phase.database_execution === "NOT_AUTHORIZED" && phase.migration_execution === "NOT_AUTHORIZED" && phase.deployment === "NOT_AUTHORIZED" && phase.product_code_modified_in_current_task === false && phase.implementation_started === false, "phase result invalid");
need(read("phase-0-1-launch-readiness.json").launch_package_status === "READY_FOR_SEPARATE_HUMAN_LAUNCH", "launch readiness invalid");
const qa = read("validation-results.json");
need(qa.status === "PASS_30_OF_30" && qa.required_tests.length === 30 && qa.required_tests.every((x) => x.status === "PASS"), "30/30 QA invalid");
need(read("product-governance-integrity.json").files.every((x) => x.match), "product governance changed");
need(read("historical-artifact-integrity.json").historical_tasks.every((x) => x.match), "historical task changed");
const manifest = read("stage-2-task-artifact-manifest.json");
const current = digest(taskRoot, taskRoot, new Set(manifest.exclusions));
need(current.file_count === manifest.file_count && current.manifest_sha256 === manifest.manifest_sha256, "Stage 2 task manifest not current");

console.log(JSON.stringify({ status: "PASS", parsed_structured_files: structured.length, raw_human_decision_sha256: raw.sha256, human_binding: "PASS", decisions_resolved: 56, design_decisions_adopted: 49, design_baselines: baselineHashes, phase_0: phase.phase_0, phase_1: phase.phase_1, phase_2_or_later: phase.phase_2_or_later, database_execution: phase.database_execution, migration_execution: phase.migration_execution, deployment: phase.deployment, launch_package_files: files(launchRoot).length, stage_2_qa: qa.status, product_code_modified: false, implementation_started: false, prohibited_execution: "NONE_OCCURRED", stage_2_task_content_manifest_sha256: manifest.manifest_sha256 }, null, 2));
