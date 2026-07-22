# A4 Convergence Options

Task: `GOV-PHASE1-A4-FINDING-CONSOLIDATION`

This is a read-only design recommendation. It does not authorize or create Remediation 5, change an A4 finding, or move any gate from `NO-GO`.

## 1. Decision rule

Every root cause has exactly one primary treatment below:

- `IMPLEMENT`: the candidate claims the capability and an incorrect GO or scope/authority bypass is possible, so the production path must enforce it.
- `NARROW_CONTRACT`: retain a smaller control that the production path can actually enforce, and delete broader policy/schema/fixture claims.
- `REMOVE_FROM_PHASE1`: remove the capability from the first commit candidate and fail closed whenever it would be needed.
- `DEFER_AS_RESIDUAL_RISK`: allowed only when deferral cannot create an incorrect GO, forged authority, or scope bypass inside the retained contract.

No formal A4 finding qualifies for `DEFER_AS_RESIDUAL_RISK`. The lifecycle projection gap is not one of the twelve formal findings; it still requires implementation if lifecycle status remains a Phase 1 authority surface.

## 2. Primary convergence disposition

| Root cause | Primary strategy | Required convergence |
|---|---|---|
| Scope lattice | `IMPLEMENT` | One `computeEffectiveScope()` output must be consumed by both Task validation and change-scope validation. |
| Typed proof provenance | `IMPLEMENT` | Validator-issued, type-discriminated proof bound to issuer, subject, file set, digests, and purpose. |
| Requirement identity and waiver | `IMPLEMENT` for uniqueness; Phase 1 waiver subfeature removed | Duplicate IDs fail before projection. A waiver cannot satisfy a requirement in the first commit candidate. |
| Artifact/authority resolution | `IMPLEMENT` | Every reference resolves to exactly one typed artifact; no `.find()`/first-match authority lookup. |
| Domain authority binding | `REMOVE_FROM_PHASE1` | Keep `proposed_rule_registry` only; remove any Phase 1 claim that an Agent can establish confirmed Rule authority. |
| Execution sensitivity | `IMPLEMENT` | Approval requirements derive from structured effect categories, with free text only able to add restrictions. |
| Fixture oracle | `IMPLEMENT` | Production-path semantic assertions, mutation resistance, collision/canonicalization/schema integration tests. |
| Scanner Unicode canonicalization | `IMPLEMENT` | Bounded decoding pipeline with raw/canonical provenance and stable finding classes. |
| Scanner Basic/quoted headers | `IMPLEMENT` | Structured normalized header parsing and deterministic credential classes. |
| Scanner URL-safe entropy | `NARROW_CONTRACT` | State exact supported alphabets; do not claim general opaque-token coverage. |
| Scanner extension/magic mismatch | `NARROW_CONTRACT` | Remove this unimplemented class; retain the simpler unapproved-binary prohibition. |
| Lifecycle projection | `IMPLEMENT` | Project validated transitions, include the current Task, and reject contradiction/regression. |

The recommended waiver and Domain decisions are scope convergence, not a finding downgrade. If either feature is retained, its complete declared contract becomes mandatory and its strategy changes to `IMPLEMENT` before A5.

## 3. Why the passing suites did not establish safety

### Production path coverage

- The 50-case suite calls the real `validateTask()` production entry point. Its main positive case, however, constructs `EV-SCOPE`, `EV-PREAPP`, Candidate Snapshot, and STAGED_EXACT fields inside the Task and expects GO without a trusted producer. It therefore makes the bypass part of the oracle.
- The 54-case suite imports Remediation 4 helper functions directly. Those tests can prove helper behavior but cannot prove that `validate-task.mjs` imports the helper, that the schema loader loads its schema, or that every consumer uses the helper.
- The scope fixtures keep Phase, Intent, Classification, Blueprint, role, and assignment paths coextensive. They exercise obvious out-of-Phase paths, not a widening inside Phase but outside human-approved Intent/Classification.

### Schema loader coverage

- Helper-created objects are passed directly to functions. This bypasses the closed production schema map in `validate-task.mjs`, which omits the Candidate Snapshot, STAGED_EXACT, waiver, and Domain approval schemas.
- A schema file existing and passing isolated validation does not prove that the production loader selects it or that the authoritative validator consumes the validated object.

### Oracle weakness

