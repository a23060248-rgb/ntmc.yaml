import { validateRelativeRef } from "../path-safety.mjs";

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function normalizeScopePattern(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("scope pattern must be a non-empty string");
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  validateRelativeRef(normalized);
  const wildcardCount = (normalized.match(/[?*\[\]{}]/g) ?? []).length;
  const supportedRecursive = normalized.endsWith("/**") && wildcardCount === 2;
  const supportedTerminalStar = wildcardCount === 1 && normalized.includes("*") && !normalized.includes("**") && normalized.lastIndexOf("/") < normalized.indexOf("*");
  if (wildcardCount && !supportedRecursive && !supportedTerminalStar) throw new Error(`ambiguous scope pattern is unsupported: ${value}`);
  return normalized;
}

function terminalStarRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace("*", "[^/]*");
  return new RegExp(`^${escaped}$`);
}

export function pathMatchesPattern(ref, pattern) {
  const value = normalizeScopePattern(ref);
  const allowed = normalizeScopePattern(pattern);
  if (allowed.endsWith("/**")) {
    const base = allowed.slice(0, -3);
    return value === base || value.startsWith(`${base}/`);
  }
  if (allowed.includes("*")) return !value.includes("*") && terminalStarRegex(allowed).test(value);
  return value === allowed;
}

export function isPatternSubset(candidate, parent) {
  const child = normalizeScopePattern(candidate);
  const allowed = normalizeScopePattern(parent);
  if (child === allowed) return true;
  if (allowed.endsWith("/**")) {
    const base = allowed.slice(0, -3);
    return child === base || child.startsWith(`${base}/`);
  }
  if (allowed.includes("*")) return !child.includes("*") && terminalStarRegex(allowed).test(child);
  return false;
}

export function patternsWithin(candidates = [], parents = []) {
  return candidates.every((candidate) => parents.some((parent) => isPatternSubset(candidate, parent)));
}

export function intersectPatternLists(left = [], right = []) {
  const result = [];
  for (const a of left.map(normalizeScopePattern)) {
    for (const b of right.map(normalizeScopePattern)) {
      if (isPatternSubset(a, b)) result.push(a);
      else if (isPatternSubset(b, a)) result.push(b);
    }
  }
  return unique(result).filter((candidate, index, all) => !all.some((other, otherIndex) => otherIndex !== index && isPatternSubset(candidate, other) && candidate !== other));
}

function intersectLayers(layers, kind, violations, { requireNonEmpty = true } = {}) {
  let result = null;
  for (const [name, raw] of layers) {
    if (!Array.isArray(raw)) {
      violations.push(`SCOPE_LATTICE ${name}.${kind} is missing.`);
      return [];
    }
    if (requireNonEmpty && raw.length === 0) {
      violations.push(`SCOPE_LATTICE ${name}.${kind} is empty and grants no authority.`);
      return [];
    }
    let normalized;
    try { normalized = unique(raw.map(normalizeScopePattern)); }
    catch (error) { violations.push(`SCOPE_LATTICE ${name}.${kind}: ${error.message}`); return []; }
    result = result === null ? normalized : intersectPatternLists(result, normalized);
  }
  return result ?? [];
}

function booleanIntersection(values, name, violations) {
  if (values.some((value) => typeof value !== "boolean")) {
    violations.push(`SCOPE_LATTICE ${name} has a missing or non-boolean source.`);
    return false;
  }
  return values.every(Boolean);
}

