import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICIAL_FIXTURE_RUNNER_REF, validateFixtureSchemaLoaderContract } from "../scripts/lib/governance/fixture-schema-loader-contract.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = await readFile(path.join(projectRoot, ...OFFICIAL_FIXTURE_RUNNER_REF.split("/")), "utf8");
const replace = (before, after) => (text) => text.replace(before, after);
const mutations = [
  {id: "LOADER-MUT-01-ALTERNATE-IMPORT", mutate: replace('from "../scripts/lib/governance/governance-schema-loader.mjs"', 'from "./fixtures/fake-schema-loader.mjs"')},
  {id: "LOADER-MUT-02-DISABLE-MANIFEST-BINDING", mutate: replace("loadAndCompileGovernanceSchemas(projectRoot);", "loadAndCompileGovernanceSchemas(projectRoot, {requireManifestBinding: false});")},
  {id: "LOADER-MUT-03-FALLBACK-SCHEMA", mutate: replace("const schemaSet = await loadAndCompileGovernanceSchemas(projectRoot);", "const fallbackSchema = {}; const schemaSet = fallbackSchema;")},
  {id: "LOADER-MUT-04-SKIP-TYPED-VALIDATION", mutate: replace("const typedRailwayIssues = schemaSet.validate(railwaySchemaRef, typedRailwayFixture", "const typedRailwayIssues = []; void schemaSet.validate(railwaySchemaRef, typedRailwayFixture")},
  {id: "LOADER-MUT-05-SKIP-SET-HASH", mutate: replace("if (scanContract.schema_set_sha256 !== schemaSet.schema_set_sha256)", "if (false && scanContract.schema_set_sha256 !== schemaSet.schema_set_sha256)")},
  {id: "LOADER-MUT-06-FALSE-EXECUTION-REPORT", mutate: replace("production_loader_used: true", "production_loader_used: false")}
];

const results = mutations.map((mutation) => {
  const mutated = mutation.mutate(source);
  const applied = mutated !== source;
  const violations = applied ? validateFixtureSchemaLoaderContract(mutated) : [];
  return {mutation_id: mutation.id, mutation_applied: applied, killed: applied && violations.length > 0, violations};
});
const survived = results.filter((item) => !item.killed);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.mutation_id} killed=${item.killed}`);
console.log(`OFFICIAL_SCHEMA_LOADER_MUTATIONS ${JSON.stringify({total: results.length, killed: results.filter((item) => item.killed).length, survived: survived.length, transient_source_values_only: true, results})}`);
process.exit(survived.length ? 1 : 0);
