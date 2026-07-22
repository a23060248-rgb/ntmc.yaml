import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICIAL_FIXTURE_RUNNER_REF, validateFixtureSchemaLoaderContract } from "../scripts/lib/governance/fixture-schema-loader-contract.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scopedRoots = ["AGENTS.md", ".agents", ".codex/agents", ".codex/blueprints", ".codex/checklists", ".codex/config.toml", ".codex/domain", ".codex/environment", ".codex/governance", ".codex/meta-rules", ".codex/scripts", ".codex/tests", ".codex/workflows"];
const results = [];
const railwaySchemaRef = ".codex/blueprints/schemas/railway-domain-review.schema.json";
const schemaRegistryRef = ".codex/governance/governance-schema-set.yaml";
const scanContractRef = ".codex/governance/scan-contract.yaml";
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const typedFixtureRef = ".codex/tests/fixtures/valid-railway-domain-review.json";

async function copyScopedRoot() {
  const caseRoot = await mkdtemp(path.join(os.tmpdir(), "ntmc-official-schema-loader-"));
  for (const ref of scopedRoots) {
    const target = path.join(caseRoot, ...ref.split("/"));
    await mkdir(path.dirname(target), {recursive: true});
    await cp(path.join(sourceRoot, ...ref.split("/")), target, {recursive: true});
  }
  return caseRoot;
}

async function jsonAt(root, ref) { return JSON.parse(await readFile(path.join(root, ...ref.split("/")), "utf8")); }
async function writeJsonAt(root, ref, value) { await writeFile(path.join(root, ...ref.split("/")), `${JSON.stringify(value, null, 2)}\n`); }

async function runFixtureCase(caseId, invariant, mutate, expectedExit, expectedFragment = null) {
  const caseRoot = await copyScopedRoot();
  try {
    if (mutate) await mutate(caseRoot);
    const child = spawnSync(process.execPath, [path.join(caseRoot, ...OFFICIAL_FIXTURE_RUNNER_REF.split("/"))], {cwd: caseRoot, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024});
    const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
    const marker = output.split(/\r?\n/).find((line) => line.startsWith("FIXTURE_REPORT "));
    let schemaExecution = null;
    if (marker) schemaExecution = JSON.parse(marker.slice("FIXTURE_REPORT ".length)).schema_execution ?? null;
    const pass = child.status === expectedExit && (!expectedFragment || output.includes(expectedFragment)) && (expectedExit !== 0 || (schemaExecution?.production_loader_used === true && schemaExecution?.schema_compile_status === "PASS" && schemaExecution?.typed_railway_fixture_validated === true));
    results.push({case_id: caseId, invariant, pass, expected_exit: expectedExit, actual_exit: child.status, expected_fragment: expectedFragment, schema_execution: schemaExecution, output_tail: output.slice(-1600)});
  } finally {
    await rm(caseRoot, {recursive: true, force: true});
  }
}

await runFixtureCase("LOADER-INTEGRATION-01", "The 68-case suite uses the official production loader and reports its compiled typed Railway Schema.", null, 0);
await runFixtureCase("LOADER-INTEGRATION-02", "Malformed official Railway Schema fails at suite startup.", async (root) => { await writeFile(path.join(root, ...railwaySchemaRef.split("/")), "{ malformed"); }, 1, "invalid JSON");
await runFixtureCase("LOADER-INTEGRATION-03", "Missing official Railway Schema fails at suite startup.", async (root) => { await rm(path.join(root, ...railwaySchemaRef.split("/"))); }, 1);
await runFixtureCase("LOADER-INTEGRATION-04", "Duplicate Schema identity fails at suite startup.", async (root) => { const schema = await jsonAt(root, railwaySchemaRef); schema.$id = "https://ntmc.local/codex/schemas/blueprint.schema.json"; await writeJsonAt(root, railwaySchemaRef, schema); }, 1, "duplicate $id");
await runFixtureCase("LOADER-INTEGRATION-05", "Railway Schema identity mismatch fails at suite startup.", async (root) => { const schema = await jsonAt(root, railwaySchemaRef); schema.$id = "https://ntmc.local/codex/schemas/wrong-railway-domain-review.schema.json"; await writeJsonAt(root, railwaySchemaRef, schema); }, 1, "id/version mismatch");
await runFixtureCase("LOADER-INTEGRATION-06", "Railway Schema version mismatch fails at suite startup.", async (root) => { const schema = await jsonAt(root, railwaySchemaRef); schema["x-governance-schema-version"] = 2; await writeJsonAt(root, railwaySchemaRef, schema); }, 1, "id/version mismatch");
await runFixtureCase("LOADER-INTEGRATION-07", "Duplicate Schema registry reference fails at suite startup.", async (root) => { const registry = await jsonAt(root, schemaRegistryRef); registry.schemas.push(structuredClone(registry.schemas.at(-1))); await writeJsonAt(root, schemaRegistryRef, registry); }, 1, "duplicate schema references");
await runFixtureCase("LOADER-INTEGRATION-08", "Schema registry and candidate manifest set disagreement fails at suite startup.", async (root) => { const manifest = await jsonAt(root, manifestRef); manifest.artifacts = manifest.artifacts.filter((item) => item.path !== railwaySchemaRef); await writeJsonAt(root, manifestRef, manifest); }, 1, "registry must exactly equal manifest-listed");
await runFixtureCase("LOADER-INTEGRATION-09", "Compiled Schema-set and scan-contract hash disagreement fails at suite startup.", async (root) => { const contract = await jsonAt(root, scanContractRef); contract.schema_set_sha256 = "A".repeat(64); await writeJsonAt(root, scanContractRef, contract); }, 1, "schema_set_sha256 mismatch");
await runFixtureCase("LOADER-INTEGRATION-10", "Invalid typed Railway artifact fails before the numbered fixtures execute.", async (root) => { const fixture = await jsonAt(root, typedFixtureRef); fixture.review_scope = "migration_320_business_approval"; await writeJsonAt(root, typedFixtureRef, fixture); }, 1, "typed Railway fixture is invalid");

const officialSource = await readFile(path.join(sourceRoot, ...OFFICIAL_FIXTURE_RUNNER_REF.split("/")), "utf8");
const sourceViolations = validateFixtureSchemaLoaderContract(officialSource);
results.push({case_id: "LOADER-INTEGRATION-11", invariant: "Fixture source has exactly one official loader/import/call, typed validation and Schema hash check, with no declared alternate or fallback path.", pass: sourceViolations.length === 0, expected_exit: 0, actual_exit: sourceViolations.length ? 1 : 0, expected_fragment: null, source_contract_violations: sourceViolations});

const failed = results.filter((item) => !item.pass);
for (const item of results) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.case_id} ${item.invariant}`);
console.log(`OFFICIAL_SCHEMA_LOADER_INTEGRATION ${JSON.stringify({total: results.length, passed: results.length - failed.length, failed: failed.length, production_loader: "loadAndCompileGovernanceSchemas", transient_copies_only: true, results})}`);
process.exit(failed.length ? 1 : 0);
