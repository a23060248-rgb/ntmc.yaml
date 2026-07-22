# Proposed Remediation 5 Scope

Status: **PROPOSAL ONLY — NOT AUTHORIZED, NOT CREATED**

Source: twelve immutable Session A4 formal findings, deduplicated into eleven formal root causes, plus one separately observed lifecycle projection gap.

This document recommends a bounded architecture remediation. It does not change A4, assert that any finding is fixed, authorize Session B, or authorize Git mutation.

## 1. Objective

Replace split schema/policy/helper/production paths with one authoritative validation kernel. The result must make every retained governance claim enforceable through the production validator and make removal or bypass of that enforcement detectable by the test oracle.

The preferred Phase 1 scope is the “minimal credible” option:

- implement scope, unique identity resolution, typed proof, structured approval sensitivity, scanner canonicalization, lifecycle projection, and production-path testing;
- remove Phase 1 waiver satisfaction and confirmed Railway Rule promotion;
- narrow opaque-token and extension/magic scanner claims to implemented behavior;
- keep all gates `NO-GO` until fresh independent A5 review.

## 2. Proposed work packages

### WP1 — Authoritative scope and identity kernel

**Purpose:** close A4-CODE-BLOCKER-001, A4-CODE-BLOCKER-003, A4-CODE-BLOCKER-004, and the common resolver part of A4-DOMAIN-APPROVAL-UNIQUENESS-002.

**Proposed components:**

- `computeEffectiveScope()`
- `resolveUniqueArtifact()`
- `resolveUniqueRequirement()`

**Likely governance files requiring modification:**

- `.codex/scripts/lib/governance-controls.mjs`, or a new single validation-kernel module replacing its overlapping exports;
- `.codex/scripts/validate-task.mjs`;
- `.codex/scripts/validate-change-scope.mjs`;
- task, classification, intent, blueprint, assignment, evidence, and manifest schemas/policies that currently express divergent identity/scope semantics;
- production-path fixture runner and Remediation contract fixtures.

**Required deletions/replacements:**

- caller-local allowed-path reconstruction;
- last-wins requirement `Map` behavior;
- authority lookups using `.find()`/first match;
- duplicated local artifact identity checks that do not cover the referenced collection.

**Acceptance invariants:**

1. Adding a constraint can only preserve or narrow effective scope.
2. A path outside any one mandatory layer is rejected by both Task and change-scope validation.
3. Every authority reference resolves to exactly one object of the expected type and subject.
4. Duplicate requirement or artifact IDs fail independent of input order.
5. Waiver-like evidence fails closed because waiver capability is absent from the preferred Phase 1 scope.

### WP2 — Typed proof and approval semantics

**Purpose:** close A4-CODE-BLOCKER-002 and A4-CODE-HIGH-005.

**Proposed component:** `validateTypedProof()` plus a structured execution-effect classifier.

**Likely governance files requiring modification:**

- `.codex/scripts/validate-task.mjs`;
- `.codex/scripts/validate-staged-candidate.mjs` if STAGED_EXACT remains in scope;
- Candidate Snapshot, STAGED_EXACT, scope validation, preapproval, evidence, classification, and gate schemas/policies;
- candidate/manifest proof producer scripts, if a trusted producer already exists and is retained;
- production E2E tests.

**Required deletions/replacements:**

- generic `PASS` evidence accepted across proof purposes;
- Task-authored producer/status fields treated as authority;
- candidate binding that checks labels/hashes without exact canonical file-set equality;
- trigger-regex-only inference that a Task is not execution-sensitive.

**Acceptance invariants:**

1. Proof types are non-interchangeable.
2. The producer, subject, candidate identity, file set, path/blob digests, purpose, and chronology are jointly verified.
3. A Task cannot mint evidence that authorizes its own candidate or execution.
4. Structured execution effects require the correct human/independent approval regardless of benign free text.
5. Free text can only add a restriction, never remove a structured requirement.

**Scope fallback:** if no trusted proof producer can be defined and independently validated, remove execution GO/STAGED_EXACT authorization from Phase 1 rather than accept self-declared proof.

### WP3 — Scanner contract convergence

**Purpose:** close SEC-A4-001 through SEC-A4-004 without adding disconnected regexes.

**Proposed component:** `canonicalizeScannerInput()` followed by a policy-enumerated classifier registry.

**Likely governance files requiring modification:**

- `.codex/scripts/lib/secret-scanner.mjs`;
- `.codex/policies/secret-scan-policy.yaml` and any schema that declares scanner classes;
- scanner entry points used by candidate/manifest validation;
- scanner fixtures, production scan E2E tests, and policy-to-emitter coverage tests.