- Many assertions check only acceptance/rejection, counts, or report hashes. They do not assert proof type, issuer, subject, resolved artifact identity, exact finding class, or the absence of a first-match collision.
- R4 chronology compares fixture constants rather than validating signed/issued proof chronology from production artifacts.
- R4 Domain positives encode partial field presence as sufficient approval binding, even though the production contract requires Rule, Approval, and Source authority to be joined.

### Scanner boundary

- Scanner positives are supplied in already recognizable forms. They do not traverse a complete canonicalization sequence from raw bytes through bounded JSON/URL/header decoding to classification.
- Tests do not mechanically compare policy-declared finding classes to scanner-emittable classes. Consequently, the extension/magic mismatch class can be documented and fixture-listed without an implementation path.
- Generic entropy tests cover the implemented alphabet. They do not perform differential generation across standard Base64, URL-safe Base64, quoted values, percent encoding, and JSON escapes.

### Concurrency boundary

- The concurrency harness starts the trusted runner and validates reports that runner generated. It establishes parallel file isolation.
- It does not substitute an adversarial child, truncate a child report mid-write, inject a semantically false but hash-consistent report, or prove that the parent independently recomputes the child result. The isolated report parser fixtures do not close that end-to-end gap.

## 4. Convergence options

### Option 1 — Minimal credible Phase 1 (recommended)

Implement the shared scope, identity, typed-proof, structured sensitivity, scanner canonicalization, lifecycle projection, and production-path test kernel. Remove Phase 1 waiver satisfaction and confirmed Domain Rule promotion. Narrow opaque-token and extension/magic claims to implemented behavior.

Advantages:

- closes every demonstrated incorrect-GO, scope, and reference collision path in the retained contract;
- reduces the number of authority models that must be made trustworthy before the first commit;
- leaves Migration 320 correctly blocked because its candidate Rule remains proposed/unverified;
- gives A5 a smaller, falsifiable review surface.

Cost: the 103-file manifest cannot be reused. Schemas, policies, tests, documentation, Candidate Snapshot, and hashes must be rebuilt together after the scope decision.

### Option 2 — Full declared capability

Implement Option 1 plus full waiver authority/chronology and complete confirmed Domain Rule promotion with production schema loading and Rule/Approval/Source binding.

Advantages: preserves more of the current declared feature set.

Costs and risk: substantially larger authority surface, more typed artifacts and lifecycle transitions, more collision cases, and a higher likelihood of another split helper/production implementation. This should be chosen only if confirmed-rule and waiver workflows are required for the first governance commit.

### Option 3 — Review-only first commit

Retain classification, scope calculation, manifest integrity, secret/binary scanning, review collection, and fail-closed NO-GO calculation. Remove execution preapproval, STAGED_EXACT execution claims, waivers, and confirmed Domain Rule authority from Phase 1.

Advantages: smallest credible first commit.

Trade-off: Governance Commit Execution remains intentionally impossible until a later phase introduces trusted execution proof. This is honest and safe but may not meet the intended Phase 1 milestone. It must be an explicit human scope decision, not an implicit validator workaround.

## 5. Shared authoritative components

### `computeEffectiveScope()`

- **Single input model:** normalized Phase Policy, Task Intent, Classification, Blueprint, role policy, Agent assignment, and operation kind; every path is product-root-relative and already canonical-path checked.
- **Single output model:** immutable effective read/write glob sets plus a derivation record identifying each constraining layer and any empty intersection.
- **Fail-closed:** missing layer, unknown operation, invalid/absolute/traversal path, unrepresentable glob intersection, widening, or empty required scope.
- **Required callers:** `validate-task.mjs`, `validate-change-scope.mjs`, task creation/default generation, and any candidate file-set builder.
- **Delete old logic:** caller-local Phase/Blueprint/assignment inclusion tests and any separate allowed-path reconstruction.
- **Tests:** property tests for monotonic narrowing; table-driven six-layer intersections; mutations removing one layer; production E2E with a path inside Phase but outside Intent.

### `resolveUniqueArtifact()`

- **Single input model:** typed artifact collection, artifact ID, expected artifact type, expected Task/subject, and optional manifest identity.
- **Single output model:** one immutable resolved artifact with source location and verified content digest.
- **Fail-closed:** zero match, duplicate ID, type mismatch, subject mismatch, digest mismatch, or ambiguous cross-Task ownership.
- **Required callers:** evidence resolution, Candidate/STAGED proof consumption, approval lookup, Rule/Source lookup, task graph construction, and manifest consumers.
- **Delete old logic:** every `.find()` or first-match lookup used for authority; local resolvers with different duplicate semantics.
- **Tests:** collision tests at beginning/middle/end, same ID across types/tasks, insertion-order permutations, digest substitution, and mutations changing exact-one to first-one.

