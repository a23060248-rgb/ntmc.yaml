# Test Oracle Remediation

Status: `DESIGN ONLY / NO TESTS RERUN`

## Current trustworthiness assessment

The current suites are useful but not authoritative for the six blocking A5 invariants.

| Question | Evidence-based answer |
|---|---|
| Does the 50-case suite call production code? | It imports the production helper modules, but most cases call helpers directly. It does not execute the formal schema loader or full `validateTask()` path for scope, proof, scanner, Domain, or lifecycle cases. |
| Does the production integration runner call the formal validator? | Yes. Its five cases call `validateTask()`. However, none reproduces the role-omitted scope path, a schema-valid self-issued typed proof plus live boolean, malformed-percent composition, full scanner matrix, or generic meta-rule Domain bypass. |
| Does the oracle validate more than exit code? | Partly. It records structural errors, Gate, and error substrings. It does not require exact finding class, resolved identity, proof source/trust anchor, live receipt subject, or scanner contract cell. |
| Are proof positives independently trustworthy? | No. The tests use the same helper to create and validate proofs; constant producer strings and recomputed hashes are assumed to be provenance. |
| Do mutation tests target production modules? | They edit copied production modules, but then import the mutated helper directly. They do not drive the mutated public validator/Gate, so consumer-selection defects can survive. |
| Is scanner coverage manifest-bound? | The formal scanner cases call canonicalizer/classifier helpers on `probe.txt`; they do not require an exact manifest artifact to make the production validator emit the class. |
| Does CASE-40 prove emitter reachability? | No. It compares a policy set with hard-coded implementation sets. A declared class can remain in those sets even if its actual emitter branch is unreachable or removed. |
| Does concurrency reject malformed reports? | It rejects truncation, duplicate IDs, missing provenance strings, and a tampered suite hash. |
| Does the parent recompute child semantics? | No. A syntactically complete malicious child can assert `pass=true`, supply nonempty invariant/entrypoint strings and a 64-hex artifact hash, and the parent does not recompute the case result or hash subject. Concurrency proves isolation/report shape, not semantic truth. |

## Required test architecture before A6

### Layer 1 — Independent invariant catalog

Create a human-reviewed catalog of security/governance invariants that is not generated from the implementation's emitter registry. Each invariant defines:

- exploit input or state construction;
- public production entry point;
- exact expected structural status;
- exact calculated Gate;
- exact process exit code;
- stable finding/error class;
- resolved identity and authority subject, where relevant;
- required proof type, source, base anchor, and purpose;
- manifest/scan contract version binding.

The implementation may consume this catalog, but it may not rewrite expected results during the test run.

### Layer 2 — Helper/property tests

Retain property and table tests for:

- scope monotonicity and supported glob containment;
- exact-one artifact/requirement resolution;
- proof field/type separation;
- canonicalization equivalence and safe negatives;
- Domain registry proposed-only invariants;
- lifecycle determinism under the selected snapshot or transition contract.

These tests diagnose modules; they are never evidence that a public Gate consumes them correctly.

### Layer 3 — Schema-loader integration

For every retained artifact/proof/rule class:

1. enumerate the schema in an independent expected list;
2. create valid and invalid transient artifacts;
3. invoke the production schema loader through `validateTask()`;
4. assert the exact schema/finding class;
5. mutate the loader map to omit the schema and require test failure.

### Layer 4 — Production-path exploit tests

Every A5 finding must be reproduced through the public production entry point in a transient governance-only workspace. The transient manifest may be rebuilt after a mutation so the semantic path, not a stale-hash check, decides the case.

| A5 finding | Exploit input | Required production path | Expected stable class | Expected Gate / exit |
|---|---|---|---|---|
| A5-CODE-BLOCKER-001 | Task-wide allowed path outside actor assignment; invoke with no/ambiguous actor | `validate-change-scope` and `validateTask` changed-files consumer | `SCOPE_ACTOR_REQUIRED` or `OUTSIDE_ROLE_EFFECTIVE_SCOPE` | `NO-GO` / structural exit 1 |
| A5-CODE-BLOCKER-002 | Schema-valid self-issued candidate/staged objects, recomputed payload hashes, generic PASS prerequisites, forged live boolean | final commit branch of `validateTask` plus live index validator | `UNTRUSTED_PROOF_PRODUCER`, `LIVE_STAGED_RECEIPT_REQUIRED`, or typed-prerequisite mismatch | `NO-GO` / exit 1; never GO |
| A5-CODE-HIGH-003 | Run both preceding exploits against the official production test package | official integration runner and report parent | exact case IDs must fail before remediation and pass only after correct rejection | suite exit 1 if enforcement removed |
| A5-CODE-MEDIUM-004 | standalone COMPLETED/ARCHIVED event | official lifecycle builder/validator | `LIFECYCLE_MISSING_PREDECESSOR` if full automaton retained; no such claim if snapshot contract chosen | lifecycle exit 1, or informational PASS under explicitly narrowed contract; never a Gate input |
| A5-SEC-HIGH-001 | malformed percent token adjacent to a valid supported encoded synthetic credential | manifest file -> `validateTask` -> governance scan -> production canonicalizer | `SCANNER_MALFORMED_ENCODING` or `CREDENTIAL_URI` | `NO-GO` / structural exit 1 |
| A5-SEC-HIGH-002 | every declared header/token/binary/extension cell plus safe negative in an exact manifest | manifest-bound production scan | exact class for every positive; none for every safe negative | positive exit 1; negative follows other Gate inputs |
| A5-DOMAIN-META-REGISTRY-BYPASS-001 | Domain-class confirmed Rule backed by non-authoritative source under each generic namespace, selected as applicable | schema loader -> unique Rule resolver -> class/use validator -> `validateTask` | `RULE_CLASS_FORBIDDEN_IN_APPLICABLE` or `DOMAIN_AUTHORITY_UNSUPPORTED_PHASE1` | `NO-GO` / structural exit 1 |

