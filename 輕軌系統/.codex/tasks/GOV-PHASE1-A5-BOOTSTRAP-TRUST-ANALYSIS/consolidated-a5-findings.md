# A5 Finding Consolidation

Status: `READ-ONLY ANALYSIS / NO REMEDIATION AUTHORIZED`

Source of authority: the three immutable formal A5 Reviewer artifacts. This document groups and explains them; it does not change any outcome or assert that a finding is fixed.

## Summary

A5 contains seven formal findings: two `BLOCKER`, four `HIGH`, and one `MEDIUM`. Six findings block the Candidate Governance Review Gate. The lifecycle `MEDIUM` is a non-gating contract/claim mismatch. The seven findings reduce to six root causes because `A5-CODE-HIGH-003` and `A5-SEC-HIGH-002` are different manifestations of the same fixture-oracle authority defect.

| Finding | A4 relationship | Root status | Blocks Candidate Gate |
|---|---|---|---|
| A5-CODE-BLOCKER-001 | A4-CODE-BLOCKER-001 | Same root, not closed | Yes |
| A5-CODE-BLOCKER-002 | A4-CODE-BLOCKER-002 | Same root plus bootstrap provenance problem | Yes |
| A5-CODE-HIGH-003 | A4-CODE-HIGH-006 | Same oracle root, not closed | Yes |
| A5-CODE-MEDIUM-004 | A4 additional lifecycle gap, not one of the twelve formal A4 findings | New successor claim mismatch | No |
| A5-SEC-HIGH-001 | SEC-A4-001 | Same canonicalization root, new composition vector | Yes |
| A5-SEC-HIGH-002 | SEC-A4-004 and A4 fixture-oracle root | Same closure/oracle root | Yes |
| A5-DOMAIN-META-REGISTRY-BYPASS-001 | A4-DOMAIN-AUTHORITY-BINDING-001 | Same incorrect-authority impact through a new namespace path | Yes |

## 1. A5-CODE-BLOCKER-001

```yaml
finding_id: A5-CODE-BLOCKER-001
reviewer: code-reviewer
severity: BLOCKER
title: Default write validation bypasses Role Policy and Agent Assignment
affected_contract: Mandatory six-source effective scope and actor-bound changed-file validation
affected_files_and_lines:
  - .codex/scripts/lib/governance/scope-lattice.mjs:84-102
  - .codex/scripts/lib/governance/scope-lattice.mjs:125-152
  - .codex/scripts/validate-task.mjs:204-215
  - .codex/scripts/validate-change-scope.mjs:45-52
exact_failure_condition: A changed path is allowed by Phase Policy, Intent, Classification, and Blueprint but denied by the applicable Role Policy or Agent Assignment; validate-task checks handoff.changed_files against task-wide scope, or validate-change-scope is called without --role.
minimal_reproduction: Define Task write scope .codex/tasks/GOV-PROBE/**, the sole role assignment .codex/tasks/GOV-PROBE/allowed/**, and changed path .codex/tasks/GOV-PROBE/unassigned.txt; the task-wide consumer returns no error while the role scope returns OUTSIDE_EFFECTIVE_SCOPE.
incorrect_go_or_false_claim_scenario: A Task-authorized but actor-unassigned file is accepted as in scope, so the framework can claim six-source enforcement while enforcing only four sources.
production_path_involved: validateTask() computes all layers, then validates handoff.changed_files with effective_scope.effective_write_paths; validate-change-scope similarly defaults to that task scope unless --role is supplied.
fixture_path_involved: CASE-01 through CASE-10 call computeEffectiveScope directly; no case exercises the public role-omitted consumer with a Task-allowed/assignment-denied concrete path.
why_existing_fixture_passed: The helper correctly computes a per-role intersection, so helper assertions pass even though the consumers select the broader task output.
existing_positive_fixture_encoded_wrong_assumption: true; it assumes calling the shared helper proves every consumer uses role_scopes[actor].effective_write_paths.
root_cause: Actor identity is optional at the consumption boundary. Role Policy and Agent Assignment are not unioned or incorrectly intersected inside the helper; they are bypassed when the consumer chooses the four-layer task scope.
relationship_to_a4_finding: Direct continuation of A4-CODE-BLOCKER-001; closure status remains NOT_CLOSED.
minimum_safe_remediation: Require one exact actor role or derive one unique validated assignment; reject missing, ambiguous, non-writing, or empty actor authority; validate every concrete changed path only against that role's six-layer output in both consumers.
contract_narrowing_option: Declare change-scope as Task-bound only and remove every claim that Role Policy/Assignment authorize writes. This is safe only if Agents have no automated write authority and all writes are human-reviewed; otherwise it removes a required control.
feature_removal_option: Remove automated changed-file authorization from the bootstrap candidate and use a human exact-path review until actor-bound validation is implemented.
blocks_candidate_review_gate: true
```

