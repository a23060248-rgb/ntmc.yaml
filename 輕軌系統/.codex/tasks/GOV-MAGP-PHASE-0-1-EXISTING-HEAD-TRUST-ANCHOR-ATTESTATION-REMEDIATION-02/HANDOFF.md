# HANDOFF

TASK_ID: GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-02

CANDIDATE_VERDICT: BLOCKER

BLOCKER: IGNORE_EVIDENCE_NOT_VERIFIED must remain fail-closed if the complete production validator observes an inaccessible effective Git ignore source or any unexpected Git diagnostic. This producer statement is non-authoritative; inspect `production-entry-observation.json` and rerun the production entry read-only.

TRUST_ANCHOR_MODEL: EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION

BOUND_HEAD: 22baa18784a081dd8c0d8a3ce177ba00363251de

BOUND_TREE: c6f30a81ff45273aca851126160f2588937d2550

BOUND_BRANCH: codex/precheck-template-maintenance

EXACT_PATH_COUNT: 147

PARTITION: 106 SOURCE_7A_2 + 41 ATTEMPT_1

ASSURANCE: INTERNAL_CONSISTENCY_ONLY

PRODUCER_EVIDENCE_AUTHORITY: NON_AUTHORITATIVE_CANDIDATE_EVIDENCE

ANCHOR_STATUS: PROPOSED_NOT_ADOPTED

GIT_MUTATION: NO

FILES_MODIFIED_OUTSIDE_TASK: 0

## Validation entry

`node scripts/validate-production.mjs`

This no-argument command is the only complete candidate-verdict route. It recomputes product/Git roots, HEAD/branch/commit/tree, all 147 HEAD/index/working-tree bindings, attributes/filter/ignore evidence, dependency/provenance/historical baselines, task manifest and closing-state rebound.

`--skip-task-manifest`, `--discovery`, bare `--fixture`, unknown flags and duplicate modes are usage errors. `--self-test-fixture <exact task-local fixture>` is rejection-only and always exits 2.

## Frozen boundary

HANDOFF and summary are completed before the final self-excluding task artifact manifest. Once the manifest is generated, no bound artifact may be modified.

Human model selection is not Human adoption. Work review is not Human adoption. No stage, commit, push, branch mutation, 8A-0GC or Product Implementation is authorized.

HUMAN_GATE: Work read-only acceptance, then Human Exact Trust Anchor Adoption Decision.
