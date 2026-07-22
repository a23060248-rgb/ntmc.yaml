export const TARGET_GATES = Object.freeze({
  "bootstrap-candidate-review": "bootstrap_candidate_review",
  "bootstrap-human-commit": "bootstrap_human_commit",
  "migration-320-execution": "migration_320_execution"
});

export const GATE_DEPENDENCY_CONTRACT = Object.freeze({
  schema_version: 1,
  matrix_id: "GOV-AUTHORITATIVE-GATE-DEPENDENCIES",
  gates: {
    bootstrap_candidate_review: ["candidate_gate_blockers"],
    bootstrap_human_commit: ["bootstrap_candidate_review", "session_b_pass", "human_exact_manifest_approved", "post_review_baseline_unchanged", "explicit_first_commit_authorization"],
    steady_state_preparation: ["bootstrap_commit_sha", "bootstrap_manifest_sha256", "human_bootstrap_attestation"],
    steady_state_execution: ["steady_state_preparation", "bootstrap_commit_sha", "bootstrap_manifest_sha256", "human_bootstrap_attestation"],
    migration_320_execution: ["migration_320_gate_blockers"]
  },
  forbidden_edges: [
    ["final_commit_approval", "bootstrap_candidate_review"],
    ["session_b_outcome", "bootstrap_candidate_review"],
    ["steady_state_trust_anchor", "bootstrap_candidate_review"],
    ["migration_320_domain_decision", "bootstrap_candidate_review"],
    ["calculated_gate", "bootstrap_candidate_review"],
    ["overall_gate", "bootstrap_candidate_review"],
    ["eligible_to_start_session_b", "bootstrap_candidate_review"]
  ]
});

const allowedInputKeys = new Set(["candidate_gate_blockers", "human_commit", "steady_state_anchor", "migration_320_gate_blockers"]);
const allowedHumanKeys = new Set(["session_b_pass", "human_exact_manifest_approved", "post_review_baseline_unchanged", "explicit_first_commit_authorization"]);
const allowedAnchorKeys = new Set(["bootstrap_commit_sha", "bootstrap_manifest_sha256", "human_bootstrap_attestation"]);
const clean = (items) => [...new Set((items ?? []).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))].sort();
const gate = (status, reason_codes) => Object.freeze({ status, reason_codes: clean(reason_codes) });
const unknownKeys = (value, allowed) => Object.keys(value ?? {}).filter((key) => !allowed.has(key));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)])) : value;

export function validateGateDependencyMatrix(matrix) {
  return JSON.stringify(canonical(matrix)) === JSON.stringify(canonical(GATE_DEPENDENCY_CONTRACT)) ? [] : ["GATE_DEPENDENCY_MATRIX does not exactly match the registered authoritative dependency contract."];
}

export function computeAuthoritativeGateMap(input = {}) {
  const topUnknown = unknownKeys(input, allowedInputKeys);
  const humanUnknown = unknownKeys(input.human_commit, allowedHumanKeys);
  const anchorUnknown = unknownKeys(input.steady_state_anchor, allowedAnchorKeys);
  if (topUnknown.length || humanUnknown.length || anchorUnknown.length) throw new Error(`Unregistered Gate input: ${[...topUnknown, ...humanUnknown, ...anchorUnknown].join(",")}`);

  const candidateBlockers = clean(input.candidate_gate_blockers);
  const candidate = gate(candidateBlockers.length ? "NO-GO" : "GO", candidateBlockers);

  const human = input.human_commit ?? {};
  const humanReasons = [];
  if (candidate.status !== "GO") humanReasons.push("CANDIDATE_REVIEW_NOT_GO");
  if (human.session_b_pass !== true) humanReasons.push("SESSION_B_NOT_PASS");
  if (human.human_exact_manifest_approved !== true) humanReasons.push("HUMAN_EXACT_MANIFEST_NOT_APPROVED");
  if (human.post_review_baseline_unchanged !== true) humanReasons.push("POST_REVIEW_BASELINE_NOT_APPROVED_UNCHANGED");
  if (human.explicit_first_commit_authorization !== true) humanReasons.push("FIRST_COMMIT_AUTHORIZATION_ABSENT");
  const humanCommit = gate(humanReasons.length ? "NO-GO" : "GO", humanReasons);

  const anchor = input.steady_state_anchor ?? {};
  const anchorMissing = [];
  if (!anchor.bootstrap_commit_sha) anchorMissing.push("BOOTSTRAP_COMMIT_SHA_ABSENT");
  if (!anchor.bootstrap_manifest_sha256) anchorMissing.push("BOOTSTRAP_MANIFEST_SHA256_ABSENT");
  if (!anchor.human_bootstrap_attestation) anchorMissing.push("HUMAN_BOOTSTRAP_ATTESTATION_ABSENT");
  const preparation = anchorMissing.length ? gate("DISABLED", anchorMissing) : gate("NO-GO", ["POST_BOOTSTRAP_PREPARATION_POLICY_NOT_AUTHORIZED"]);
  const execution = anchorMissing.length ? gate("DISABLED", anchorMissing) : gate("NO-GO", ["STEADY_STATE_EXECUTION_NOT_ENABLED"]);

  const migrationBlockers = clean(input.migration_320_gate_blockers);
  const migration = gate(migrationBlockers.length ? "NO-GO" : "GO", migrationBlockers);
  return Object.freeze({
    bootstrap_candidate_review: candidate,
    bootstrap_human_commit: humanCommit,
    steady_state_preparation: preparation,
    steady_state_execution: execution,
    migration_320_execution: migration
  });
}

// Compatibility name only; all behavior is delegated to the single authoritative function.
export const routeGovernanceGates = computeAuthoritativeGateMap;

export function projectAuthoritativeGateMap(gateResults) {
  return Object.freeze({
    calculated_gate: gateResults.bootstrap_candidate_review.status,
    overall_gate: gateResults.bootstrap_candidate_review.status,
    bootstrap_candidate_review_gate: gateResults.bootstrap_candidate_review.status,
    eligible_to_start_session_b: gateResults.bootstrap_candidate_review.status === "GO",
    bootstrap_human_commit_gate: gateResults.bootstrap_human_commit.status,
    steady_state_preparation_gate: gateResults.steady_state_preparation.status,
    steady_state_execution_gate: gateResults.steady_state_execution.status,
    migration_320_execution_gate: gateResults.migration_320_execution.status
  });
}

export function resolveTargetGate(targetGate) {
  if (targetGate === undefined || targetGate === null || targetGate === "") return null;
  const resolved = TARGET_GATES[targetGate];
  if (!resolved) throw new Error(`Unsupported --target-gate ${targetGate}.`);
  return resolved;
}

export function exitForGateMap(gateResults, { structural_valid = true, target_gate = null } = {}) {
  if (!structural_valid) return 1;
  if (target_gate) return gateResults[target_gate]?.status === "GO" ? 0 : 2;
  return Object.values(gateResults).every((item) => item.status === "GO") ? 0 : 2;
}