Clarifications:

- Role Policy is intended as a mandatory constraining layer, not a lower bound, upper-bound-only check, or union. The helper implements intersection.
- Missing `agent_assignments` causes a lattice violation, and an explicitly empty assignment produces an empty role scope. The unsafe case is a present assignment combined with a consumer that never selects a role.
- No A5 evidence demonstrates a parent/child containment bug for the supported grammar. Recursive suffix `/**` is segment-prefix based, ambiguous mid-pattern glob forms are rejected, and the demonstrated bypass does not require glob confusion.
- Both consumers reach the same helper through `validateTask()`. The split occurs after computation, when they select task-wide rather than actor-specific output. No separate legacy helper is needed for the exploit.

## 2. A5-CODE-BLOCKER-002

```yaml
finding_id: A5-CODE-BLOCKER-002
reviewer: code-reviewer
severity: BLOCKER
title: Commit execution can be forged with a caller boolean and generic PASS prerequisites
affected_contract: Non-interchangeable typed proof, live staged-index receipt, approval prerequisite provenance, and commit execution Gate
affected_files_and_lines:
  - .codex/blueprints/schemas/human-approval.schema.json:12-17
  - .codex/scripts/lib/governance/typed-proof.mjs:20-98
  - .codex/scripts/validate-task.mjs:154-162
  - .codex/scripts/validate-task.mjs:380-391
  - .codex/scripts/validate-staged-candidate.mjs:12-32
  - .codex/tests/run-phase15-production-integration.mjs:91-102
exact_failure_condition: Stored WORKSPACE_CANDIDATE and STAGED_EXACT objects satisfy schemas and self-consistent hashes, the programmatic caller passes liveStagedProofValidated=true, and scope_validation/preapproval_gate contain arbitrary distinct evidence_ref strings with status PASS.
minimal_reproduction: Create syntactically valid typed candidate and staged objects with attacker-chosen execution IDs and staged digests, recompute proof_payload_sha256, set both generic prerequisites to PASS, approve final_commit_approval, and call validateTask(...,{liveStagedProofValidated:true}); the Reviewer reproduced structural_errors=0 and calculated_gate=GO without a bound live index receipt.
incorrect_go_or_false_claim_scenario: A Task author can make a self-consistent proof file and generic prerequisite records appear validator-issued; the consumer cannot prove that validate-staged-candidate checked the same live index in the same authorized execution.
production_path_involved: validateProofRef checks schema, constant producer strings, payload consistency, and selected expected fields; final Gate trusts a caller boolean and generic prerequisite status fields. validate-staged-candidate independently recomputes the index, but its result is not consumed as a typed same-execution receipt.
fixture_path_involved: CASE-21 through CASE-30 test type separation and self-consistency; PROD-04 uses obviously invalid proof_type=PASS objects. No positive or negative case supplies valid-looking forged typed proofs plus the live boolean and generic prerequisites.
why_existing_fixture_passed: It rejects a weak forgery but never attempts the stronger construction that satisfies all schema constants and recomputes the unkeyed payload hash.
existing_positive_fixture_encoded_wrong_assumption: true; it treats a constant producer string and ordinary SHA256 over attacker-controlled fields as producer provenance.
root_cause: The system has integrity checks but no trust anchor. producer, execution_id, generated_at, validator_version, staged digests, and proof_payload_sha256 are writable data; the hash detects accidental alteration only when the expected subject is independently trusted.
relationship_to_a4_finding: Direct continuation of A4-CODE-BLOCKER-002; typed roles were added, but producer authenticity, typed scope/preapproval receipts, and live same-execution index binding remain NOT_CLOSED.
minimum_safe_remediation: Separate bootstrap from steady state. In steady state, execute the proof consumer from an anchored governance commit, bind base commit and validator blob/version, recompute the current staged path/blob set in the same process, emit a non-replay execution receipt, and replace generic prerequisites with distinct typed receipts resolved exactly once.
contract_narrowing_option: Treat WORKSPACE_CANDIDATE as evidence-only internal consistency, not authority, and remove STAGED_EXACT/self-issued proof from the bootstrap Gate. Human exact staging and approval become the bootstrap authority.
feature_removal_option: Remove commit-execution GO from Phase 1. Phase 1 may calculate review NO-GO/GO readiness but may never authorize stage or commit.
blocks_candidate_review_gate: true
```

