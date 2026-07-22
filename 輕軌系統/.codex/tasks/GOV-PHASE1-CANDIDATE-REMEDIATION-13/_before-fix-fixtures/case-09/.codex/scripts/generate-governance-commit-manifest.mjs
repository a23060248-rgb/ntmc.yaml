import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectGovernanceCommitRefs, excludedGovernanceRecords } from "./lib/governance-commit-manifest.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const generatedAt = process.argv[2];
if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) throw new Error("ISO generated_at argument is required.");
const refs = await collectGovernanceCommitRefs(root);
const artifacts = [];
for (const ref of refs) {
  const bytes = await readFile(path.join(root, ...ref.split("/")));
  artifacts.push({ path: ref, artifact_type: ref === "AGENTS.md" ? "governance-policy" : `governance-${path.extname(ref).slice(1).toLowerCase() || "text"}`, commit_inclusion: true, scan_required: true, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(), binary_allowed: false });
}
const manifest = { schema_version: 1, manifest_type: "governance-commit-manifest", generated_at: generatedAt, self_excluded: true, artifacts, excluded_records: excludedGovernanceRecords };
await writeFile(path.join(root, ".codex", "governance", "governance-commit-manifest.yaml"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "w" });
console.log(`GOVERNANCE_COMMIT_MANIFEST artifacts=${artifacts.length} excluded=${excludedGovernanceRecords.length}`);
