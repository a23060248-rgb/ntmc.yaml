import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { safeExistingPath } from "../path-safety.mjs";
import { BOOTSTRAP_ASSURANCE, canonicalSha256, sha256 } from "./typed-proof.mjs";
import { SCAN_CONTRACT, scanCandidateArtifact, validateDeclaredScanContract } from "./scanner-pipeline.mjs";
import { loadAndCompileGovernanceSchemas } from "./governance-schema-loader.mjs";

const bundleRefs = Object.freeze({
  contract: ".codex/governance/scan-contract.yaml",
  findingRegistry: ".codex/governance/scanner-finding-registry.yaml",
  canonicalizationConfig: ".codex/governance/scanner-canonicalization-config.yaml",
  binaryOracle: ".codex/governance/scanner-binary-oracle.yaml",
  binaryMagicRegistry: ".codex/governance/bootstrap-binary-magic-registry.yaml",
  implementationMatrix: ".codex/governance/scanner-contract-matrix.yaml",
  productionCaseManifest: ".codex/tests/scanner-production-case-manifest.json"
});

export function scannerReportPayload(report) {
  const { report_payload_sha256: _ignored, ...payload } = report;
  return payload;
}

export async function loadScannerContractBundle(projectRoot) {
  const documents = {}, bytes = {};
  for (const [name, ref] of Object.entries(bundleRefs)) {
    bytes[name] = await readFile(await safeExistingPath(projectRoot, ref));
    documents[name] = JSON.parse(bytes[name].toString("utf8"));
  }
  const violations = validateDeclaredScanContract(documents.contract, documents);
  const schemaSet = await loadAndCompileGovernanceSchemas(projectRoot, {requireManifestBinding: false});
  const binaryMagicRegistrySha256 = sha256(bytes.binaryMagicRegistry);
  if (documents.contract.binary_magic_registry_sha256 !== binaryMagicRegistrySha256) violations.push("SCAN_CONTRACT pinned binary magic registry hash mismatch.");
  if (documents.contract.schema_set_sha256 !== schemaSet.schema_set_sha256) violations.push("SCAN_CONTRACT pinned governance schema-set hash mismatch.");
  return {
    ...documents,
    hashes: {
      contract_sha256: sha256(bytes.contract),
      finding_registry_sha256: sha256(bytes.findingRegistry),
      canonicalization_config_sha256: sha256(bytes.canonicalizationConfig),
      binary_oracle_config_sha256: sha256(bytes.binaryOracle),
      binary_magic_registry_sha256: binaryMagicRegistrySha256,
      schema_set_sha256: schemaSet.schema_set_sha256
    },
    violations
  };
}

export async function buildBootstrapScanReport({ projectRoot, manifestBytes, manifest, startedAt, completedAt = startedAt, executionId = null }) {
  const bundle = await loadScannerContractBundle(projectRoot);
  if (bundle.violations.length) throw new Error(bundle.violations.join(" | "));
  const findings = [], includedFiles = [], scannedFiles = [];
  for (const artifact of manifest.artifacts ?? []) {
    includedFiles.push({ path: artifact.path, sha256: artifact.sha256.toUpperCase() });
    const content = await readFile(await safeExistingPath(projectRoot, artifact.path));
    const digest = sha256(content);
    scannedFiles.push({ path: artifact.path, sha256: digest });
    if (digest !== artifact.sha256.toUpperCase()) findings.push({ finding_class: "MANIFEST_HASH_MISMATCH", ref: artifact.path, transformations: ["manifest-binding"], location: null, detail: "Actual SHA256 differs from manifest." });
    findings.push(...scanCandidateArtifact(content, artifact.path, bundle.binaryMagicRegistry));
  }
  includedFiles.sort((a, b) => a.path.localeCompare(b.path));
  scannedFiles.sort((a, b) => a.path.localeCompare(b.path));
  findings.sort((a, b) => `${a.finding_class}|${a.ref}`.localeCompare(`${b.finding_class}|${b.ref}`));
  const payload = {
    schema_version: 2,
    report_type: "bootstrap-manifest-scan",
    assurance: BOOTSTRAP_ASSURANCE,
    scan_contract: { contract_id: SCAN_CONTRACT.id, contract_version: SCAN_CONTRACT.version, ...bundle.hashes },
    candidate_binding: {
      manifest_sha256: sha256(manifestBytes),
      included_file_set_sha256: canonicalSha256(includedFiles),
      scanned_file_set_sha256: canonicalSha256(scannedFiles),
      expected_file_count: includedFiles.length,
      scanned_file_count: scannedFiles.length
    },
    execution: { execution_id: executionId ?? `SCAN-${randomUUID()}`, started_at: startedAt, completed_at: completedAt },
    results: {
      result: findings.length ? "FAIL" : "PASS",
      finding_count: findings.length,
      findings,
      declared_contract_executed: true,
      no_findings_within_declared_contract: findings.length === 0
    }
  };
  return { ...payload, report_payload_sha256: canonicalSha256(payload) };
}