Candidate and staged proof types are not presently interchangeable at the schema level. The defect is deeper: both can be minted in the same untrusted workspace, and the Gate does not possess an external fact that distinguishes tool output from Task-authored output.

## 3. A5-CODE-HIGH-003

```yaml
finding_id: A5-CODE-HIGH-003
reviewer: code-reviewer
severity: HIGH
title: Green regression and mutation suites do not cover the surviving production bypasses
affected_contract: Fixture authority, production-path integration, mutation adequacy, and semantic oracle completeness
affected_files_and_lines:
  - .codex/tests/run-governance-fixtures.mjs:24-45
  - .codex/tests/run-governance-fixtures.mjs:62-111
  - .codex/tests/run-phase15-mutation-tests.mjs:7-61
  - .codex/tests/run-phase15-production-integration.mjs:69-110
exact_failure_condition: The 50 fixtures, seven mutations, and five production cases all pass while a role-omitted scope consumer accepts an unassigned path and valid-looking typed proof plus caller boolean yields GO.
minimal_reproduction: Run the filed suites, then run the two A5 Code constructions against the same production exports; observe 50/50, 7/7, and 5/5 followed by one authorization bypass and one incorrect GO.
incorrect_go_or_false_claim_scenario: Test totals are treated as proof that every declared production layer fails closed even though the exploit families are absent from the oracle.
production_path_involved: The production integration runner calls validateTask, but its five cases do not include the role-default or forged-live-receipt paths. Mutation tests change production modules but import isolated mutated helpers rather than drive the full validator/Gate.
fixture_path_involved: CASE-01..10, CASE-21..30, MUT-01, MUT-03, PROD-01, and PROD-04.
why_existing_fixture_passed: Assertions cover selected helper properties, structural status, gate, exit code, and error substring. They do not assert actor resolution, proof trust anchor, resolved proof source, live receipt subject, or the exact A5 constructions.
existing_positive_fixture_encoded_wrong_assumption: true; a helper mutation killed by a helper oracle is treated as evidence that the public consumer is protected, and rejecting an obviously generic PASS proof is treated as proof against all self-issued typed proofs.
root_cause: Fixture success is self-referential. The suite enumerates cases chosen from the implementation's intended design rather than an independent set of externally stated security invariants and exploit constructions.
relationship_to_a4_finding: Direct continuation of A4-CODE-HIGH-006; it also shares a deduplicated oracle root with A5-SEC-HIGH-002.
minimum_safe_remediation: Add exact production-path exploit tests and production-consumer mutations for every A5 blocker; assert finding class, resolved identity, proof type/source/subject, calculated Gate, structural status, and exit code.
contract_narrowing_option: Stop calling helper-level and case-count evidence authoritative; describe it only as unit/regression diagnostics until full production invariants exist.
feature_removal_option: Remove any Gate capability whose critical invariant lacks a production-path exploit test and a mutation that proves enforcement reachability.
blocks_candidate_review_gate: true
```

