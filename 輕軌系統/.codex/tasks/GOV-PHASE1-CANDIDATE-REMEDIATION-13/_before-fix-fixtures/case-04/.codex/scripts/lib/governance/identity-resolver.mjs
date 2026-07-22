function identity(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function exact(value, expected) {
  return expected === undefined || value === expected;
}

export function validateUniqueArtifacts(artifacts = []) {
  const violations = [];
  const seen = new Map();
  for (const [index, artifact] of artifacts.entries()) {
    const id = identity(artifact?.artifact_id);
    if (!id) { violations.push(`ARTIFACT_ID missing at index ${index}.`); continue; }
    if (seen.has(id)) violations.push(`ARTIFACT_ID duplicate ${id} at indexes ${seen.get(id)} and ${index}; duplicates are never merged.`);
    else seen.set(id, index);
  }
  return violations;
}

export function resolveUniqueArtifact(artifacts = [], artifactId, expected = {}) {
  const violations = validateUniqueArtifacts(artifacts);
  if (!identity(artifactId)) violations.push("ARTIFACT_RESOLUTION requires an exact non-empty artifact_id.");
  const matches = artifacts.filter((artifact) => artifact?.artifact_id === artifactId);
  if (matches.length !== 1) violations.push(`ARTIFACT_RESOLUTION ${artifactId ?? "<missing>"} matched ${matches.length}; exactly one is required.`);
  const value = matches.length === 1 ? matches[0] : null;
  for (const field of ["type", "path", "sha256", "producer", "authority", "task_id", "subject_id"]) {
    if (value && !exact(value[field], expected[field])) violations.push(`ARTIFACT_RESOLUTION ${artifactId} ${field} mismatch.`);
  }
  return { ok: violations.length === 0, value: violations.length === 0 ? value : null, violations };
}

export function validateUniqueRequirements(requirements = []) {
  const violations = [];
  const seen = new Map();
  for (const [index, requirement] of requirements.entries()) {
    const id = identity(requirement?.requirement_id);
    if (!id) { violations.push(`REQUIREMENT_ID missing at index ${index}.`); continue; }
    if (seen.has(id)) violations.push(`REQUIREMENT_ID duplicate ${id} at indexes ${seen.get(id)} and ${index}; definitions cannot be overlaid.`);
    else seen.set(id, index);
  }
  return violations;
}

export function resolveUniqueRequirement(requirements = [], requirementId, expected = {}) {
  const violations = validateUniqueRequirements(requirements);
  if (!identity(requirementId)) violations.push("REQUIREMENT_RESOLUTION requires an exact non-empty requirement_id.");
  const matches = requirements.filter((item) => item?.requirement_id === requirementId);
  if (matches.length !== 1) violations.push(`REQUIREMENT_RESOLUTION ${requirementId ?? "<missing>"} matched ${matches.length}; exactly one is required.`);
  const value = matches.length === 1 ? matches[0] : null;
  for (const field of ["semantic_category", "criticality", "required_level"]) if (value && !exact(value[field], expected[field])) violations.push(`REQUIREMENT_RESOLUTION ${requirementId} ${field} mismatch.`);
  return { ok: violations.length === 0, value: violations.length === 0 ? value : null, violations };
}

export function resolveRequirementVerdict({ requirements = [], checks = [], requirementId }) {
  const requirement = resolveUniqueRequirement(requirements, requirementId);
  const violations = [...requirement.violations];
  const verdicts = checks.filter((check) => check?.requirement_id === requirementId);
  if (verdicts.length !== 1) violations.push(`REQUIREMENT_VERDICT ${requirementId} matched ${verdicts.length}; exactly one is required.`);
  const verdict = verdicts.length === 1 ? verdicts[0] : null;
  if (verdict && verdict.result !== "PASS") violations.push(`REQUIREMENT_VERDICT ${requirementId} is ${verdict.result}; Phase 1 required evidence accepts PASS only.`);
  if (verdict && Object.hasOwn(verdict, "waiver_artifact_id")) violations.push(`REQUIREMENT_VERDICT ${requirementId} contains unsupported Phase 1 waiver data.`);
  return { ok: violations.length === 0, requirement: requirement.value, verdict: violations.length === 0 ? verdict : null, violations };
}
