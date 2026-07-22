# GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01 Handoff

## Current goal

Repair external Reviewer launch bootstrap without launching a Reviewer or changing the 103-file candidate.

## Result

READY_FOR_HUMAN_TO_RELAUNCH_EXTERNAL_CODE_REVIEW_R1

## What changed

Added only .codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01/**: repository-root binding, four absolute-path launch envelopes, four Reviewer prompts v2, a schema-valid embedded Startup Blocker template, Attempt 1 incident/disposition records, 20 fail-closed tests, protected baseline bindings, and readiness evidence.

## Checks

- Repository root identity: PASS
- Launch envelope JCS/SHA-256: 4/4 PASS
- Startup fallback required fields: PASS
- Startup fallback self-hash: PASS
- Working-directory/protocol cases: 20/20 PASS
- Candidate fixed binding: unchanged
- External preparation fixed binding: unchanged
- Git/services/database/seeds/migrations/product operations: not used

## Known risks

Reviewer independence remains procedural. No Reviewer result exists yet, no B2 finding is closed, and Aggregation is unauthorized.

## Suggested next step

A human may copy only reviewer-prompts-v2/code-reviewer-prompt-v2.md into one new top-level Codex chat. Do not start Security, Railway, Compatibility, or Aggregation until the formal Code R1 payload is returned and independently accepted.
