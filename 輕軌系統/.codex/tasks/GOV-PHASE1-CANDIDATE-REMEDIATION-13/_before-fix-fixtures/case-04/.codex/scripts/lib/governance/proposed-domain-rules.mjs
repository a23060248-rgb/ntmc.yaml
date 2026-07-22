export const PHASE1_DOMAIN_STATUSES = Object.freeze(["proposed", "candidate", "unverified"]);

export function validateProposedDomainRegistry(domain) {
  const violations = [];
  if (!domain || domain.registry_type !== "proposed_rule_registry") violations.push("DOMAIN_PHASE1 registry_type must be proposed_rule_registry.");
  if (domain?.is_complete_domain_knowledge_base !== false) violations.push("DOMAIN_PHASE1 registry must declare incomplete knowledge.");
  if (domain?.phase1_confirmation_supported !== false) violations.push("DOMAIN_PHASE1 confirmation support must be false.");
  if (domain?.confirmed_rule_count !== 0) violations.push("DOMAIN_PHASE1 confirmed_rule_count must be 0.");
  if (!Array.isArray(domain?.applicable_rules) || domain.applicable_rules.length !== 0) violations.push("DOMAIN_PHASE1 applicable_rules must be empty.");
  const rules = domain?.rules ?? [];
  const ids = new Set();
  for (const rule of rules) {
    if (ids.has(rule.rule_id)) violations.push(`DOMAIN_PHASE1 duplicate Rule ID ${rule.rule_id}.`);
    ids.add(rule.rule_id);
    if (!PHASE1_DOMAIN_STATUSES.includes(rule.status)) violations.push(`DOMAIN_PHASE1 Rule ${rule.rule_id} has unsupported status ${rule.status}.`);
    if (rule.rule_class !== "railway_domain_candidate" || rule.authority_effect !== "candidate_only") violations.push(`DOMAIN_PHASE1 Rule ${rule.rule_id} must be a candidate-only railway Domain Rule.`);
    if (rule.owner !== null || rule.approved_at !== null || rule.human_owner || rule.approval || rule.authority) violations.push(`DOMAIN_PHASE1 Rule ${rule.rule_id} contains confirmation authority fields.`);
  }
  const candidates = domain?.candidate_rules ?? [];
  if (!Array.isArray(candidates) || new Set(candidates).size !== candidates.length) violations.push("DOMAIN_PHASE1 candidate_rules must be a unique array.");
  for (const id of candidates) if (!ids.has(id)) violations.push(`DOMAIN_PHASE1 candidate_rules references unknown Rule ${id}.`);
  for (const rule of rules) if (!candidates.includes(rule.rule_id)) violations.push(`DOMAIN_PHASE1 proposed Rule ${rule.rule_id} is missing from candidate_rules.`);
  return violations;
}

export function validateTaskDomainSelection({ blueprint, domain }) {
  const violations = validateProposedDomainRegistry(domain);
  const candidateIds = new Set(domain?.candidate_rules ?? []);
  for (const id of blueprint?.applicable_rules ?? []) if (candidateIds.has(id)) violations.push(`DOMAIN_PHASE1 proposed Rule ${id} cannot enter Blueprint applicable_rules.`);
  for (const id of blueprint?.candidate_rules ?? []) if (!candidateIds.has(id)) violations.push(`DOMAIN_PHASE1 Blueprint candidate Rule ${id} is not in the proposed registry.`);
  return violations;
}