**Required deletions/replacements:**

- per-regex assumptions about the input representation;
- scanner positives that call a classifier below the canonicalization boundary;
- general “opaque token” wording broader than the supported alphabets;
- the unimplemented extension-versus-magic mismatch class, unless a complete byte/extension implementation is explicitly chosen.

**Acceptance invariants:**

1. Equivalent raw, JSON-escaped, percent-encoded, and quoted supported representations produce the same security class.
2. Basic authorization and sensitive quoted cookies are recognized after normalization.
3. Supported entropy alphabets are enumerated exactly; unsupported generality is not claimed.
4. Every policy-declared finding class is emitted by at least one reachable production branch, and removing that branch fails the suite.
5. Unapproved binary content remains fail-closed even after removing the broader magic-mismatch claim.
6. Raw/canonical provenance is recorded without echoing the secret value.

### WP4 — Railway Domain Phase 1 boundary

**Purpose:** address A4-DOMAIN-AUTHORITY-BINDING-001 and the Domain consumer of the unique-resolver finding without implying approval of any real maintenance Rule.

**Preferred Phase 1 decision:** remove confirmed-rule promotion and Domain approval authority from the first commit candidate. Retain:

- `registry_type=proposed_rule_registry`;
- `is_complete_domain_knowledge_base=false`;
- `confirmed_rule_count=0`;
- only confirmed rules may enter `applicable_rules`;
- proposed/unverified items remain in `candidate_rules`;
- Migration 320 candidate Rule continues to force `NEEDS_HUMAN_DECISION`/`NO-GO`.

**Likely governance files requiring modification under removal:**

- schemas, policies, examples, fixtures, and manifest entries that claim Phase 1 can validate a confirmed Domain approval;
- `validate-task.mjs` partial Domain approval path, which must not remain as a dormant alternative authority path;
- Domain registry contract wording and applicable-rule derivation.

**Required deletion:** hand-written partial Rule/Approval/Source checks and any proposed-to-confirmed state change path.

**Future re-entry condition:** a later authorized phase may implement `validateDomainApprovalBinding()` with production-loaded schemas, unique Rule/Approval/Source resolution, rule hash/version binding, authoritative Source status, independent human authority, anti-replay chronology, and registry transition checks.

**Migration 320 boundary:** a wrapper may need to consume the new unique resolver or explicit “confirmation capability absent” result. The original Migration 320 evidence, candidate Rule content, test/health reports, and historical artifacts must not be modified. The wrapper must continue to return NO-GO.

### WP5 — Lifecycle as a projection, not a hand-written summary

**Purpose:** correct the separate lifecycle gap in which A4 can be active/complete while `a4_started=false`.

**Proposed component:** `projectLifecycleState()` over validated transition artifacts.

**Likely governance files requiring modification:**

- `.codex/scripts/lib/lifecycle-projection.mjs`;
- `phase-status` and its schema/policy/validator;
- future Remediation 5 and A5 transition artifact templates;
- lifecycle projection tests.

**Required deletions/replacements:**

- fixed A3/Remediation 4 input lists;
- hard-coded A4 booleans;
- projections that exclude the current Task or recognize only fixed Task IDs.

**Acceptance invariants:**

1. Projection is deterministic from transition artifacts and includes the current Task.
2. Unknown future review IDs are handled by typed transition role, not string-specific code.
3. Missing prerequisite, duplicate, contradictory, or regressive transitions fail closed.
4. Every projected field carries source transition provenance.

### WP6 — Test authority and anti-self-assurance

**Purpose:** close A4-CODE-HIGH-006 and ensure WP1–WP5 cannot silently diverge from production.

**Required test layers:**

- property-based scope, uniqueness, canonicalization, and lifecycle tests;
- mutation tests that remove one enforcement edge at a time;
- table-driven proof/category/Domain relationship matrices;
- reference collision and permutation tests;
- canonicalization differential tests;
- production schema-loader enumeration/integration tests;
- end-to-end governance tests through the authoritative CLI/validator;
- adversarial concurrency tests with truncated, forged, and semantically false child reports plus parent recomputation.

**Required oracle changes:**

- assert exact finding class, resolved identity, proof type/issuer/subject, and calculated gate—not only exit code or case count;
- remove any positive fixture that expects Task-self-authored Candidate/STAGED/preapproval proof to pass;
- require helper tests and production integration tests, with no helper result treated as evidence of integration;
- compare declared scanner class inventory to reachable emitted classes;
- demonstrate mutation-kill coverage for the specific A4 bypass families.

## 3. Files and artifacts that are explicitly out of scope

