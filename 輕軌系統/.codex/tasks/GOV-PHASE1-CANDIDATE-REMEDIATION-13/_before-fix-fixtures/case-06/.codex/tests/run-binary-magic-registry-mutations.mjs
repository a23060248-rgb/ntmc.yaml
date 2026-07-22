import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadScannerContractBundle } from "../scripts/lib/governance/scanner-report.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const registryRef = ".codex/governance/bootstrap-binary-magic-registry.yaml";
const contractRef = ".codex/governance/scan-contract.yaml";
const casesRef = ".codex/tests/scanner-production-case-manifest.json";
const runnerRef = ".codex/tests/run-bootstrap-scanner-production.mjs";
const copyRefs = [".codex/blueprints", ".codex/governance", ".codex/scripts", ".codex/tests"];
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex").toUpperCase();
const originalRegistry = JSON.parse(await readFile(path.join(sourceRoot, ...registryRef.split("/")), "utf8"));
const families = ["remove-registry-entry", "remove-positive-oracle", "remove-safe-negative-oracle", "modify-signature", "wrong-finding-class"];
const results = [];

async function createCaseRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ntmc-binary-magic-mutation-"));
  for (const ref of copyRefs) {
    const target = path.join(root, ...ref.split("/"));
    await mkdir(path.dirname(target), {recursive: true});
    await cp(path.join(sourceRoot, ...ref.split("/")), target, {recursive: true});
  }
  return root;
}

async function writeRegistryAndRepin(root, registry) {
  const registryBytes = Buffer.from(json(registry));
  await writeFile(path.join(root, ...registryRef.split("/")), registryBytes);
  const contractPath = path.join(root, ...contractRef.split("/"));
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  contract.binary_magic_registry_sha256 = sha256(registryBytes);
  await writeFile(contractPath, json(contract));
}

for (const entry of originalRegistry.entries) {
  for (const family of families) {
    const root = await createCaseRoot();
    const registry = structuredClone(originalRegistry);
    const target = registry.entries.find((item) => item.magic_id === entry.magic_id);
    if (family === "remove-registry-entry") {
      registry.entries = registry.entries.filter((item) => item.magic_id !== entry.magic_id);
      await writeRegistryAndRepin(root, registry);
    } else if (family === "modify-signature") {
      const lastByte = target.signature_bytes.slice(-2);
      target.signature_bytes = `${target.signature_bytes.slice(0, -2)}${lastByte === "00" ? "01" : "00"}`;
      await writeRegistryAndRepin(root, registry);
    } else if (family === "wrong-finding-class") {
      target.finding_class = "NON_UTF8_TEXT";
      await writeRegistryAndRepin(root, registry);
    } else {
      const casePath = path.join(root, ...casesRef.split("/"));
      const caseManifest = JSON.parse(await readFile(casePath, "utf8"));
      const removedId = family === "remove-positive-oracle" ? entry.positive_fixture_id : entry.safe_negative_fixture_id;
      caseManifest.cases = caseManifest.cases.filter((item) => item[0] !== removedId);
      await writeFile(casePath, json(caseManifest));
    }

    const bundle = await loadScannerContractBundle(root);
    let killed = bundle.violations.length > 0;
    let childExit = null;
    let expectedCaseFailed = null;
    let outputTail = "";
    if (family === "modify-signature" && bundle.violations.length === 0) {
      const child = spawnSync(process.execPath, [path.join(root, ...runnerRef.split("/"))], {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024});
      const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
      childExit = child.status;
      expectedCaseFailed = output.includes(`FAIL ${entry.positive_fixture_id}`);
      killed = child.status !== 0 && expectedCaseFailed;
      outputTail = output.slice(-1200);
    }
    results.push({mutation_id: `MUT-MAGIC-${entry.magic_id.toUpperCase()}-${family.toUpperCase()}`, magic_id: entry.magic_id, family, production_components: [registryRef, casesRef, ".codex/scripts/lib/governance/scanner-pipeline.mjs"], bundle_violation_count: bundle.violations.length, bundle_violations: bundle.violations, expected_positive_case: entry.positive_fixture_id, expected_safe_negative_case: entry.safe_negative_fixture_id, child_exit: childExit, expected_case_failed: expectedCaseFailed, killed, output_tail: outputTail});
    await rm(root, {recursive: true, force: true});
  }
}

const survived = results.filter((item) => !item.killed);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.mutation_id} killed=${item.killed} bundle_violations=${item.bundle_violation_count} child_exit=${item.child_exit ?? "n/a"}`);
console.log(`BINARY_MAGIC_MUTATIONS ${JSON.stringify({registry_id: originalRegistry.registry_id, registry_version: originalRegistry.registry_version, magic_count: originalRegistry.entries.length, mutation_families: families, total: results.length, killed: results.filter((item) => item.killed).length, survived: survived.length, results})}`);
process.exit(survived.length ? 1 : 0);
