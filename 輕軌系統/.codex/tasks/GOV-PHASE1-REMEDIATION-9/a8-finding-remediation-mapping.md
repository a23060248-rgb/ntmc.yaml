# A8 finding remediation mapping

This is implementation evidence only. It does not modify A8 outcomes and does not declare either finding closed.

## A8-DOMAIN-REVIEWER-IDENTITY-BINDING-001

- Production control: `.codex/scripts/lib/governance/reviewer-identity-binding.mjs:50`, invoked by `.codex/scripts/validate-task.mjs:409`.
- Structural contracts: `.codex/blueprints/schemas/blueprint.schema.json:16`, `.codex/blueprints/schemas/review-findings.schema.json:27`, `.codex/blueprints/schemas/railway-domain-review.schema.json:7`.
- Canonical profile: `.codex/agents/railway-domain-reviewer.toml` with SHA256 `E79CD3EE7667CB41267FDBAAED7AAE679F0EEC0D4B2B917962B4EFE98BE99A6D`.
- Production negatives: `PROD-REVIEWER-01` through `PROD-REVIEWER-14`, all PASS as rejection oracles.
- Mutation evidence: `MUT-REVIEWER-01` through `MUT-REVIEWER-08`, all killed.
- Assurance boundary: `procedural_role_and_assignment_binding`; not cryptographic or unforgeable identity.

## A8-DOMAIN-FIXTURE-SCHEMA-LOADER-001

- Official call: `.codex/tests/run-governance-fixtures.mjs:16-29` imports and invokes exact production `loadAndCompileGovernanceSchemas()` with manifest binding enabled.
- Typed artifact: `.codex/tests/fixtures/valid-railway-domain-review.json`, validated through the compiled set before CASE-01.
- Report proof: `.codex/tests/run-governance-fixtures.mjs:166` emits `schema_execution` with loader, set, Railway Schema identity/version/hash and compile status.
- Integration negatives: `LOADER-INTEGRATION-02` through `LOADER-INTEGRATION-10` all exit 1 before a reduced fixture total can be reported.
- Source-contract mutation evidence: six alternate, downgraded, fallback, skipped-validation, skipped-hash and false-report mutants all killed.

Fresh independent A9 remains required to decide whether these implementation changes resolve the filed findings.
