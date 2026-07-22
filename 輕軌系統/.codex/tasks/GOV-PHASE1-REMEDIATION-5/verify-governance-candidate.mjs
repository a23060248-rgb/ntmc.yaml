import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectGovernanceCommitRefs } from "../../scripts/lib/governance-commit-manifest.mjs";
import { scanText, scanBinaryContent, classifyOperationalContent } from "../../scripts/lib/governance/scanner-pipeline.mjs";
import { validateSchema } from "../../scripts/lib/schema-validator.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const canonicalSha256 = (value) => sha256(JSON.stringify(value));
const manifestBytes = await readFile(path.join(root, manifestRef));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const schema = JSON.parse(await readFile(path.join(root, ".codex/blueprints/schemas/governance-commit-manifest.schema.json"), "utf8"));
const violations = validateSchema(schema, manifest, manifestRef);
const collected = await collectGovernanceCommitRefs(root);
const listed = manifest.artifacts.map((item) => item.path);
if (JSON.stringify(listed) !== JSON.stringify(collected)) violations.push("MANIFEST exact sorted source set mismatch.");
const fileResults = [];
for (const artifact of manifest.artifacts) {
  const bytes = await readFile(path.join(root, artifact.path));
  const actualHash = sha256(bytes);
  const text = bytes.toString("utf8");
  const findings = [...scanBinaryContent(bytes, artifact.path), ...scanText(text, artifact.path), ...classifyOperationalContent(text, artifact.path)];
  if (actualHash !== artifact.sha256) violations.push(`HASH mismatch ${artifact.path}.`);
  for (const finding of findings) violations.push(`SCAN ${finding}`);
  fileResults.push({ relative_path: artifact.path, sha256: actualHash, hash_matches: actualHash === artifact.sha256, finding_count: findings.length });
}
const report = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-5",
  manifest_ref: manifestRef,
  manifest_sha256: sha256(manifestBytes),
  included_file_count: listed.length,
  included_path_set_sha256: canonicalSha256(listed),
  included_file_set_sha256: canonicalSha256([...fileResults].sort((a, b) => a.relative_path.localeCompare(b.relative_path)).map((item) => ({ path: item.relative_path, sha256: item.sha256 }))),
  exact_set_matches_collector: JSON.stringify(listed) === JSON.stringify(collected),
  all_hashes_match: fileResults.every((item) => item.hash_matches),
  declared_contract_finding_count: fileResults.reduce((sum, item) => sum + item.finding_count, 0),
  source_files: fileResults,
  violations,
  result: violations.length ? "FAIL" : "PASS"
};
await writeFile(path.join(taskDir, "candidate-manifest-verification.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "w" });
console.log(`CANDIDATE_MANIFEST result=${report.result} files=${report.included_file_count} findings=${report.declared_contract_finding_count} violations=${violations.length}`);
process.exit(violations.length ? 1 : 0);
