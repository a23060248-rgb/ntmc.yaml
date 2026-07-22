import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const load = async (name) => JSON.parse(await readFile(path.join(taskDir, name), "utf8"));
const reviews = {
  code: await load("code-review.json"),
  security: await load("security-review.json"),
  domain: await load("railway-domain-review.json")
};
const assignments = await load("reviewer-assignments.json");
const baseline = await load("baseline-comparison.json");
const rerun = await load("authoritative-rerun-summary.json");
const allowedOutcomes = new Set(["PASS", "PASS_WITH_CONDITIONS", "BLOCKER", "NEEDS_HUMAN_DECISION"]);
const metadataOf = (review) => review.metadata ?? review;
const expected = new Map(assignments.assignments.map((item) => [item.reviewer, item]));
const violations = [];
for (const review of Object.values(reviews)) {
  const meta = metadataOf(review), assignment = expected.get(meta.reviewer);
  if (!assignment) violations.push(`Unexpected reviewer ${meta.reviewer}.`);
  if (meta.formal !== true || meta.did_not_participate_in_implementation !== true) violations.push(`${meta.reviewer} independence metadata invalid.`);
  if (meta.reviewer_run_id !== assignment?.reviewer_run_id || meta.session_id !== assignment?.session_id) violations.push(`${meta.reviewer} run/session assignment mismatch.`);
  if (meta.reviewed_candidate_baseline !== "phase-1.6-bootstrap" || meta.candidate_manifest_file_count !== 81 || meta.candidate_manifest_sha256 !== assignments.candidate_manifest_sha256 || meta.bootstrap_candidate_record_id !== assignments.bootstrap_candidate_record_id) violations.push(`${meta.reviewer} candidate metadata mismatch.`);
  if (!allowedOutcomes.has(review.outcome)) violations.push(`${meta.reviewer} outcome invalid.`);
}
const identities = Object.values(reviews).flatMap((review) => { const meta = metadataOf(review); return [meta.reviewer_run_id, meta.session_id]; });
if (new Set(identities).size !== identities.length || identities.includes(assignments.implementer_session_id)) violations.push("Reviewer identity collision.");
if (violations.length) throw new Error(violations.join(" | "));

const closureEntries = [
  ...reviews.code.a5_closure.map((item) => ({ ...item, original_reviewer: "code-reviewer", original_severity: item.finding_id.includes("BLOCKER") ? "BLOCKER" : item.finding_id.includes("HIGH") ? "HIGH" : "MEDIUM" })),
  ...reviews.security.a5_closure.map((item) => ({ ...item, original_reviewer: "security-reviewer", original_severity: "HIGH" })),
  { ...reviews.domain.a5_closure, original_reviewer: "railway-domain-reviewer", original_severity: "HIGH" }
].map((item) => ({
  finding_id: item.finding_id,
  original_reviewer: item.original_reviewer,
  original_severity: item.original_severity,
  closure_status: item.closure_status,
  evidence: item.evidence,
  production_exploit_retest: item.reproducible_read_only_checks ?? item.reason,
  remaining_risk: item.reason ?? "No mechanism risk recorded by the Reviewer.",
  blocks_bootstrap_candidate_gate: item.closure_status === "NOT_CLOSED"
}));
const closureCounts = Object.fromEntries(["CLOSED", "REPLACED_BY_BOOTSTRAP_BOUNDARY", "NOT_CLOSED"].map((status) => [status, closureEntries.filter((item) => item.closure_status === status).length]));
await writeFile(path.join(taskDir, "a5-finding-closure-matrix.yaml"), `${JSON.stringify({ schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", source: "mechanical-copy-of-formal-reviewer-a5-closure", root_modified_reviewer_outcomes: false, finding_count: closureEntries.length, closure_counts: closureCounts, findings: closureEntries }, null, 2)}\n`, "utf8");

