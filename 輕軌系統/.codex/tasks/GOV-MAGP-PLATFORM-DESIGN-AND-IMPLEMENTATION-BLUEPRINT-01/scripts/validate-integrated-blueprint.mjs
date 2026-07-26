import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const list = (root) => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? list(path.join(root, entry.name)) : [path.join(root, entry.name)]);
const read = (relative) => JSON.parse(fs.readFileSync(path.join(taskRoot, relative), "utf8"));
const need = (condition, message) => { if (!condition) throw new Error(message); };
const requiredDirectories = [
  "input-binding", "physical-persistence-design", "database-proposal", "migration-strategy", "formal-interface-api-design", "api-contract-proposal",
  "event-contract-design", "event-contract-proposal", "security-architecture", "human-review-console-planning", "backend-module-planning",
  "agent-runtime-planning", "deployment-topology-planning", "observability-planning", "resilience-planning", "implementation-blueprint-proposal",
  "testing-and-assurance-plan", "human-integrated-design-decision-matrix", "human-adoption-packages"
];
const requiredTopFiles = [
  "task-intent.yaml", "classification.yaml", "blueprint.yaml", "architecture-baseline-integrity.json", "object-library-baseline-integrity.json",
  "logical-contract-baseline-integrity.json", "product-governance-integrity.json", "historical-artifact-integrity.json", "validation-results.json",
  "final-summary.md", "HANDOFF.md"
];
const physicalFiles = ["database-technology-decision-matrix.json", "logical-to-physical-mapping.json", "physical-entity-registry.json", "aggregate-storage-boundary.json", "table-design-proposal.json", "column-and-type-proposal.json", "key-reference-strategy.json", "constraint-design.json", "indexing-strategy.json", "partitioning-strategy.json", "temporal-data-strategy.json", "audit-storage-strategy.json", "evidence-ledger-storage-design.json", "authority-storage-design.json", "lifecycle-transition-storage-design.json", "concurrency-storage-design.json", "idempotency-storage-design.json", "retention-archival-design.json", "encryption-sensitive-data-design.json", "backup-restore-design.json", "disaster-recovery-design.json", "physical-schema-risk-register.json"];
const apiFiles = ["api-context.json", "resource-registry.json", "command-operation-registry.json", "query-operation-registry.json", "lifecycle-operation-registry.json", "approval-operation-registry.json", "evidence-operation-registry.json", "finding-operation-registry.json", "package-release-operation-registry.json", "agent-operation-registry.json", "deployment-operation-registry.json", "authorization-requirements.json", "idempotency-requirements.json", "concurrency-requirements.json", "pagination-filter-ordering.json", "version-negotiation.json", "error-contract.json", "redaction-exposure-policy.json", "correlation-audit-contract.json", "api-risk-register.json"];
const securityFiles = ["trust-boundary-model.json", "asset-inventory.json", "actor-role-model.json", "authentication-model.json", "authorization-model.json", "least-privilege-model.json", "policy-enforcement-point-model.json", "human-approval-security-boundary.json", "agent-authority-security-boundary.json", "data-classification.json", "sensitive-data-handling.json", "encryption-boundary.json", "key-secret-management-requirements.json", "audit-security-requirements.json", "threat-model.json", "abuse-case-register.json", "security-control-matrix.json", "security-test-plan.json", "incident-response-boundary.json"];
const implementationFiles = ["target-system-boundary.json", "recommended-delivery-strategy.json", "repository-structure-proposal.json", "module-dependency-map.json", "work-package-register.json", "milestone-plan.json", "dependency-sequence.json", "human-gate-sequence.json", "testing-strategy.json", "evidence-delivery-plan.json", "security-review-plan.json", "compatibility-review-plan.json", "railway-domain-extension-boundary.json", "deployment-readiness-plan.json", "rollback-recovery-plan.json", "implementation-risk-register.json", "go-no-go-model.json", "implementation-blueprint-summary.md"];

for (const dir of requiredDirectories) need(fs.statSync(path.join(taskRoot, dir)).isDirectory(), `Missing directory: ${dir}`);
for (const file of requiredTopFiles) need(fs.existsSync(path.join(taskRoot, file)), `Missing top file: ${file}`);
for (const file of physicalFiles) need(fs.existsSync(path.join(taskRoot, "physical-persistence-design", file)), `Missing physical file: ${file}`);
for (const file of apiFiles) need(fs.existsSync(path.join(taskRoot, "formal-interface-api-design", file)), `Missing API file: ${file}`);
for (const file of securityFiles) need(fs.existsSync(path.join(taskRoot, "security-architecture", file)), `Missing security file: ${file}`);
for (const file of implementationFiles) need(fs.existsSync(path.join(taskRoot, "implementation-blueprint-proposal", file)), `Missing implementation file: ${file}`);

