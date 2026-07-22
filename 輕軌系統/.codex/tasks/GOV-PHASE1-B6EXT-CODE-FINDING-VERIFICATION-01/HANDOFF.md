# Handoff

- Current goal: verify B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001 without modifying candidate or historical inputs.
- Result: VERIFIED_CANDIDATE_PRODUCTION_PATH_DEFECT; candidate_change_required=true; finding remains OPEN.
- What changed: only evidence under .codex/tasks/GOV-PHASE1-B6EXT-CODE-FINDING-VERIFICATION-01/.
- Verification: payload schema/JCS/binding; exact access comparison; 10 authoritative production-path cases; six historical validateTask replays; candidate 103/103 before/after; eight protected Task tree hashes; exact Migration 320 read boundary.
- Known risks: Code R1 payload is formally rejected by the strict package exact-scope rule because launch-mandated startup reads are not included in that package allowlist. This does not negate CASE-04.
- Suggested next step: human may separately authorize GOV-PHASE1-CANDIDATE-REMEDIATION-13 using referenced-evidence validation, followed by a new candidate baseline and entirely regenerated External Reviewer packages.
- Prohibited continuation: do not start other Reviewers, Aggregator, remediation implementation, Git, Human Exact-Manifest Confirmation, Steady-State, or Migration 320 approval from this Task.