const reviewerOutcomes = [
  { reviewer: "code-reviewer", outcome: reviews.code.outcome, reviewer_run_id: reviews.code.metadata.reviewer_run_id, session_id: reviews.code.metadata.session_id, finding_refs: reviews.code.findings.map((item) => item.finding_id) },
  { reviewer: "security-reviewer", outcome: reviews.security.outcome, reviewer_run_id: reviews.security.metadata.reviewer_run_id, session_id: reviews.security.metadata.session_id, finding_refs: reviews.security.findings.map((item) => item.finding_id) },
  { reviewer: "railway-domain-reviewer", outcome: reviews.domain.outcome, reviewer_run_id: reviews.domain.reviewer_run_id, session_id: reviews.domain.session_id, finding_refs: reviews.domain.findings.map((item) => item.finding_id) }
];
const overallOutcome = reviewerOutcomes.every((item) => item.outcome === "PASS") ? "PASS" : reviewerOutcomes.some((item) => item.outcome === "BLOCKER") ? "BLOCKER" : "NEEDS_HUMAN_DECISION";
const allA5ClosedOrReplaced = closureEntries.every((item) => ["CLOSED", "REPLACED_BY_BOOTSTRAP_BOUNDARY"].includes(item.closure_status));
const candidateGate = overallOutcome === "PASS" && allA5ClosedOrReplaced && baseline.all_reviewed_sources_identical && rerun.overall_pass ? "GO" : "NO-GO";
const eligibleSessionB = candidateGate === "GO";
const allFindings = [...reviews.code.findings, ...reviews.security.findings, ...reviews.domain.findings];
const severityCounts = {};
for (const finding of allFindings) severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1;

const reviewFindings = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A6",
  review_context: "Fresh independent formal Session A6 review of the exact Phase 1.6 bootstrap candidate; outcomes copied without root modification.",
  reviews: reviewerOutcomes.map((item) => ({
    type: item.reviewer === "code-reviewer" ? "code" : item.reviewer === "security-reviewer" ? "security" : "railway-domain",
    reviewer: item.reviewer, formal: true, outcome: item.outcome, reviewer_run_id: item.reviewer_run_id, session_id: item.session_id,
    finding_refs: item.finding_refs.length ? item.finding_refs : [`A6-${item.reviewer.toUpperCase()}-NO-FINDINGS`],
    conditions: [],
    decisions_required: item.reviewer === "railway-domain-reviewer" ? [{ decision_required: "migration-320-domain-rules-remain-proposed", decision_owner_role: "human-domain-owner", decision_question: "Confirm, reject, or retain the proposed Migration 320 candidate Rules before any business approval or execution.", decision_deadline_or_trigger: "Before Migration 320 business approval or execution." }] : []
  })),
  calculated_gate: candidateGate,
  overall_gate: candidateGate,
  blockers: allFindings.filter((item) => item.blocks_bootstrap_candidate_gate === true || item.blocks_a6 === true).map((item) => item.finding_id),
  conditions: []
};
await writeFile(path.join(taskDir, "review-findings.yaml"), `${JSON.stringify(reviewFindings, null, 2)}\n`, "utf8");

const summary = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A6",
  status: "ARCHIVED",
  reviewer_set_outcome: overallOutcome,
  reviewer_outcomes: reviewerOutcomes,
  formal_metadata_valid: true,
  severity_counts: severityCounts,
  a5_finding_count: closureEntries.length,
  a5_closure_counts: closureCounts,
  all_a5_closed_or_replaced: allA5ClosedOrReplaced,
  authoritative_rerun_pass: rerun.overall_pass,
  reviewed_source_baseline_identical: baseline.all_reviewed_sources_identical,
  bootstrap_candidate_review_gate: candidateGate,
  eligible_to_start_session_b: eligibleSessionB,
  bootstrap_human_commit_gate: "NO-GO",
  steady_state_preparation_gate: "NO-GO",
  steady_state_execution_gate: "NO-GO",
  migration_320_execution_gate: "NO-GO",
  session_b_started: false,
  git_mutation_performed: false,
  root_modified_reviewer_outcomes: false,
  conclusion: candidateGate === "GO" ? "A6 Reviewer criteria passed; a separate human authorization would still be required to start Session B." : "A6 Reviewer criteria did not pass; Session B is not eligible or authorized."
};
await writeFile(path.join(taskDir, "session-a6-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`A6_AGGREGATE outcome=${overallOutcome} gate=${candidateGate} session_b_eligible=${eligibleSessionB} a5_closed=${closureCounts.CLOSED} replaced=${closureCounts.REPLACED_BY_BOOTSTRAP_BOUNDARY} not_closed=${closureCounts.NOT_CLOSED}`);