## 4. A5-CODE-MEDIUM-004

```yaml
finding_id: A5-CODE-MEDIUM-004
reviewer: code-reviewer
severity: MEDIUM
title: Lifecycle is safely informational but its transition-validation claim is broader than production behavior
affected_contract: Deterministic informational lifecycle projection and claimed transition automaton
affected_files_and_lines:
  - .codex/scripts/lib/governance/lifecycle-projection.mjs:10-31
  - .codex/scripts/lib/governance/lifecycle-projection.mjs:34-74
  - .codex/governance/lifecycle-events.json:6-24
  - .codex/governance/phase-status.json:3-7
  - .codex/tasks/GOV-PHASE1-REMEDIATION-5/six-core-contracts.json:57-63
exact_failure_condition: A Task's first event is COMPLETED or ARCHIVED without STARTED; the validator checks ordering only between two or more events and accepts the standalone terminal event.
minimal_reproduction: Project an event log containing only a remediation COMPLETED event or a review ARCHIVED event; observe no violation and a completed-state projection.
incorrect_go_or_false_claim_scenario: No current GO is possible because phase-status declares authority=informational and used_as_gate_input=false. The incorrect claim is that completion/archive without start fails closed.
production_path_involved: build/validate phase-status through projectLifecycleState; it is explicitly excluded from Gate calculation.
fixture_path_involved: CASE-48 constructs standalone COMPLETED and ARCHIVED events as valid input, while the Remediation 5 contract claims missing predecessors fail closed.
why_existing_fixture_passed: The fixture and implementation agree on snapshot-event semantics; the filed contract describes a stricter transition automaton that neither implements.
existing_positive_fixture_encoded_wrong_assumption: true; CASE-48 makes a standalone terminal event valid while documentation claims it is invalid.
root_cause: Transition snapshots and transition-history events are conflated. The data model lacks an explicit event mode or predecessor requirement.
relationship_to_a4_finding: Successor to the separate A4 lifecycle gap, not a continuation of one of A4's twelve formal findings. Fixed Task-ID projection was removed, but a new contract/implementation mismatch remains.
minimum_safe_remediation: Either implement a typed predecessor/state automaton or narrow the contract to accepted snapshot events. Preserve informational authority and exclusion from every Gate input.
contract_narrowing_option: Recommended for bootstrap: lifecycle is a possibly stale informational projection; standalone terminal snapshots are allowed; no transition-history completeness is claimed.
feature_removal_option: Remove lifecycle projection from the bootstrap candidate and retain Gate state only in explicit human/review records.
blocks_candidate_review_gate: false
```

## 5. A5-SEC-HIGH-001

```yaml
finding_id: A5-SEC-HIGH-001
reviewer: security-reviewer
severity: HIGH
title: Malformed percent encoding suppresses a valid decoded scanner finding
affected_contract: Bounded URL canonicalization and no-findings-within-declared-contract claim
affected_files_and_lines:
  - .codex/scripts/lib/governance/scanner-pipeline.mjs:57-80
  - .codex/scripts/lib/governance/scanner-pipeline.mjs:73-75
  - .codex/scripts/validate-task.mjs:88-111
exact_failure_condition: One canonical view contains a malformed percent sequence anywhere and a separate valid one-pass percent-encoded credential pattern. decodeURIComponent processes the whole view, throws, and catch/break abandons all decoding for that view.
minimal_reproduction: Call scanCanonicalContent(canonicalizeScannerInput("bad%ZZ " + encodeURIComponent(SYNTHETIC_CREDENTIAL_URI)),"probe.txt"); observe no CREDENTIAL_URI finding.
incorrect_go_or_false_claim_scenario: A manifest-included governance text adds an unrelated malformed sequence to conceal a supported encoded credential while security evidence claims no finding within the declared contract.
production_path_involved: validateTask -> scanGovernanceCommit -> scanText -> canonicalizeScannerInput -> scanCanonicalContent.
fixture_path_involved: CASE-32 tests a well-formed double-encoded credential; CASE-41 tests only a decode-depth bound. Neither composes malformed and valid encodings in one production-scanned artifact.
why_existing_fixture_passed: Canonicalization works for isolated well-formed values. The whole-string failure behavior is not exercised.
existing_positive_fixture_encoded_wrong_assumption: true; it assumes decode correctness is compositional across unrelated substrings.
root_cause: Whole-view canonicalization has an all-or-nothing decoder and silently converts malformed input into less scanning rather than a fail-closed finding.
relationship_to_a4_finding: SEC-A4-001 remains NOT_CLOSED. The original Unicode vector was fixed, but the same unified-canonicalization obligation fails under a new composition vector.
minimum_safe_remediation: Decode valid percent segments with bounded behavior while retaining the raw view, or emit a stable blocking malformed-encoding finding and continue other canonical views. Add manifest-bound positive, adjacent-malformed, and safe-negative cases.
contract_narrowing_option: Only safe if every artifact containing malformed percent syntax is deterministically rejected as outside the supported contract. Silent omission is not a valid narrowing.
feature_removal_option: Remove URL-decoded scanning and its clean claim from bootstrap; reject percent-bearing candidate text or require human inspection until implemented.
blocks_candidate_review_gate: true
```

