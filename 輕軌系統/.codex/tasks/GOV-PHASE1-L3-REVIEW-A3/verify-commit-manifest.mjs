import { lstat, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanText, classifyOperationalContent, scanBinaryContent } from "../../scripts/lib/secret-scanner.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "..", "..", "..");
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const manifestBytes = await readFile(path.join(root, ...manifestRef.split("/")));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const results = [];

for (const artifact of manifest.artifacts ?? []) {
  const absolute = path.join(root, ...artifact.path.split("/"));
  const info = await lstat(absolute);
  const bytes = await readFile(absolute);
  const actualHash = sha256(bytes);
  const binaryFindings = scanBinaryContent(bytes, artifact.path);
  const secretFindings = scanText(bytes.toString("utf8"), artifact.path);
  const operationalFindings = classifyOperationalContent(bytes.toString("utf8"), artifact.path);
  results.push({ relative_path: artifact.path, regular_file: info.isFile() && !info.isSymbolicLink(), commit_inclusion: artifact.commit_inclusion, scan_required: artifact.scan_required, binary_allowed: artifact.binary_allowed, declared_sha256: artifact.sha256.toUpperCase(), actual_sha256: actualHash, hash_matches: actualHash === artifact.sha256.toUpperCase(), binary_findings: binaryFindings, secret_findings: secretFindings, operational_path_findings: operationalFindings, passed: info.isFile() && !info.isSymbolicLink() && artifact.commit_inclusion === true && artifact.scan_required === true && artifact.binary_allowed === false && actualHash === artifact.sha256.toUpperCase() && binaryFindings.length === 0 && secretFindings.length === 0 && operationalFindings.length === 0 });
}

const unique = new Set(results.map((item) => item.relative_path)).size === results.length;
const output = { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A3", manifest: { relative_path: manifestRef, sha256: sha256(manifestBytes), declared_count: manifest.artifacts?.length ?? 0 }, included_count: results.length, unique_paths: unique, all_files_passed: results.every((item) => item.passed), manifest_outside_files_claimed_scanned: false, results, result: results.length === 87 && unique && results.every((item) => item.passed) ? "PASS" : "FAIL" };
await writeFile(path.join(taskDir, "commit-manifest-verification.json"), `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`A3_MANIFEST_VERIFY result=${output.result} included=${results.length} manifest_sha256=${output.manifest.sha256}`);