### `resolveUniqueRequirement()`

- **Single input model:** all required requirements, submitted satisfaction evidence, semantic category, and optional typed waiver reference.
- **Single output model:** one resolution per required requirement with exact category and evidence/proof identity.
- **Fail-closed:** duplicate IDs, category conflict, zero/multiple evidence, unknown requirement, re-used evidence, or waiver when waiver capability is disabled.
- **Required callers:** `validate-task.mjs` gate calculation, evidence summary, approval requirement resolution, and any future waiver validator.
- **Delete old logic:** last-wins `Map` construction and string/category-based ad hoc matching.
- **Tests:** property uniqueness/permutation tests, duplicate/case/Unicode-normalization collisions, evidence reuse, category confusion, and waiver-target mutation.

### `validateTypedProof()`

- **Single input model:** discriminated proof object, expected proof type, trusted producer identity, subject Task/candidate identity, canonical file set, digests, purpose, and chronology bounds.
- **Single output model:** verified typed proof with immutable subject/file set and producer metadata; never a generic boolean PASS.
- **Fail-closed:** unknown/interchangeable type, Task-authored producer, subject mismatch, stale candidate, missing/excess file, path/blob hash mismatch, chronology inversion, or generic PASS substitution.
- **Required callers:** Candidate Snapshot validation, STAGED_EXACT validation, scope validation, preapproval, commit preparation, and execution gate calculation.
- **Delete old logic:** generic evidence objects, label-only checks, candidate binding that ignores file-set contents, and hand-authored PASS trust.
- **Tests:** proof-type substitution matrix, subject replay, file add/remove/reorder, stale hash, producer spoof, chronology boundary, and mutations bypassing one field.

### `canonicalizeScannerInput()`

- **Single input model:** raw bytes, declared path/extension, bounded size, and content-type hint; never a pre-decoded untracked string.
- **Single output model:** raw fingerprint plus bounded canonical views (text, decoded JSON strings, percent-decoded view, normalized header pairs) and transformation provenance.
- **Fail-closed:** invalid encoding where a declared decoder is required, decode-depth/size expansion exceeded, binary where unapproved binaries are prohibited, or classifier cannot account for a declared policy class.
- **Required callers:** `secret-scanner.mjs`, governance artifact scan, manifest scan boundary, and scanner fixtures through the public production entry point.
- **Delete old logic:** classifiers running on unrelated representations, implicit one-pass regex assumptions, and policy classes without an emitted implementation.
- **Tests:** canonicalization differential tests, equivalent-encoding property groups, nested/invalid escape limits, header quoting, standard versus URL-safe alphabet, binary magic/extension matrix if that claim is retained, and classifier-removal mutations.

### `validateDomainApprovalBinding()`

- **Phase 1 recommendation:** do not ship or invoke a confirmed-Rule path in the minimal option. Keep all candidate rules non-authoritative and NO-GO.
- **Single input model for future re-entry:** schema-validated Rule, Approval, and Source artifacts resolved uniquely, plus reviewer/human authority, rule hash, registry version, decision, and chronology.
- **Single output model:** verified binding identifying the exact Rule version, authoritative Source, Approval decision, approver authority, and registry transition.
- **Fail-closed:** any schema not loaded by production, duplicate/missing reference, unverified Source, proposed Rule, mismatched Rule hash/version, self-promotion, invalid approver, stale/replayed Approval, or incomplete triple.
- **Required callers if reintroduced:** `validate-task.mjs`, Domain registry transition validator, applicable-rule derivation, and Migration 320 wrapper.
- **Delete old logic:** hand-written partial Domain field checks, `.find()` approval selection, and any status flip not backed by the full binding.
- **Tests:** production schema-loader integration, cross-product Rule/Approval/Source tables, collision/replay/order tests, Agent self-confirmation mutation, and M320 candidate-rule E2E NO-GO.

### `projectLifecycleState()`

- **Single input model:** validated append-only transition artifacts for all Phase tasks, including the current Task, with Task ID, predecessor state, next state, authority, time/order, and artifact digest.
- **Single output model:** deterministic current phase/review/gate projection plus provenance for every state bit.
- **Fail-closed:** missing prerequisite, duplicate/contradictory transition, unknown Task/state, regression, fixed Task-ID assumption, or projection not reproducible from the transition set.
- **Required callers:** lifecycle projection, phase-status generation/validation, gate summary, and candidate snapshot metadata.
- **Delete old logic:** hard-coded `a4_started` and fixed A3/Remediation 4 source lists.
- **Tests:** transition-sequence property tests, current-Task inclusion, permutation determinism, contradiction/regression tables, unknown future review IDs, and mutation of transition filtering.