The failure is in URL decode and the full manifest-bound invocation pipeline. It is not a Unicode-normalization, header-parser, or entropy-detector defect.

## 6. A5-SEC-HIGH-002

```yaml
finding_id: A5-SEC-HIGH-002
reviewer: security-reviewer
severity: HIGH
title: Filed scanner fixture oracle does not enforce the complete declared header and binary matrix
affected_contract: Scanner class reachability, exact declared inventory, and regression evidence authority
affected_files_and_lines:
  - .codex/tests/fixture-suite-manifest.json:39-50
  - .codex/tests/run-governance-fixtures.mjs:78-93
  - .codex/scripts/lib/governance/scanner-pipeline.mjs:33-43
  - .codex/scripts/lib/governance/scanner-pipeline.mjs:123-153
exact_failure_condition: The formal suite passes without executing every declared binary signature, correct-extension safe negative, mismatch positive, Set-Cookie/session/token family, and adjacent safe negative through a manifest-bound production scan.
minimal_reproduction: Remove or disable one uncovered signature/header emitter in a transient production module and run the filed 50 cases; CASE-40 still sees the hard-coded class in the declared set and the suite can remain green.
incorrect_go_or_false_claim_scenario: A later regression deletes a declared emitter while the authoritative fixture report remains PASS and security evidence continues claiming the exact contract ran cleanly.
production_path_involved: Production scanner emitters exist, but formal cases predominantly call canonicalizeScannerInput/scanCanonicalContent/scanBinaryContent directly; they do not build a manifest artifact and require validateTask to emit the exact class.
fixture_path_involved: CASE-31 through CASE-40, especially one PDF mismatch positive and declared-set equality.
why_existing_fixture_passed: CASE-40 compares policy inventory with hard-coded implementation inventory, not reachable emitter branches. One binary mismatch is treated as representative of nine signatures and extension combinations.
existing_positive_fixture_encoded_wrong_assumption: true; class membership is assumed to prove branch reachability and one representative is assumed to prove the matrix.
root_cause: The oracle checks declarations and selected helpers rather than production reachability for each contract cell.
relationship_to_a4_finding: SEC-A4-004 remains NOT_CLOSED and this finding shares the fixture-authority root with A5-CODE-HIGH-003.
minimum_safe_remediation: Generate a table-driven contract matrix and execute every cell through the manifest-bound production validator; add classifier-removal mutations and require exact finding classes and safe negatives.
contract_narrowing_option: Reduce the declared inventory to the cells actually locked by production tests, while keeping unapproved binary rejection as the minimal control.
feature_removal_option: Remove advanced header/entropy/magic classification from bootstrap; retain only a minimal byte/text reject list with explicit human review.
blocks_candidate_review_gate: true
```

## 7. A5-DOMAIN-META-REGISTRY-BYPASS-001

