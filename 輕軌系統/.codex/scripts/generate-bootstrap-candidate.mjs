import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath, safeNewPath, verifyCreatedPath } from "./lib/path-safety.mjs";
import { BOOTSTRAP_ASSURANCE, BOOTSTRAP_RECORD_TYPE, canonicalSha256, createBootstrapWorkspaceCandidateRecord, sha256, validateBootstrapCandidateRecord } from "./lib/governance/typed-proof.mjs";
import { validateBootstrapScanReport } from "./lib/governance/scanner-report.mjs";
import { loadAndCompileGovernanceSchemas } from "./lib/governance/governance-schema-loader.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [taskId, generatedAt, scannerReportRef, outputRef, supersedesCandidateManifestSha256, supersessionReason] = process.argv.slice(2);
if (!/^[A-Z][A-Z0-9-]{2,63}$/.test(taskId ?? "") || Number.isNaN(Date.parse(generatedAt)) || !scannerReportRef || !outputRef || !/^[A-F0-9]{64}$/.test(supersedesCandidateManifestSha256 ?? "") || !supersessionReason?.trim()) throw new Error("task ID, ISO timestamp, scanner report ref, output ref, superseded candidate manifest SHA256, and supersession reason are required.");
const manifestBytes = await readFile(await safeExistingPath(root, ".codex/governance/governance-commit-manifest.yaml"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const files = [];
for (const item of manifest.artifacts ?? []) { const bytes = await readFile(await safeExistingPath(root, item.path)); const digest = sha256(bytes); if (digest !== item.sha256.toUpperCase()) throw new Error(`Manifest hash mismatch: ${item.path}`); files.push({path: item.path, sha256: digest}); }
files.sort((a, b) => a.path.localeCompare(b.path));
const scannerReportBytes = await readFile(await safeExistingPath(root, scannerReportRef));
const scannerReport = JSON.parse(scannerReportBytes.toString("utf8"));
const schemaSet = await loadAndCompileGovernanceSchemas(root);
const schemaIssues = schemaSet.validate(".codex/blueprints/schemas/bootstrap-scan-report.schema.json", scannerReport, scannerReportRef);
if (schemaIssues.length) throw new Error(schemaIssues.join(" | "));
const reportCheck = await validateBootstrapScanReport({projectRoot: root, report: scannerReport, manifestBytes, includedFiles: files, scannedFiles: files});
if (!reportCheck.ok) throw new Error(reportCheck.violations.join(" | "));
if (scannerReport.results.result !== "PASS" || scannerReport.results.finding_count !== 0) throw new Error("Bootstrap candidate requires a zero-finding PASS scanner report.");
const hashes = scannerReport.scan_contract;
const record = createBootstrapWorkspaceCandidateRecord({
  task_id: taskId, manifest_sha256: sha256(manifestBytes), included_file_set_sha256: canonicalSha256(files), file_count: files.length, scanner_report_sha256: sha256(scannerReportBytes),
  scan_contract_sha256: hashes.contract_sha256, finding_registry_sha256: hashes.finding_registry_sha256, canonicalization_config_sha256: hashes.canonicalization_config_sha256, binary_oracle_config_sha256: hashes.binary_oracle_config_sha256, binary_magic_registry_sha256: hashes.binary_magic_registry_sha256, schema_set_sha256: hashes.schema_set_sha256, evidence_schema_registry_sha256: hashes.evidence_schema_registry_sha256, referenced_evidence_policy_sha256: hashes.referenced_evidence_policy_sha256, supersedes_candidate_manifest_sha256: supersedesCandidateManifestSha256, supersession_reason: supersessionReason, breaking_governance_change: "referenced_evidence_validation_required", generated_at: generatedAt
});
const checked = validateBootstrapCandidateRecord(record, {record_type: BOOTSTRAP_RECORD_TYPE, assurance: BOOTSTRAP_ASSURANCE, task_id: taskId, manifest_sha256: sha256(manifestBytes), included_file_set_sha256: canonicalSha256(files), file_count: files.length, scanner_report_sha256: record.scanner_report_sha256, scan_contract_sha256: hashes.contract_sha256, finding_registry_sha256: hashes.finding_registry_sha256, canonicalization_config_sha256: hashes.canonicalization_config_sha256, binary_oracle_config_sha256: hashes.binary_oracle_config_sha256, binary_magic_registry_sha256: hashes.binary_magic_registry_sha256, schema_set_sha256: hashes.schema_set_sha256, evidence_schema_registry_sha256: hashes.evidence_schema_registry_sha256, referenced_evidence_policy_sha256: hashes.referenced_evidence_policy_sha256, supersedes_candidate_manifest_sha256: supersedesCandidateManifestSha256, supersession_reason: supersessionReason, breaking_governance_change: "referenced_evidence_validation_required"});
if (!checked.ok) throw new Error(checked.violations.join(" | "));
await writeFile(await safeNewPath(root, outputRef), `${JSON.stringify(record, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
await verifyCreatedPath(root, outputRef);
console.log(`BOOTSTRAP_WORKSPACE_CANDIDATE assurance=${BOOTSTRAP_ASSURANCE} files=${files.length} manifest_sha256=${record.manifest_sha256} scanner_report_sha256=${record.scanner_report_sha256}`);