Remediation 5 must not include:

- any product program under `frontend`, `erp-api`, or other product-code roots;
- database design, migration source, seed, runtime test, service startup, or database access;
- rewriting Session A, A2, A3, or A4 Reviewer outcomes/findings;
- modifying original GOV-M320-DRYRUN evidence to make it authoritative;
- an OS sandbox, DLP, antivirus, cryptographic signing infrastructure, or Git remote enforcement claim;
- Git stage, commit, push, branch, worktree, stash, reset, restore, or clean;
- Session B or a governance commit decision.

Child-process, PowerShell/cmd/external executable, parent override, and TOCTOU risks must remain explicitly documented unless a retained Phase 1 contract actually closes them. They must not be represented as OS/runtime isolation.

## 4. Candidate manifest and snapshot impact

The current 103-file manifest is evidence for the pre-convergence A4 candidate only. Any authorized Remediation 5 changes both source content and the declared feature boundary, so the candidate must be rebuilt:

1. decide retained and removed Phase 1 capabilities;
2. remove obsolete schemas/policies/helpers/fixtures instead of leaving dormant parallel paths;
3. add the shared authoritative components and production tests;
4. enumerate the exact new candidate file set;
5. rerun the authorized scanner/validator evidence process;
6. regenerate path and content hashes, Candidate Snapshot, manifest, lifecycle transition, and typed proofs;
7. compare a fresh before/after source baseline during A5.

The exact count cannot be responsibly predicted before a human chooses the feature boundary. Removal of waiver, Domain confirmation, and false scanner claims reduces files/contracts; new shared components and tests add files. Therefore the manifest may increase or decrease and must be rebuilt, not edited to preserve 103.

## 5. Proposed acceptance criteria before A5

A future Remediation 5 should not be handed to formal review unless all criteria below are evidenced:

1. **One path per control:** every retained control has one production implementation and all legacy alternatives are removed.
2. **Production schema inventory:** every retained artifact schema is loaded by the authoritative schema map and consumed by a production validator branch.
3. **Exploit closure:** all twelve A4 reproducible constructions fail closed through the public production entry point with the expected class.
4. **Scope monotonicity:** property and mutation tests prove all six scope layers constrain the same output.
5. **Exact-one authority:** artifact and requirement collision tests are order-independent; first-match mutations fail.
6. **Typed proof:** no generic PASS or Task-self-authored proof can satisfy candidate, scope, preapproval, or execution requirements.
7. **Scanner alignment:** canonicalization differential tests pass; policy class inventory equals reachable emitted classes; removed claims are absent from policy/schema/docs/fixtures.
8. **Domain boundary:** either confirmed-rule support is absent everywhere and candidate rules remain NO-GO, or the complete binding is implemented and independently testable. No partial path is allowed.
9. **Lifecycle accuracy:** the projection represents Remediation 5 and A5 from transitions without fixed IDs.
10. **Oracle strength:** representative scope, resolver, proof, schema-loader, and scanner mutations are killed.
11. **Candidate rebuild:** exact file set, hashes, scan, snapshot, manifest, and typed proofs are newly generated and mutually bound.
12. **Gate preservation:** implementation self-validation remains `NO-GO` pending A5 and never rewrites A4.

Fixture totals such as `50/50` or `54/54` are diagnostic metadata only and are not acceptance criteria.

## 6. Review and authorization sequence

1. Human chooses Option 1, 2, or 3 and explicitly authorizes a bounded Remediation 5.
2. Remediation 5 implements only the chosen contract and produces self-validation evidence while retaining NO-GO.
3. Human verifies the candidate boundary and authorizes a fresh, independent, read-only A5.
4. A5 uses new reviewer run/session identities and immutable before/after baselines.
5. A5—not Remediation 5 and not this consolidation—determines whether blockers remain.
6. Session B and all Git mutation remain unauthorized unless separately authorized after the required gates.

## 7. Stop conditions

Do not start or continue formal review if any of the following is true:

- retained policy or schema describes a class the production validator cannot reach;
- helper and production paths still implement the same control independently;
- any authority lookup remains first-match or order-dependent;
- any proof can be self-declared by the Task it authorizes;
- a positive fixture relies on forged proof/approval semantics;
- the manifest/snapshot still identifies the old 103-file candidate after source changes;
- lifecycle projection excludes the current remediation/review;
- Migration 320 is represented as anything other than NO-GO;
- an A4 outcome or historical evidence was rewritten.

At this consolidation stage, Remediation 5 remains uncreated, A5 remains unauthorized, Session B remains unauthorized, and all gates remain `NO-GO`.

