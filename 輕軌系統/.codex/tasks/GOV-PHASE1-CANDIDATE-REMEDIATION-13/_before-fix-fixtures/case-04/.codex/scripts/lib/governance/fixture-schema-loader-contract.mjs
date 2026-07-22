export const OFFICIAL_FIXTURE_RUNNER_REF = ".codex/tests/run-governance-fixtures.mjs";

function count(text, fragment) {
  return text.split(fragment).length - 1;
}

export function validateFixtureSchemaLoaderContract(source) {
  const violations = [];
  const officialImport = 'import { loadAndCompileGovernanceSchemas } from "../scripts/lib/governance/governance-schema-loader.mjs";';
  const officialCall = "const schemaSet = await loadAndCompileGovernanceSchemas(projectRoot);";
  const typedValidation = "const typedRailwayIssues = schemaSet.validate(railwaySchemaRef, typedRailwayFixture";
  const setHashCheck = "if (scanContract.schema_set_sha256 !== schemaSet.schema_set_sha256)";
  if (count(source, officialImport) !== 1) violations.push("FIXTURE_LOADER official production loader import must occur exactly once.");
  if (count(source, officialCall) !== 1) violations.push("FIXTURE_LOADER official production loader call must occur exactly once without options or downgrade.");
  if (count(source, typedValidation) !== 1) violations.push("FIXTURE_LOADER typed Railway fixture must be validated exactly once through the compiled set.");
  if (count(source, setHashCheck) !== 1) violations.push("FIXTURE_LOADER scan-contract/schema-set hash comparison must occur exactly once.");
  if (count(source, "production_loader_used: true") !== 1) violations.push("FIXTURE_LOADER report must assert one production_loader_used=true execution record.");
  const prohibited = ["requireManifestBinding: false", "fixtureSchemaSet", "inlineRailwaySchema", "fallbackSchema", "cachedSchemaSet", "loadFixtureSchemas"];
  for (const fragment of prohibited) if (source.includes(fragment)) violations.push(`FIXTURE_LOADER prohibited alternate or fallback path ${fragment}.`);
  return violations;
}