```yaml
finding_id: A5-DOMAIN-META-REGISTRY-BYPASS-001
reviewer: railway-domain-reviewer
severity: HIGH
title: Generic meta-rule namespace can admit a confirmed Domain Rule without Domain human authority
affected_contract: Proposed-only Domain boundary, authority classification, and Blueprint applicable_rules
affected_files_and_lines:
  - .codex/blueprints/schemas/rule.schema.json:9-10
  - .codex/blueprints/schemas/rule.schema.json:19-24
  - .codex/scripts/validate-task.mjs:118-135
  - .codex/scripts/validate-task.mjs:221-226
  - .codex/scripts/lib/governance/proposed-domain-rules.mjs:25-30
exact_failure_condition: A Rule under .codex/meta-rules has category=domain, status=confirmed, owner/approved_at values, and only report evidence. The generic schema accepts it; the loader labels it registry=meta; task selection rejects proposed IDs from the Domain registry only; the applicable loop accepts confirmed non-domain-registry entries.
minimal_reproduction: Construct the synthetic Rule in memory, validate it with rule.schema.json, annotate registry=meta as the production loader does, put its ID in blueprint.applicable_rules, and evaluate the production selector; observe zero schema/selection errors and accepted_as_applicable=true.
incorrect_go_or_false_claim_scenario: Report, implementation, migration, test, or health evidence is wrapped in a generic confirmed meta-rule carrying a maintenance statement/prohibition/verification and becomes authoritative in a Task without Domain human approval.
production_path_involved: loadRuleRegistry -> generic Rule schema -> validateTaskDomainSelection -> Blueprint applicable_rules loop.
fixture_path_involved: CASE-43 through CASE-47 call validateProposedDomainRegistry only and mutate only proposed-domain-rules.mjs; no cross-namespace category=domain case reaches validateTask.
why_existing_fixture_passed: The tests assume all Domain-category Rules originate in .codex/domain/index.yaml and therefore never exercise directory/category disagreement.
existing_positive_fixture_encoded_wrong_assumption: true; registry location is treated as authority type.
root_cause: Authority is inferred from storage namespace and status string instead of a closed rule_class plus allowed-use matrix. Generic Rule content can express business decisions.
relationship_to_a4_finding: A4-DOMAIN-AUTHORITY-BINDING-001 remains NOT_CLOSED through a new namespace-confusion route. A4-DOMAIN-APPROVAL-UNIQUENESS-002 remains replaced by a narrower contract and is not required for this exploit.
minimum_safe_remediation: Make category/rule_class checks namespace-independent; Phase 1 must reject every railway_domain_authority Rule and every railway_domain_candidate in applicable_rules, regardless of file location or status. Generic meta-rules may authorize governance/tool constraints only.
contract_narrowing_option: Remove dynamic meta-rule applicability from Phase 1 and treat retained meta-rule files as static human-reviewed policy text with no ability to create business authority.
feature_removal_option: Exclude generic meta-rules from the bootstrap manifest and encode the minimal governance constraints directly in AGENTS.md/Phase Policy until typed classes exist.
blocks_candidate_review_gate: true
```

## Root-cause consolidation

1. **Actor authority selection:** one helper computes role scope, but consumers make actor selection optional.
2. **Proof trust anchor:** schemas and unkeyed hashes prove internal consistency, not who produced the bytes or which live state was checked.
3. **Fixture oracle authority:** A5-CODE-HIGH-003 and A5-SEC-HIGH-002 share this root; case counts and helper assertions are substituted for independent production invariants.
4. **Lifecycle claim model:** snapshot events and transition history are not distinguished; this is non-gating while lifecycle remains informational.
5. **Scanner failure composition:** malformed input reduces canonical views without a fail-closed result.
6. **Rule authority classification:** namespace/status substitutes for a closed semantic class and allowed-use matrix.

No blocking finding qualifies as `DEFER_AS_RESIDUAL_RISK`. Deferral is safe only for limitations outside the retained contract that cannot cause scope bypass, forged proof authority, false clean scan, business authority, or incorrect GO.
