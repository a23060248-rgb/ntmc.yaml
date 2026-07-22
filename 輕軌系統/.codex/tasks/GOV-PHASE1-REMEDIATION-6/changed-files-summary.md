# Changed Files Summary

The SHA256 baseline comparison records governance-source changes only. The R6 Task directory is excluded from both baselines.

## Added (7)

- `.codex/blueprints/schemas/bootstrap-candidate-record.schema.json`
- `.codex/governance/bootstrap-trust-policy.yaml`
- `.codex/scripts/generate-bootstrap-candidate.mjs`
- `.codex/scripts/generate-bootstrap-scan-report.mjs`
- `.codex/scripts/lib/governance/rule-class.mjs`
- `.codex/tests/run-bootstrap-mutation-tests.mjs`
- `.codex/tests/run-bootstrap-production-integration.mjs`

## Removed (6)

- `.codex/blueprints/schemas/candidate-snapshot.schema.json`
- `.codex/blueprints/schemas/staged-candidate.schema.json`
- `.codex/scripts/generate-candidate-snapshot.mjs`
- `.codex/scripts/validate-staged-candidate.mjs`
- `.codex/tests/run-phase15-mutation-tests.mjs`
- `.codex/tests/run-phase15-production-integration.mjs`

## Modified (37)

- `AGENTS.md`
- `.codex/blueprints/schemas/classification.schema.json`
- `.codex/blueprints/schemas/human-approval.schema.json`
- `.codex/blueprints/schemas/implementation-handoff.schema.json`
- `.codex/blueprints/schemas/rule.schema.json`
- `.codex/blueprints/schemas/security-evidence.schema.json`
- `.codex/domain/index.yaml`
- `.codex/governance/agent-path-policy.yaml`
- `.codex/governance/evidence-scope-policy.yaml`
- `.codex/governance/gate-policy.yaml`
- `.codex/governance/governance-commit-manifest.yaml`
- `.codex/governance/lifecycle-events.json`
- `.codex/governance/phase-policy.yaml`
- `.codex/governance/phase-status.json`
- `.codex/governance/residual-risks.yaml`
- `.codex/governance/scan-contract.yaml`
- `.codex/meta-rules/confidentiality.yaml`
- `.codex/meta-rules/database.yaml`
- `.codex/meta-rules/evidence.yaml`
- `.codex/meta-rules/global.yaml`
- `.codex/meta-rules/review-independence.yaml`
- `.codex/meta-rules/security.yaml`
- `.codex/scripts/create-task.mjs`
- `.codex/scripts/lib/governance-commit-manifest.mjs`
- `.codex/scripts/lib/governance-controls.mjs`
- `.codex/scripts/lib/governance/fixture-report.mjs`
- `.codex/scripts/lib/governance/lifecycle-projection.mjs`
- `.codex/scripts/lib/governance/proposed-domain-rules.mjs`
- `.codex/scripts/lib/governance/scanner-pipeline.mjs`
- `.codex/scripts/lib/governance/scope-lattice.mjs`
- `.codex/scripts/lib/governance/typed-proof.mjs`
- `.codex/scripts/validate-change-scope.mjs`
- `.codex/scripts/validate-task.mjs`
- `.codex/templates/implementation-handoff.yaml`
- `.codex/templates/security-evidence.yaml`
- `.codex/tests/fixture-suite-manifest.json`
- `.codex/tests/run-governance-fixtures.mjs`

The authoritative machine-readable detail is `baseline-comparison.json`. Frozen history and Migration 320 have no additions, removals, or modifications.