export async function validateBootstrapScanReport({ projectRoot, report, manifestBytes, includedFiles, scannedFiles = includedFiles }) {
  const violations = [];
  const bundle = await loadScannerContractBundle(projectRoot);
  violations.push(...bundle.violations);
  if (report?.report_type !== "bootstrap-manifest-scan" || report?.assurance !== BOOTSTRAP_ASSURANCE) violations.push("SCANNER_REPORT type or assurance mismatch.");
  const contract = report?.scan_contract ?? {};
  if (contract.contract_id !== SCAN_CONTRACT.id || contract.contract_version !== SCAN_CONTRACT.version) violations.push("SCANNER_REPORT contract identity/version mismatch.");
  for (const [field, value] of Object.entries(bundle.hashes)) if (contract[field] !== value) violations.push(`SCANNER_REPORT ${field} mismatch.`);
  const sortedIncluded = [...(includedFiles ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  const sortedScanned = [...(scannedFiles ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  const binding = report?.candidate_binding ?? {};
  if (binding.manifest_sha256 !== sha256(manifestBytes)) violations.push("SCANNER_REPORT manifest binding mismatch.");
  if (binding.included_file_set_sha256 !== canonicalSha256(sortedIncluded)) violations.push("SCANNER_REPORT included file-set binding mismatch.");
  if (binding.scanned_file_set_sha256 !== canonicalSha256(sortedScanned)) violations.push("SCANNER_REPORT scanned file-set binding mismatch.");
  if (binding.expected_file_count !== sortedIncluded.length || binding.scanned_file_count !== sortedScanned.length) violations.push("SCANNER_REPORT file counts mismatch.");
  const results = report?.results ?? {}, findings = results.findings ?? [];
  if (!Array.isArray(findings)) violations.push("SCANNER_REPORT findings array is required.");
  const registry = new Set(bundle.findingRegistry.finding_classes ?? []);
  for (const finding of Array.isArray(findings) ? findings : []) if (!registry.has(finding.finding_class)) violations.push(`SCANNER_REPORT unregistered finding class ${finding.finding_class}.`);
  if (results.finding_count !== (Array.isArray(findings) ? findings.length : -1)) violations.push("SCANNER_REPORT finding_count mismatch.");
  const expectedResult = findings.length ? "FAIL" : "PASS";
  if (results.result !== expectedResult) violations.push("SCANNER_REPORT result disagrees with findings.");
  if (results.declared_contract_executed !== true) violations.push("SCANNER_REPORT declared_contract_executed must be true.");
  if (results.no_findings_within_declared_contract !== (findings.length === 0)) violations.push("SCANNER_REPORT no-findings claim disagrees with findings.");
  if (!report?.execution?.execution_id || !Number.isFinite(Date.parse(report?.execution?.started_at)) || !Number.isFinite(Date.parse(report?.execution?.completed_at)) || Date.parse(report.execution.completed_at) < Date.parse(report.execution.started_at)) violations.push("SCANNER_REPORT execution identity or chronology is invalid.");
  if (report?.report_payload_sha256 !== canonicalSha256(scannerReportPayload(report))) violations.push("SCANNER_REPORT payload hash mismatch.");
  return { ok: violations.length === 0, violations, bundle };
}