## 6. Test strategy that can prevent A5 recurrence

| Test family | Required target | A5 recurrence prevention value |
|---|---|---|
| Property-based tests | scope monotonicity, exact-one identity, transition determinism, equivalent scanner encodings | **High**: explores classes not represented by numbered examples. |
| Mutation tests | remove a scope layer, replace exact-one with first-one, skip proof field/schema, remove scanner classifier | **Critical**: proves the suite fails when the enforcement path is weakened. |
| Table-driven invariants | proof type/subject matrix, requirement category conflicts, Rule/Approval/Source combinations | **High**: makes semantic cross-products explicit. |
| Reference-resolution collision tests | duplicates across order, type, Task, manifest, Unicode/case forms | **Critical** for Code-004 and Domain-002 recurrence. |
| Canonicalization differential tests | raw/escaped/percent/quoted/equivalent token representations | **Critical** for the four scanner findings. |
| Schema-loader integration tests | enumerate every declared artifact type and require production load plus consumer invocation | **Critical** for preventing “schema exists but is unused.” |
| Production-path E2E governance tests | invoke authoritative CLI/validator, assert calculated gate, finding class, proof issuer/type, and resolved identity | **Critical**: replaces helper-only assurance. |
| Adversarial concurrency E2E | malicious/truncated/semantic-false child report and independent parent recomputation | **High** for report trustworthiness; not a substitute for validator semantics. |

A fixture count is not an acceptance criterion. Remediation is acceptable only when the tests fail under representative enforcement mutations and pass only through the same public production entry points used for the gate.

## 7. Phase 1 convergence decision

### Minimum credible capabilities to retain

- fail-closed structural schema loading for every retained artifact type;
- one effective scope lattice and exact changed-file validation;
- unique requirement/artifact/reference resolution;
- validator-produced typed candidate/scope/approval proofs for any retained GO path;
- calculated gate with BLOCKER dominance, independent Reviewer identity, evidence hash checks, and no task-graph influence;
- manifest file-set/hash integrity and a scanner whose claims match its canonicalization/classification implementation;
- proposed Railway Rule registry only, with `confirmed_rule_count=0` and candidate/unverified rules excluded from `applicable_rules`;
- deterministic lifecycle projection from filed transitions;
- production-path, mutation-resistant test evidence.

### Capabilities removable from the first commit

- waiver-based requirement satisfaction;
- Agent-mediated proposed-to-confirmed Railway Rule promotion and Domain authority approval;
- general URL-safe opaque-token claim beyond an explicitly implemented alphabet;
- extension-versus-magic forensic mismatch class;
- execution GO, if no trusted proof producer can be delivered (Option 3 only).

Removing these capabilities does not make Migration 320 executable. Its candidate Rule and execution evidence remain non-authoritative, so the Migration 320 gate remains `NO-GO`.

### Manifest and next review

- The existing 103-file governance commit manifest and Candidate Snapshot must not be patched in place or treated as proof of the converged candidate.
- After an authorized remediation and an explicit feature-removal decision, rebuild the candidate file set, hashes, scanner report, proof bindings, and manifest from source. The count may increase or decrease; correctness is exact set equality, not preserving `103`.
- A bounded Remediation 5 is required before the candidate can be reviewed again because retained incorrect-GO and scope/authority bypasses are implementation defects.
- A fresh independent A5 is required after remediation. A4 remains archived and unchanged.

Formal review must not restart until all of the following are true:

1. a human chooses the retained Phase 1 capability set and authorizes a bounded Remediation 5;
2. each retained contract has one production implementation and no legacy parallel path;
3. every retained schema is enumerated by the production loader and consumed by the authoritative validator;
4. all demonstrated exploit constructions fail closed through production entry points with stable finding classes;
5. representative mutations are detected by the suite;
6. policy-declared scanner classes exactly match emitted production classes;
7. lifecycle projection includes Remediation 5 and the future A5 without hard-coded Task IDs;
8. candidate manifest, snapshot, scan, and typed proofs are rebuilt and internally consistent;
9. A4 outcomes remain immutable, Session B remains unauthorized, and every gate remains `NO-GO` pending A5.

