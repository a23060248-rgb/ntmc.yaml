# Phase 1 Minimum Trustworthy Control Decision

Status: `PROPOSAL ONLY / HUMAN DECISION REQUIRED`

## Recommended boundary

Adopt a **bootstrap-converged Phase 1**:

- implement the controls whose absence creates a scope bypass, false clean claim, or business-authority path;
- treat self-issued candidate receipts as evidence-only during bootstrap;
- remove STAGED_EXACT execution authority and dynamic generic meta-rule applicability from bootstrap;
- keep proposed Railway Domain Rules evidence-only and permanently `NO-GO` in Phase 1;
- keep lifecycle informational under a narrower snapshot contract;
- make the first stage/commit an explicitly human bootstrap operation;
- activate typed live staged proof only after a trusted governance base commit exists.

No blocking A5 finding is accepted as residual risk.

## Capability decisions

| Capability | Primary decision | Bootstrap boundary | Steady-state boundary | A5 implication |
|---|---|---|---|---|
| Scope lattice | `IMPLEMENT` | Require one exact actor; both Task handoff and changed-file CLI consume the actor's six-source intersection | Same invariant, bound to trusted base policy and current change set | Required to close A5-CODE-BLOCKER-001 |
| Role policy | `IMPLEMENT` | Role Policy and unique Agent Assignment are mandatory constraints; missing actor is fail-closed. Policy is procedural, not OS isolation | Same, with actor/assignment identity bound to the Task and proof receipt | Required to close the consumer bypass; OS isolation remains a separate residual risk |
| Workspace candidate proof | `REMOVE_FROM_BOOTSTRAP` | May remain as an evidence-only checksum receipt; cannot authorize review or staging by itself | Reintroduce as a typed receipt emitted by validator bytes selected from a trusted base commit | Avoids claiming self-issued producer provenance during the first commit |
| STAGED_EXACT proof | `REMOVE_FROM_BOOTSTRAP` | Human independently checks and performs first stage/commit; no self-issued execution Gate | Reintroduce only as same-execution live index validation bound to base commit, validator blob, staged paths/blobs, nonce, and final human approval | Removes the bootstrap half of A5-CODE-BLOCKER-002; implementation still required before steady-state execution GO |
| Scanner canonicalization | `IMPLEMENT` | Malformed supported encoding must not reduce scanning; decode valid segments or emit a blocking malformed-encoding class | Trusted-base scanner produces a manifest/contract-bound report | Required to close A5-SEC-HIGH-001 |
| Entropy detection | `NARROW_CONTRACT` | Finding-only heuristic over explicitly enumerated alphabets/length/entropy; never a clean-secret claim | May expand only with production matrix and safe negatives | SEC-A4-003 was closed; keep its bounded wording and do not make it a trust anchor |
| Fixture mutation testing | `IMPLEMENT` | Every blocking invariant has a production-path exploit and a production-consumer mutation; fixture totals are diagnostic only | Same tests protect changes to the trusted base | Required to close A5-CODE-HIGH-003 and A5-SEC-HIGH-002 |
| Generic meta-rules | `REMOVE_FROM_BOOTSTRAP` | No generic Rule may enter Blueprint `applicable_rules`; retain selected semantics in AGENTS.md/Phase Policy as static controls | Re-entry requires typed `rule_class`, namespace-independent validation, and allowed-use matrix | Safest closure path for A5-DOMAIN-META-REGISTRY-BYPASS-001 |
| Proposed Domain Rules | `NARROW_CONTRACT` | Evidence-only incomplete registry; candidate rules only; any reference forces `NEEDS_HUMAN_DECISION/NO-GO`; no confirmation capability | Later phase may add authority only through a separately designed human Domain approval model | Preserves Migration 320 NO-GO without treating lack of confirmed rules as framework failure |
| Lifecycle projection | `NARROW_CONTRACT` | Possibly stale informational snapshot projection; no transition-history completeness claim and never a Gate input | A later phase may implement a full predecessor automaton | Safely resolves the claim side of A5-CODE-MEDIUM-004; it is not a Gate blocker today |
| Human approval | `NARROW_CONTRACT` | External human decision is the authority; Task YAML is only a projection referencing exact hashes. No cryptographic identity claim | May later use signed/protected approval, but must remain external to the Task it authorizes | Prevents approval-shaped Task data from becoming a trust anchor |
| Reviewer independence | `NARROW_CONTRACT` | Fresh read-only context, unique run/session IDs, raw outcome preservation, exact candidate binding, and human task provenance; explicitly procedural | Add durable retention or cryptographic attestation only if actually deployed | Retain as the primary independent bootstrap check without overstating identity proof |

