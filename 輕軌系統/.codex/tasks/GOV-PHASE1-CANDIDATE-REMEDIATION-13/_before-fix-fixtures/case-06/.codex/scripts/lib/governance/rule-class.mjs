export const BOOTSTRAP_APPLICABLE_RULE_CLASSES = Object.freeze(["governance_control", "technical_constraint"]);
export const RAILWAY_CANDIDATE_CLASS = "railway_domain_candidate";
export const RAILWAY_AUTHORITY_CLASS = "railway_domain_authority";

const expectedEffect = Object.freeze({
  governance_control: "procedural_governance",
  technical_constraint: "technical_constraint",
  railway_domain_candidate: "candidate_only",
  railway_domain_authority: "unsupported"
});

export function validateRuleClassification(rule, registryKind) {
  const violations = [];
  const ruleId = rule?.rule_id ?? "<missing>";
  if (!Object.hasOwn(expectedEffect, rule?.rule_class)) violations.push(`RULE_CLASS ${ruleId} is missing or has unsupported rule_class.`);
  else if (rule.authority_effect !== expectedEffect[rule.rule_class]) violations.push(`RULE_CLASS ${ruleId} authority_effect does not match ${rule.rule_class}.`);
  if (rule?.rule_class === RAILWAY_AUTHORITY_CLASS) violations.push(`RULE_CLASS ${ruleId} railway_domain_authority is unsupported in bootstrap mode.`);
  const businessCategory = ["domain", "compatibility"].includes(rule?.category);
  if (businessCategory && rule?.rule_class !== RAILWAY_CANDIDATE_CLASS) violations.push(`RULE_CLASS ${ruleId} business category cannot use a generic governance or technical class.`);
  if (!businessCategory && [RAILWAY_CANDIDATE_CLASS, RAILWAY_AUTHORITY_CLASS].includes(rule?.rule_class)) violations.push(`RULE_CLASS ${ruleId} railway class requires a domain or compatibility category.`);
  if (registryKind === "meta") {
    if (!BOOTSTRAP_APPLICABLE_RULE_CLASSES.includes(rule?.rule_class)) violations.push(`RULE_CLASS ${ruleId} meta registry cannot carry railway business authority.`);
    if (rule?.status !== "confirmed") violations.push(`RULE_CLASS ${ruleId} bootstrap governance/technical control must be confirmed by the human baseline.`);
  }
  if (registryKind === "domain") {
    if (rule?.rule_class !== RAILWAY_CANDIDATE_CLASS) violations.push(`RULE_CLASS ${ruleId} Domain registry entries must be railway_domain_candidate.`);
    if (!["proposed", "candidate", "unverified"].includes(rule?.status)) violations.push(`RULE_CLASS ${ruleId} Domain status ${rule?.status ?? "<missing>"} is unsupported.`);
  }
  return violations;
}

export function resolveUniqueRule(records, ruleId) {
  const matches = (records ?? []).filter((item) => item.rule_id === ruleId);
  const violations = matches.length === 1 ? [] : [`RULE_RESOLUTION ${ruleId ?? "<missing>"} matched ${matches.length}; exactly one is required.`];
  return { ok: violations.length === 0, rule: violations.length === 0 ? Object.freeze({ ...matches[0] }) : null, match_count: matches.length, violations };
}

export function validateTaskRuleSelection({ blueprint, records }) {
  const violations = [];
  const resolved_applicable_rules = [];
  const resolved_candidate_rules = [];
  for (const ruleId of blueprint?.applicable_rules ?? []) {
    const resolved = resolveUniqueRule(records, ruleId);
    violations.push(...resolved.violations);
    if (!resolved.ok) continue;
    const rule = resolved.rule;
    if (!BOOTSTRAP_APPLICABLE_RULE_CLASSES.includes(rule.rule_class) || rule.status !== "confirmed") violations.push(`RULE_CLASS ${ruleId} cannot be an applicable bootstrap control.`);
    else resolved_applicable_rules.push({ rule_id: ruleId, rule_class: rule.rule_class, authority_effect: rule.authority_effect });
  }
  for (const ruleId of blueprint?.candidate_rules ?? []) {
    const resolved = resolveUniqueRule(records, ruleId);
    violations.push(...resolved.violations);
    if (!resolved.ok) continue;
    const rule = resolved.rule;
    if (rule.registry !== "domain" || rule.rule_class !== RAILWAY_CANDIDATE_CLASS || !["proposed", "candidate", "unverified"].includes(rule.status)) violations.push(`RULE_CLASS ${ruleId} is not a proposed-only railway Domain candidate.`);
    else resolved_candidate_rules.push({ rule_id: ruleId, rule_class: rule.rule_class, authority_effect: rule.authority_effect });
  }
  return { violations, resolved_applicable_rules, resolved_candidate_rules };
}