export function computeEffectiveScope({ phase_policy, task_intent, classification, blueprint, role_policy, agent_assignments }) {
  const violations = [];
  const gateViolations = [];
  const assignments = Array.isArray(agent_assignments) ? agent_assignments : [];
  if (!phase_policy || !task_intent || !classification || !blueprint || !role_policy || !Array.isArray(agent_assignments)) {
    violations.push("SCOPE_LATTICE all six authority sources are required.");
  }

  const taskRead = intersectLayers([
    ["phase_policy", phase_policy?.authorized_read_paths],
    ["task_intent", task_intent?.scope?.include],
    ["classification", classification?.scope?.include],
    ["blueprint", blueprint?.allowed_paths?.read]
  ], "read", violations);
  const taskWrite = intersectLayers([
    ["phase_policy", phase_policy?.authorized_write_paths],
    ["task_intent", task_intent?.scope?.include],
    ["classification", classification?.scope?.include],
    ["blueprint", blueprint?.allowed_paths?.write]
  ], "write", violations);

  const productWriteAllowed = booleanIntersection([
    phase_policy?.product_write_allowed,
    task_intent?.scope?.product_changes_allowed,
    classification?.scope?.product_changes_allowed ?? false,
    blueprint?.scope?.product_changes_allowed
  ], "product_write_allowed", violations);
  const databaseWriteAllowed = booleanIntersection([
    phase_policy?.database_write_allowed,
    task_intent?.scope?.database_operations_allowed,
    classification?.scope?.database_operations_allowed ?? false,
    blueprint?.scope?.database_operations_allowed
  ], "database_write_allowed", violations);

  const productSources = [task_intent?.scope?.product_changes_allowed, classification?.scope?.product_changes_allowed ?? false, blueprint?.scope?.product_changes_allowed];
  const databaseSources = [task_intent?.scope?.database_operations_allowed, classification?.scope?.database_operations_allowed ?? false, blueprint?.scope?.database_operations_allowed];
  if (phase_policy?.product_write_allowed === false && productSources.some(Boolean)) violations.push("SCOPE_LATTICE a downstream source attempts to enable product writes forbidden by Phase Policy.");
  if (phase_policy?.database_write_allowed === false && databaseSources.some(Boolean)) violations.push("SCOPE_LATTICE a downstream source attempts to enable database writes forbidden by Phase Policy.");

  if (phase_policy?.phase_id === "phase1_governance_only" && productWriteAllowed) violations.push("SCOPE_LATTICE Phase 1 cannot authorize product writes.");
  if (phase_policy?.phase_id === "phase1_governance_only" && databaseWriteAllowed) violations.push("SCOPE_LATTICE Phase 1 cannot authorize database writes.");

  const roles = {};
  const seenRoles = new Set();
  for (const assignment of assignments) {
    const role = assignment?.role;
    if (!role || seenRoles.has(role)) {
      violations.push(`SCOPE_LATTICE duplicate or missing Agent assignment role ${role ?? "<missing>"}.`);
      continue;
    }
    seenRoles.add(role);
    const policy = role_policy?.roles?.[role];
    if (!policy) {
      violations.push(`SCOPE_LATTICE role ${role} has no role policy.`);
      roles[role] = { effective_read_paths: [], effective_write_paths: [] };
      continue;
    }
    const roleRead = intersectLayers([
      ["task", taskRead],
      [`role_policy.${role}`, policy.allowed_read_paths],
      [`agent_assignment.${role}`, assignment.allowed_read_paths]
    ], "read", violations);
    const roleWrite = intersectLayers([
      ["task", taskWrite],
      [`role_policy.${role}`, policy.allowed_write_paths],
      [`agent_assignment.${role}`, assignment.allowed_write_paths]
    ], "write", violations, { requireNonEmpty: false });
    for (const candidate of assignment.allowed_read_paths ?? []) if (!taskRead.some((parent) => isPatternSubset(candidate, parent)) || !(policy.allowed_read_paths ?? []).some((parent) => isPatternSubset(candidate, parent))) gateViolations.push(`SCOPE_LATTICE role ${role} read path exceeds an upstream authority and is not granted: ${candidate}`);
    for (const candidate of assignment.allowed_write_paths ?? []) if (!taskWrite.some((parent) => isPatternSubset(candidate, parent)) || !(policy.allowed_write_paths ?? []).some((parent) => isPatternSubset(candidate, parent))) violations.push(`SCOPE_LATTICE role ${role} write path exceeds an upstream authority: ${candidate}`);
    roles[role] = { effective_read_paths: roleRead, effective_write_paths: roleWrite };
  }

  return {
    effective_read_paths: taskRead,
    effective_write_paths: taskWrite,
    product_write_allowed: phase_policy?.phase_id === "phase1_governance_only" ? false : productWriteAllowed,
    database_write_allowed: phase_policy?.phase_id === "phase1_governance_only" ? false : databaseWriteAllowed,
    role_scopes: roles,
    violations: unique(violations),
    gate_violations: unique(gateViolations)
  };
}

export function validatePathsAgainstEffectiveScope(paths, effectiveWritePaths) {
  const errors = [];
  for (const ref of unique(paths)) {
    try {
      const normalized = normalizeScopePattern(ref);
      if (normalized.includes("*")) throw new Error("changed path must be concrete");
      if (!effectiveWritePaths.some((pattern) => pathMatchesPattern(normalized, pattern))) errors.push(`OUTSIDE_EFFECTIVE_SCOPE ${normalized}`);
    } catch (error) { errors.push(`UNSAFE_SCOPE_PATH ${ref}: ${error.message}`); }
  }
  return errors;
}

export function validateDeclaredChangesAgainstScope(paths, effectiveWritePaths) {
  const errors = [];
  for (const ref of unique(paths)) {
    try {
      const normalized = normalizeScopePattern(ref);
      const allowed = effectiveWritePaths.some((pattern) => normalized.includes("*") ? isPatternSubset(normalized, pattern) : pathMatchesPattern(normalized, pattern));
      if (!allowed) errors.push(`OUTSIDE_EFFECTIVE_SCOPE ${normalized}`);
    } catch (error) { errors.push(`UNSAFE_SCOPE_PATH ${ref}: ${error.message}`); }
  }
  return errors;
}

export function resolveActorScope({ handoff, effectiveScope }) {
  const violations = [];
  const changed = Array.isArray(handoff?.changed_files) ? handoff.changed_files : [];
  if (!changed.length) violations.push("SCOPE_ACTOR implementation handoff changed_files is empty.");
  const roles = effectiveScope?.role_scopes ?? {};
  let actorRole = handoff?.actor_role ?? null;
  let binding = "explicit";
  if (actorRole !== null && (typeof actorRole !== "string" || !actorRole.trim())) violations.push("SCOPE_ACTOR actor_role must be a non-empty role name.");
  if (!actorRole) {
    const candidates = Object.entries(roles)
      .filter(([_role, scope]) => scope.effective_write_paths.length > 0 && validateDeclaredChangesAgainstScope(changed, scope.effective_write_paths).length === 0)
      .map(([role]) => role);
    if (candidates.length !== 1) violations.push(`SCOPE_ACTOR exact actor is missing and validated assignment resolution matched ${candidates.length} roles.`);
    else { actorRole = candidates[0]; binding = "derived-unique-assignment"; }
  }
  const roleScope = actorRole ? roles[actorRole] : null;
  if (actorRole && !roleScope) violations.push(`SCOPE_ACTOR role ${actorRole} has no validated assignment.`);
  if (roleScope?.effective_write_paths.length === 0) violations.push(`SCOPE_ACTOR role ${actorRole} has an empty effective write scope.`);
  if (roleScope) violations.push(...validateDeclaredChangesAgainstScope(changed, roleScope.effective_write_paths).map((item) => `SCOPE_ACTOR ${item}`));
  return {
    actor_role: violations.length ? null : actorRole,
    binding: violations.length ? null : binding,
    effective_write_paths: violations.length ? [] : roleScope.effective_write_paths,
    violations: unique(violations)
  };
}
