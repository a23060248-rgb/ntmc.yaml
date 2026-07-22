import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath, safeNewPath, verifyCreatedPath } from "./lib/path-safety.mjs";
import { buildBootstrapScanReport } from "./lib/governance/scanner-report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [generatedAt, outputRef] = process.argv.slice(2);
if (Number.isNaN(Date.parse(generatedAt)) || !outputRef) throw new Error("ISO timestamp and output ref are required.");
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readFile(await safeExistingPath(root, manifestRef));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const report = await buildBootstrapScanReport({ projectRoot: root, manifestBytes, manifest, startedAt: generatedAt, completedAt: generatedAt });
await writeFile(await safeNewPath(root, outputRef), `${JSON.stringify(report, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
await verifyCreatedPath(root, outputRef);
console.log(`BOOTSTRAP_SCAN_REPORT result=${report.results.result} files=${report.candidate_binding.scanned_file_count} findings=${report.results.finding_count} contract=${report.scan_contract.contract_id}@${report.scan_contract.contract_version} payload_sha256=${report.report_payload_sha256}`);
if (report.results.finding_count) process.exit(2);