const structured = list(taskRoot).filter((file) => file.endsWith(".json") || file.endsWith(".yaml"));
for (const file of structured) JSON.parse(fs.readFileSync(file, "utf8"));
const qa = read("validation-results.json");
need(qa.required_status === "PASS_45_OF_45" && qa.required_tests.length === 45 && qa.required_tests.every((x) => x.status === "PASS"), "45/45 QA invalid");
const decisions = read("human-integrated-design-decision-matrix/decision-register.json");
need(decisions.decision_count === 20 && decisions.pending_count === 20 && decisions.decisions.every((x) => x.status === "PENDING_HUMAN_DECISION" && x.human_selection === null && x.codex_selected === false), "Human decision boundary invalid");
const packages = ["physical-persistence-adoption-package", "formal-api-event-adoption-package", "security-deployment-adoption-package", "implementation-blueprint-adoption-package"];
for (const packageName of packages) {
  const root = path.join(taskRoot, "human-adoption-packages", packageName);
  need(list(root).length === 12, `${packageName} must contain 12 files`);
  const form = JSON.parse(fs.readFileSync(path.join(root, "decision-form.json"), "utf8"));
  need(form.decision_status === "PENDING_HUMAN_DECISION" && form.human_decision === null && form.human_authority_attestation === false && form.codex_completed_human_fields === false, `${packageName} decision form invalid`);
}
for (const file of list(path.join(taskRoot, "database-proposal")).filter((x) => x.endsWith(".sql"))) {
  const value = fs.readFileSync(file, "utf8");
  need(value.includes("DESIGN_PROPOSAL_ONLY") && value.includes("NOT_APPROVED_FOR_EXECUTION") && value.includes("NOT_EXECUTED"), `SQL marker invalid: ${path.basename(file)}`);
}
const proposalDirectories = ["physical-persistence-design", "database-proposal", "migration-strategy", "formal-interface-api-design", "api-contract-proposal", "event-contract-design", "event-contract-proposal", "security-architecture", "human-review-console-planning", "backend-module-planning", "agent-runtime-planning", "deployment-topology-planning", "observability-planning", "resilience-planning", "implementation-blueprint-proposal", "testing-and-assurance-plan"];
for (const directory of proposalDirectories) {
  for (const file of list(path.join(taskRoot, directory))) {
    const value = fs.readFileSync(file, "utf8");
    need(value.includes("PROPOSED_NOT_ADOPTED") && value.includes("NOT_EXECUTED") && value.includes("NOT_IMPLEMENTED"), `Proposal status markers invalid: ${path.relative(taskRoot, file)}`);
  }
}
need(read("architecture-baseline-integrity.json").status === "BOUND_AND_VALID", "Architecture Baseline invalid");
need(read("object-library-baseline-integrity.json").status === "BOUND_AND_VALID", "Object Library Baseline invalid");
need(read("logical-contract-baseline-integrity.json").status === "BOUND_AND_VALID" && read("logical-contract-baseline-integrity.json").pending_contract_decisions === 0, "Logical Contract Baseline invalid");
need(read("product-governance-integrity.json").files.every((x) => x.match), "Product governance integrity invalid");
need(read("historical-artifact-integrity.json").historical_tasks.every((x) => x.match), "Historical integrity invalid");
const manifest = read("task-artifact-manifest.json");
const exclusions = new Set(manifest.exclusions);
const rows = list(taskRoot).map((file) => ({ relative_path: path.relative(taskRoot, file).split(path.sep).join("/"), file })).filter((x) => !exclusions.has(x.relative_path)).map((x) => ({ relative_path: x.relative_path, sha256: sha(fs.readFileSync(x.file)), bytes: fs.statSync(x.file).size })).sort((a, b) => a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0);
const canonical = rows.map((x) => `${x.relative_path}|${x.sha256}|${x.bytes}`).join("\n");
need(rows.length === manifest.file_count && sha(Buffer.from(canonical, "utf8")) === manifest.manifest_sha256, "Task artifact manifest is not current");
const result = read("integrated-planning-result.json");
need(result.physical_database_executed === false && result.migration_executed === false && result.formal_api_implemented === false && result.product_code_modified === false && result.product_implementation_started === false && result.git_used === false, "Prohibited execution boundary invalid");

console.log(JSON.stringify({ status: "PASS", parsed_structured_files: structured.length, task_files: list(taskRoot).length, required_directories: requiredDirectories.length, physical_files: physicalFiles.length, api_files: apiFiles.length, security_files: securityFiles.length, implementation_files: implementationFiles.length, required_qa: qa.required_status, pending_human_decisions: decisions.pending_count, adoption_packages: packages.length, artifact_manifest_sha256: manifest.manifest_sha256, prohibited_execution: "NONE_OCCURRED" }, null, 2));
