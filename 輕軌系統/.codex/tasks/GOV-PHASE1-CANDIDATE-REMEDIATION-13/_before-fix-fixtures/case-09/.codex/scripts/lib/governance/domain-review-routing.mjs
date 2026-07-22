const mechanismOutcomes = new Set(["PASS", "PASS_WITH_CONDITIONS", "BLOCKER"]);
const externalOutcomes = new Set(["NEEDS_HUMAN_DECISION", "RESOLVED"]);

export function validateDomainReviewRouting(review) {
  const violations = [];
  if (review?.type !== "railway-domain") return { violations, typed: false, mechanism_outcome: null, external_decisions: [] };
  const typed = review.review_scope === "bootstrap_rule_governance_mechanism";
  if (!typed) return { violations, typed: false, mechanism_outcome: null, external_decisions: [] };
  const mechanism = review.governance_mechanism_outcome;
  if (!mechanismOutcomes.has(mechanism?.outcome)) violations.push("DOMAIN_REVIEW typed governance mechanism outcome is missing or invalid.");
  if (!Array.isArray(mechanism?.findings)) violations.push("DOMAIN_REVIEW typed governance mechanism findings array is required.");
  if (review.outcome !== mechanism?.outcome) violations.push("DOMAIN_REVIEW legacy outcome must equal governance_mechanism_outcome for typed review routing.");
  const decisions = review.external_decisions;
  if (!Array.isArray(decisions)) violations.push("DOMAIN_REVIEW external_decisions array is required.");
  const scopes = new Set();
  for (const decision of decisions ?? []) {
    if (!decision?.decision_scope || scopes.has(decision.decision_scope)) violations.push(`DOMAIN_REVIEW duplicate or missing external decision scope ${decision?.decision_scope ?? "<missing>"}.`);
    scopes.add(decision?.decision_scope);
    if (!externalOutcomes.has(decision?.outcome)) violations.push(`DOMAIN_REVIEW invalid external decision outcome ${decision?.outcome ?? "<missing>"}.`);
    if (decision?.decision_scope === "migration_320" && decision?.affects_gate !== "migration_320_execution") violations.push("DOMAIN_REVIEW Migration 320 decision must affect only migration_320_execution.");
    if (decision?.affects_gate === "bootstrap_candidate_review") violations.push("DOMAIN_REVIEW external business decision cannot affect bootstrap_candidate_review.");
    for (const field of ["decision_owner_role", "decision_question"]) if (typeof decision?.[field] !== "string" || !decision[field].trim()) violations.push(`DOMAIN_REVIEW external decision missing ${field}.`);
  }
  return { violations, typed: true, mechanism_outcome: mechanism?.outcome ?? null, external_decisions: decisions ?? [] };
}

export function routeDomainReview(review) {
  const checked = validateDomainReviewRouting(review);
  const candidate_reasons = [];
  const migration_320_reasons = [];
  if (checked.typed) {
    if (!["PASS", "PASS_WITH_CONDITIONS"].includes(checked.mechanism_outcome)) candidate_reasons.push(`Railway governance mechanism review is ${checked.mechanism_outcome ?? "invalid"}.`);
    const migrationDecision = checked.external_decisions.find((item) => item.decision_scope === "migration_320");
    if (!migrationDecision) migration_320_reasons.push("Migration 320 Domain decision is absent.");
    else if (migrationDecision.outcome !== "RESOLVED") migration_320_reasons.push(`Migration 320 Domain decision is ${migrationDecision.outcome}.`);
  } else if (review?.outcome === "NEEDS_HUMAN_DECISION") {
    migration_320_reasons.push("Migration 320 Domain decision is NEEDS_HUMAN_DECISION.");
  } else if (review?.outcome === "BLOCKER") candidate_reasons.push("Railway governance mechanism review returned BLOCKER.");
  return { ...checked, candidate_reasons, migration_320_reasons };
}