### Layer 5 — Production-consumer mutation tests

Mutation is killed only if the unmodified independent exploit oracle fails when the production enforcement is weakened. Required mutations include:

| Mutation | Required oracle reaction |
|---|---|
| Remove Phase, Intent, Classification, Blueprint, Role Policy, or Agent Assignment operand | Corresponding concrete out-of-layer path is accepted by mutant, so test fails |
| Change role selection to task-wide default or make actor optional | Unassigned-path exploit causes test failure |
| Replace exact-one resolver with first-match | Collision/permutation production case causes test failure |
| Accept producer constant without anchored base/validator identity | Schema-valid self-issued proof case causes test failure |
| Trust `liveStagedProofValidated` boolean or skip live index recomputation | forged-live-receipt case causes test failure |
| Skip JSON Unicode normalization | Unicode production artifact is missed and test fails |
| Break malformed-percent handling or restore catch/break omission | adjacent encoded-credential artifact is missed and test fails |
| Remove Basic or quoted Cookie emitter | exact manifest cell is missed and test fails |
| Remove any binary signature or extension mismatch emitter retained in contract | corresponding matrix cell is missed and test fails |
| Treat category/rule_class Domain content as generic meta authority | cross-namespace applicable Rule case reaches GO or loses required error, so test fails |
| Skip lifecycle predecessor check while claiming transition automaton | standalone terminal event is accepted and test fails |

The mutant workspace must regenerate its manifest intentionally; otherwise a hash mismatch kills every mutation without proving the semantic oracle.

### Layer 6 — Report and concurrency trust

Keep existing truncation, duplicate, provenance, suite-hash, run-root, ownership, and cleanup checks. Add:

- recomputation of every case artifact hash from a canonical subject, not format-only validation;
- parent-side rerun or independent recomputation for required critical cases;
- rejection of a complete all-PASS report whose result fields disagree with recomputed production output;
- rejection of nonempty but false `asserted_invariant` or `production_entrypoint` strings;
- child executable/script digest bound to the trusted suite;
- exact stdout/stderr truncation detection and fatal-error propagation;
- no trust in child-supplied expected case sets.

Concurrency remains an isolation/integrity test. It cannot replace semantic production tests.

## Required oracle fields

Every critical case result must carry and the parent must verify:

```text
case_id
structural_status
calculated_gate
process_exit_code
finding_class
resolved_identity
authority_subject
proof_type
proof_source
proof_base_commit_or_bootstrap_authority
scan_contract_id_and_version
candidate_manifest_sha256
candidate_file_set_sha256
production_entrypoint
production_module_digest
```

`PASS=true`, a case count, or exit code alone is insufficient.

## Positive-fixture corrections

Remove or rewrite these assumptions:

- CASE-01/09: helper-level role scope proves the consumer enforces it.
- CASE-21/22/25: a producer constant plus self-hash proves tool origin.
- PROD-04: rejecting `proof_type=PASS` covers schema-valid typed forgeries.
- CASE-32: well-formed isolated URL decoding proves malformed-adjacent composition.
- CASE-39/40: one PDF mismatch and set equality prove every emitter branch.
- CASE-43..47: all Domain semantics originate only in the Domain registry.
- CASE-48: standalone terminal snapshots satisfy a contract claiming predecessor enforcement.

## Acceptance before formal review

1. All six blocking A5 constructions have exact production cases.
2. Each retained control has at least one consumer-level mutation.
3. Every declared scanner class has production positive and adjacent safe-negative coverage.
4. The parent detects semantically forged complete child reports.
5. No positive case relies on self-issued producer/approval fields as authority.
6. Test artifacts state whether they are bootstrap evidence or steady-state trusted-base proofs.
7. A removed capability has no schema, policy, template, helper, fixture, or consumer branch left in the candidate.

These are future acceptance criteria only. No test or finding is changed by this analysis.
