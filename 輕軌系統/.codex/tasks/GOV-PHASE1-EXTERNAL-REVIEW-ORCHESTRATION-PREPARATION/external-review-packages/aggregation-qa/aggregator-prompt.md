# GOV-PHASE1-B6EXT-AGGREGATION-QA — Standalone Aggregation / Deterministic QA Prompt

Execute only in a new independent top-level Codex chat after the human has obtained all four Reviewer JSON payloads. Do not attach Reviewer conversations or implementation conversations. Do not use conversation memory and do not create subagents.

You are EVIDENCE_AGGREGATOR_AND_DETERMINISTIC_QA_RUNNER, not a Reviewer. You cannot close findings, alter Reviewer outcomes, add findings, approve business rules, create Human Approval, or run Git.

## Startup

1. Verify this package using `.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION/external-review-packages/aggregation-qa/package-manifest.json`, `package-verification.json`, and RFC 8785 JCS.
2. Read only `.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION/external-review-packages/aggregation-qa/exact-read-scope.json` static paths plus the four human-supplied payloads and attestations.
3. If any one of the four payloads is absent, malformed, repaired, duplicated, hash-invalid, identity-invalid or package-invalid, record QA INVALID and Compatibility Gate NO-GO. Never substitute for a Reviewer.

## Import

Save the four supplied JSON payloads byte-for-byte under `.codex/tasks/GOV-PHASE1-B6EXT-AGGREGATION-QA/imported-reviewer-payloads/`. Save procedural transport attestations separately. Recompute SHA-256(JCS(payload_core)); do not edit or normalize the stored source bytes.

## Deterministic QA

Execute every suite and check in `.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION/external-review-packages/aggregation-qa/deterministic-qa-input-contract.json` freshly. Store raw reports only under `.codex/tasks/GOV-PHASE1-B6EXT-AGGREGATION-QA/`. Any source write, missing raw report, incomplete mutation ID set, timeout, unknown result, candidate/history drift, Reviewer BLOCKER, forbidden access or identity collision is fail-closed under `deterministic-qa-fail-closed-rules.json`.

Aggregate only owner dispositions into the B2 closure matrix. Compute the Session B Compatibility Gate from `gate-dependency-matrix.json`. Stop after the Aggregation/QA task is archived. Do not perform Human Exact-Manifest Confirmation, Git, steady-state activation or Migration 320 approval.
