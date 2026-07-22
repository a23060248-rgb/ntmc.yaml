import path from "node:path";
import { readFile } from "node:fs/promises";
import { safeExistingPath } from "../path-safety.mjs";
import { canonicalSha256, sha256 } from "./typed-proof.mjs";
import { validateSchema } from "../schema-validator.mjs";

export const GOVERNANCE_SCHEMA_SET_REF = ".codex/governance/governance-schema-set.yaml";
export const EVIDENCE_SCHEMA_REGISTRY_REF = ".codex/governance/evidence-schema-registry.yaml";
const MANIFEST_REF = ".codex/governance/governance-commit-manifest.yaml";

function resolveLocalRef(schema, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  return ref.slice(2).split("/").reduce((node, key) => node?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], schema);
}

function compileLocalReferences(schema, ref) {
  const violations = [];
  const visit = (node, pointer) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.$ref === "string" && !resolveLocalRef(schema, node.$ref)) violations.push(`SCHEMA_SET ${ref}${pointer} unresolved reference ${node.$ref}.`);
    for (const [key, value] of Object.entries(node)) visit(value, `${pointer}/${key}`);
  };
  visit(schema, "");
  return violations;
}

export async function loadAndCompileGovernanceSchemas(projectRoot, { requireManifestBinding = true } = {}) {
  const registryBytes = await readFile(await safeExistingPath(projectRoot, GOVERNANCE_SCHEMA_SET_REF));
  const registry = JSON.parse(registryBytes.toString("utf8"));
  if (registry.schema_version !== 1 || registry.schema_set_version !== 1 || registry.schema_set_id !== "GOV-PHASE1-COMPILED-SCHEMA-SET") throw new Error("SCHEMA_SET registry identity/version mismatch.");
  if (!Array.isArray(registry.schemas) || !registry.schemas.length) throw new Error("SCHEMA_SET registry is empty.");

  const registryRefs = registry.schemas.map((item) => item.ref).sort();
  if (new Set(registryRefs).size !== registryRefs.length) throw new Error("SCHEMA_SET registry contains duplicate schema references.");
  if (requireManifestBinding) {
    const manifest = JSON.parse(await readFile(await safeExistingPath(projectRoot, MANIFEST_REF), "utf8"));
    const manifestSchemaRefs = (manifest.artifacts ?? []).map((item) => item.path).filter((ref) => /^\.codex\/blueprints\/schemas\/[^/]+\.schema\.json$/.test(ref)).sort();
    if (JSON.stringify(manifestSchemaRefs) !== JSON.stringify(registryRefs)) throw new Error("SCHEMA_SET registry must exactly equal manifest-listed executable schemas.");
  }

  const byRef = new Map(), byName = new Map(), ids = new Set(), compiled = [], violations = [];
  for (const entry of registry.schemas) {
    if (entry.version !== 1) violations.push(`SCHEMA_SET ${entry.ref} registry version mismatch.`);
    const bytes = await readFile(await safeExistingPath(projectRoot, entry.ref));
    let schema;
    try { schema = JSON.parse(bytes.toString("utf8")); }
    catch (error) { throw new Error(`SCHEMA_SET ${entry.ref} invalid JSON: ${error.message}`); }
    if (schema.$id !== entry.id || schema["x-governance-schema-version"] !== entry.version) violations.push(`SCHEMA_SET ${entry.ref} id/version mismatch.`);
    if (ids.has(schema.$id)) violations.push(`SCHEMA_SET duplicate $id ${schema.$id}.`);
    ids.add(schema.$id);
    violations.push(...compileLocalReferences(schema, entry.ref));
    byRef.set(entry.ref, schema);
    byName.set(path.posix.basename(entry.ref), schema);
    compiled.push({ref: entry.ref, id: schema.$id, version: schema["x-governance-schema-version"], sha256: sha256(bytes)});
  }
  if (violations.length) throw new Error(violations.join(" | "));
  compiled.sort((left, right) => left.ref.localeCompare(right.ref));
  const schema_set_sha256 = canonicalSha256({schema_set_id: registry.schema_set_id, schema_set_version: registry.schema_set_version, schemas: compiled});
  const evidenceRegistryBytes = await readFile(await safeExistingPath(projectRoot, EVIDENCE_SCHEMA_REGISTRY_REF));
  let evidenceRegistry;
  try { evidenceRegistry = JSON.parse(evidenceRegistryBytes.toString("utf8")); }
  catch (error) { throw new Error(`EVIDENCE_SCHEMA_REGISTRY invalid JSON: ${error.message}`); }
  if (evidenceRegistry.schema_version !== 1 || evidenceRegistry.registry_id !== "GOV-EVIDENCE-SCHEMA-REGISTRY" || evidenceRegistry.registry_version !== 1 || !Array.isArray(evidenceRegistry.entries) || !evidenceRegistry.entries.length) throw new Error("EVIDENCE_SCHEMA_REGISTRY identity/version/entries mismatch.");
  const evidenceByType = new Map(), evidenceIds = new Set(), evidencePaths = new Set();
  for (const entry of evidenceRegistry.entries) {
    if (!entry.evidence_type || evidenceByType.has(entry.evidence_type)) throw new Error(`EVIDENCE_SCHEMA_REGISTRY duplicate or missing evidence_type ${entry.evidence_type ?? "<missing>"}.`);
    if (!entry.schema_id || evidenceIds.has(entry.schema_id)) throw new Error(`EVIDENCE_SCHEMA_REGISTRY duplicate or missing schema_id ${entry.schema_id ?? "<missing>"}.`);
    if (!entry.schema_path || evidencePaths.has(entry.schema_path)) throw new Error(`EVIDENCE_SCHEMA_REGISTRY duplicate or missing schema_path ${entry.schema_path ?? "<missing>"}.`);
    const schema = byRef.get(entry.schema_path);
    const compiledEntry = compiled.find((item) => item.ref === entry.schema_path);
    if (!schema || !compiledEntry) throw new Error(`EVIDENCE_SCHEMA_REGISTRY unregistered schema_path ${entry.schema_path}.`);
    if (entry.authority !== "registered_schema" || entry.schema_id !== schema.$id || entry.schema_version !== schema["x-governance-schema-version"] || entry.schema_sha256 !== compiledEntry.sha256) throw new Error(`EVIDENCE_SCHEMA_REGISTRY binding mismatch for ${entry.evidence_type}.`);
    if (typeof entry.allow_multiple !== "boolean" || !Array.isArray(entry.allowed_locations) || !entry.allowed_locations.length) throw new Error(`EVIDENCE_SCHEMA_REGISTRY multiplicity/location contract invalid for ${entry.evidence_type}.`);
    evidenceByType.set(entry.evidence_type, Object.freeze({...entry}));
    evidenceIds.add(entry.schema_id); evidencePaths.add(entry.schema_path);
  }
  return Object.freeze({registry, byRef, byName, schemas: compiled, schema_set_sha256, registry_sha256: sha256(registryBytes), evidenceRegistry: Object.freeze(evidenceRegistry), evidenceByType, evidence_registry_sha256: sha256(evidenceRegistryBytes), validate(ref, value, location = ref) { const schema = byRef.get(ref); if (!schema) return [`SCHEMA_SET unregistered schema ${ref}.`]; return validateSchema(schema, value, location); }});
}