## Residual risks that may be deferred

The following may remain explicit residual risks because they do not, under the narrowed contract, independently cause a correct-looking GO:

- procedural rather than cryptographic human/Reviewer identity;
- no OS/container filesystem sandbox;
- external executable, shell, parent override, and residual TOCTOU risk;
- scanner is not DLP and cannot establish global secret absence;
- lifecycle may be stale because it is informational only;
- remote Git protection, signing, CODEOWNERS, and CI enforcement are not established;
- proposed Domain knowledge is incomplete and non-authoritative.

The following may not be residualized:

- role-omitted scope authorization;
- self-issued proof treated as producer authority;
- stored proof plus caller boolean treated as a live index receipt;
- malformed input suppressing an in-contract scanner finding;
- a declared scanner class with no production reachability test;
- generic meta-rule content becoming Railway Domain authority;
- any of the above resulting in incorrect GO or a false clean claim.

## Minimal credible bootstrap capability set

The first candidate should retain only capabilities that can be independently inspected and whose claims are smaller than or equal to their implementation:

1. AGENTS.md and machine-readable Phase Policy locking product/database/Git behavior.
2. Agent role definitions and an actor-mandatory scope validator.
3. Independent read-only Reviewer workflow and BLOCKER-dominant Gate calculation.
4. Exact relative-path manifest and content digests, understood as integrity evidence rather than producer identity.
5. Minimal fail-closed text/binary scanner with explicit bounded contract and human review limitations.
6. Proposed-only incomplete Domain registry with no applicable or confirmed Railway Domain authority.
7. Explicit residual-risk register.
8. Human bootstrap candidate and commit gates.

Candidate/staged typed proof authority, lifecycle automation, advanced scanner breadth, dynamic meta-rule selection, and large fixture infrastructure are optional for the first commit and must not remain as dormant alternative authority paths if removed.

## Controls removable from the first commit

- WORKSPACE_CANDIDATE as a Gate prerequisite. A checksum report may remain outside authority.
- STAGED_EXACT schema, generator/validator, final-execution logic, and generic prerequisite records.
- dynamic `applicable_rules` resolution from `.codex/meta-rules`.
- full lifecycle event automation; retain only explicit human/review state records if desired.
- entropy/header/magic classes not covered by exact production matrix.
- mutation/concurrency infrastructure that is not needed to prove the selected minimal contract; keep only tests that exercise retained production controls.

Removal must include schemas, policies, templates, tests, and consumer branches. Leaving a removed feature in an alternate path preserves the ambiguity.

## Bootstrap and Migration 320 relationship

No Phase 1 scope choice makes Migration 320 executable. Its candidate Rules remain proposed/unverified, its Domain outcome remains `NEEDS_HUMAN_DECISION`, and its evidence hashes prove integrity only. Therefore:

```text
Bootstrap Candidate Review Gate: NO-GO pending a new authorized candidate and review
Bootstrap Human Commit Gate: NO-GO
Steady-State Preparation/Execution: unavailable until a trusted base exists
Migration 320 Execution Gate: NO-GO under every option
```

## Conditions before another formal review

Do not authorize A6 until a human has selected one Remediation 6 option and all of the following are true in a newly frozen candidate:

1. The bootstrap/steady-state Gate model is explicit in policy and schemas.
2. Every retained automatic authority has one production consumer; removed branches and claims are absent.
3. All six blocking A5 constructions fail closed or are impossible because the capability is removed.
4. The production test oracle observes exact semantic outputs and kills consumer-level mutations.
5. Generic meta-rule content cannot create Domain authority in any namespace.
6. The candidate manifest is rebuilt from the selected capability set; no attempt is made to preserve 97 files.
7. A5 outcomes remain immutable and all Gates remain `NO-GO` pending the new review.

This document recommends a future Remediation 6 but does not authorize or create it.
