# Session A4 Finding Consolidation

Task: `GOV-PHASE1-A4-FINDING-CONSOLIDATION`

Authority boundary: this report restates and analyzes the twelve filed A4 findings. It does not modify, close, downgrade, or re-review any finding. Session A4 remains `ARCHIVED / BLOCKER`; every governance and Migration 320 gate remains `NO-GO`.

## Executive diagnosis

The dominant failure is not a shortage of fixture count. The candidate contains schemas, policies, helper functions, and passing helper-level tests, while the authoritative production validator either does not import those helpers, does not load those schemas, or resolves the same identity with different logic. The result is multiple non-equivalent validation paths:

- declared contract versus production enforcement;
- helper-level fixture oracle versus `validateTask()` integration;
- current-Task identity validation versus cross-Task authority resolution;
- structured schemas versus hand-written field checks;
- scanner policy vocabulary versus emitted finding classes;
- lifecycle projection versus actual Task transitions.

The 50-case suite does execute `validateTask()`, but its positive fixture encodes forged proof fields as a valid GO. The 54-case suite mostly calls isolated helpers and therefore proves those helpers, not their use by the production path. Concurrency proves isolation and validates reports produced by the trusted runner; it does not inject a malicious child implementation into the parent process.

## 1. A4-CODE-BLOCKER-001

1. **finding_id:** `A4-CODE-BLOCKER-001`
2. **reviewer:** Code Reviewer
3. **severity:** `BLOCKER`
4. **title:** Intent and Classification scope do not constrain Blueprint or change-scope writes.
5. **affected_control_contract:** Effective write authority must be the intersection of Phase Policy, Task Intent, Classification, Blueprint, role policy, and Agent assignment; `validate-change-scope` must consume that same result.
6. **affected_files_and_lines:** `.codex/scripts/lib/governance-controls.mjs:19-29`; `.codex/scripts/validate-task.mjs:266-285`; `.codex/scripts/validate-change-scope.mjs:40-88`; Remediation fixture `.codex/tests/run-remediation-4-contract-fixtures.mjs:7-12`.
7. **exact_failure_condition:** `validatePhaseScope()` checks Blueprint writes against the broad Phase policy and assignment writes against Phase plus Blueprint, but never against Intent or Classification. `validate-change-scope` then takes Blueprint/assignment paths as its allowed set. A path can therefore be Phase-allowed and role-allowed while outside the human-approved Task scope.
8. **reproducible_read_only_check:** Import `validatePhaseScope` and `validateChangedPaths` in memory. Limit Intent and Classification to `.codex/tasks/APPROVED/**`; give Blueprint and a permitted role `.codex/tasks/UNAPPROVED/**`; validate `輕軌系統/.codex/tasks/UNAPPROVED/file.md`. A4 observed empty error arrays from both production exports.
9. **minimal exploit or incorrect-GO construction:** File a structurally valid Task whose human-approved Intent/Classification are narrow, while Blueprint/assignment widen within `.codex/**`. Record an unauthorized governance source in the handoff and change scope. The broad Phase/role checks accept it, so later approvals can operate on work outside the approved scope.
10. **why 50-case/54-case fixtures did not detect it:** The 50-case base makes Intent, Classification, Blueprint, and assignment coextensive under the same task root. The 54-case scope cases test product/DB flags and paths outside the Phase policy, not a path inside Phase but outside Intent/Classification.
11. **existing positive fixture encoded an incorrect assumption:** Yes. R4-04 labels Phase membership as a valid “governance intersection,” although it never constructs the full lattice. CASE-01 also assumes equal scopes and cannot detect widening.
12. **classification:** `validator defect`, `policy defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; it demonstrates an approved-scope bypass.
14. **minimum safe remediation:** Implement one `computeEffectiveScope()` and require both `validateTask()` and `validate-change-scope` to use its exact output. No caller may independently reconstruct allowed paths.
15. **new regression invariant:** For every path, if any lattice input denies it, the effective result denies it. Scope intersection must be order-independent, idempotent, and monotonically non-expanding.
16. **risk of point-fix overfitting:** High. Adding one Intent comparison inside `validateTask()` leaves Classification, read scope, role assignment, or `validate-change-scope` on divergent logic.

## 2. A4-CODE-BLOCKER-002

1. **finding_id:** `A4-CODE-BLOCKER-002`
2. **reviewer:** Code Reviewer
3. **severity:** `BLOCKER`
4. **title:** Forged candidate and staged proof fields plus generic PASS evidence still produce GO.
5. **affected_control_contract:** Candidate, staged, scope-validation, and preapproval proofs must be typed outputs of their designated validators and bound to exact task, manifest, file set, blob set, count, execution, and time.
6. **affected_files_and_lines:** `.codex/scripts/validate-task.mjs:9,454-465`; `.codex/scripts/lib/governance-controls.mjs:53-58`; `.codex/scripts/validate-staged-candidate.mjs:1-20`; `.codex/blueprints/schemas/candidate-snapshot.schema.json:1`; `.codex/blueprints/schemas/staged-candidate.schema.json:1`; `.codex/tests/run-governance-fixtures.mjs:98-101,118-125,157`; `.codex/tests/run-remediation-4-contract-fixtures.mjs:20-27`.
7. **exact_failure_condition:** `validateTask()` neither imports `validateCandidateBinding()` nor invokes the staged validator. It checks labels and a few fields, accepts any PASS evidence reference for scope/preapproval, and only requires two reference strings to differ. The helper itself ignores candidate file-set hash and staged path/blob hashes.
8. **reproducible_read_only_check:** Call `validateCandidateBinding()` with correct manifest hash/count but deliberately wrong `included_file_set_sha256`, `staged_file_set_sha256`, and `staged_blob_set_sha256`; A4 observed no error. Inspect CASE-01, which sends fixed A/B/C hashes and generic `EV-SCOPE`/`EV-PREAPP` through `validateTask()` and expects GO.
9. **minimal exploit or incorrect-GO construction:** Create an approved Task with self-declared `WORKSPACE_CANDIDATE` and `STAGED_EXACT` objects, constant hashes, `change_scope_result=PASS`, and two generic PASS checks. No trusted staged enumeration or blob hashing is needed for the production validator to reach GO.
10. **why 50-case/54-case fixtures did not detect it:** The 50-case positive oracle explicitly expects this forged construction to pass. The 54-case suite calls an isolated, weaker helper that production does not call and never materializes a full Task through the final approval path.
11. **existing positive fixture encoded an incorrect assumption:** Yes. CASE-01 is a direct incorrect-GO oracle. R4-16/R4-17 also call underspecified helper objects “accepted” without testing file/blob hashes or production provenance.
12. **classification:** `validator defect`, `schema defect`, `proof-provenance defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; it proves a future Commit Execution incorrect GO path in the candidate framework.
14. **minimum safe remediation:** Implement `validateTypedProof()` with a closed proof-type registry and trusted producer mapping. Load the proof schemas, recompute or verify all hashes, require exact task/gate binding, and reject generic evidence for typed prerequisites.
15. **new regression invariant:** Mutating any proof field, producer, type, task, manifest, file set, blob set, count, execution ID, or time must fail. A proof of one type or execution must never satisfy another prerequisite.
16. **risk of point-fix overfitting:** Critical. Checking one extra hash in `validateTask()` still leaves self-asserted provenance, generic PASS substitution, and duplicated production/helper logic.

## 3. A4-CODE-BLOCKER-003

1. **finding_id:** `A4-CODE-BLOCKER-003`
2. **reviewer:** Code Reviewer
3. **severity:** `BLOCKER`
4. **title:** Human waiver validation is not integrated and duplicate requirement IDs can downgrade non-waivable semantics.
5. **affected_control_contract:** Requirement identity must be unique and conflict-free; any waiver must resolve to one schema-valid, hash-bound, prior human artifact tied to the same task, requirement, semantic category, scope approval, and scope.
6. **affected_files_and_lines:** `.codex/blueprints/schemas/test-evidence.schema.json:7-8`; `.codex/blueprints/schemas/human-evidence-waiver.schema.json:1`; `.codex/scripts/validate-task.mjs:9,338-362`; `.codex/scripts/lib/governance-controls.mjs:43-50`; `.codex/tests/run-governance-fixtures.mjs:200-202`; `.codex/tests/run-remediation-4-contract-fixtures.mjs:13-19`.
7. **exact_failure_condition:** Schema `uniqueItems` compares whole requirement objects, so the same ID may occur with different semantics. `new Map()` silently makes the last object authoritative. The validator accepts a truthy waiver artifact reference but does not resolve, schema-validate, hash-check, or authority-check it; `validateWaiver()` is helper-only.
8. **reproducible_read_only_check:** Validate two requirements named `REQ-ONE`, first non-waivable `EVIDENCE_INTEGRITY`, then waivable `GENERAL`, plus a NOT_APPLICABLE check referencing `FAKE`. Schema validation succeeds and Map resolution selects the later waivable object.
9. **minimal exploit or incorrect-GO construction:** Duplicate a required opaque ID with weaker semantics, mark the check NOT_APPLICABLE, and cite a nonexistent or Agent-authored waiver. The required-evidence loop treats NOT_APPLICABLE as an allowed verdict and can clear the gate control.
10. **why 50-case/54-case fixtures did not detect it:** CASE-27 duplicates verdicts, not requirement definitions. The 54 cases invoke `validateWaiver()` directly with a hand-built partial object; they do not traverse the schema loader, artifact resolver, or authoritative validator.
11. **existing positive fixture encoded an incorrect assumption:** Yes. R4-10 calls a partial helper input a “valid human waiver” although it omits task, requirement/category binding, approver identity, approval method, and scope-approval artifact required by the dedicated schema.
12. **classification:** `validator defect`, `schema defect`, `reference-resolution defect`, `proof-provenance defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; it permits removal of non-waivable gate evidence.
14. **minimum safe remediation:** Implement `resolveUniqueRequirement()` before any Map is built. Prefer removing waivers from Phase 1; if retained, resolve through `resolveUniqueArtifact()`, load the dedicated schema, and run one integrated binding/chronology validator.
15. **new regression invariant:** Requirement resolution is permutation-invariant; any duplicate ID is an error even when objects are byte-identical. A missing, mismatched, late, non-human, or out-of-scope waiver always fails.
16. **risk of point-fix overfitting:** Critical. A duplicate-ID check alone leaves fake waiver references; importing `validateWaiver()` alone leaves schema, identity, and artifact provenance unresolved.

## 4. A4-CODE-BLOCKER-004

1. **finding_id:** `A4-CODE-BLOCKER-004`
2. **reviewer:** Code Reviewer
3. **severity:** `BLOCKER`
4. **title:** Global Domain approval lookup still uses first-match authority within each manifest.
5. **affected_control_contract:** Every artifact reference must resolve to exactly one fully validated identity across all searched manifests; first-match resolution is forbidden.
6. **affected_files_and_lines:** `.codex/scripts/validate-task.mjs:146-156,171-174,307-309`; `.codex/scripts/lib/governance-controls.mjs:32-40`; `.codex/blueprints/schemas/artifact-manifest.schema.json:6`; `.codex/tests/run-remediation-4-contract-fixtures.mjs:30-33`.
7. **exact_failure_condition:** `findManifestArtifacts()` uses `Array.find()` per manifest. Two same-ID records in one manifest yield one visible match, so the later `artifacts.length===1` check mistakes one matching manifest for one matching artifact.
8. **reproducible_read_only_check:** Apply the filed resolver algorithm to a manifest with two conflicting same-ID records. The real match count is two; the resolver returns one.
9. **minimal exploit or incorrect-GO construction:** Place an authoritative-looking approval first and a conflicting record second in one searched Task manifest. Domain confirmation receives one visible result and can accept the ID as globally unique.
10. **why 50-case/54-case fixtures did not detect it:** Current-Task validation calls `validateArtifactIdentities()` on one manifest. R4-22 through R4-25 test that isolated array helper. Neither test invokes cross-Task `findManifestArtifacts()` with a same-manifest collision.
11. **existing positive fixture encoded an incorrect assumption:** Indirectly yes. R4-25’s local unique-array success and CASE-50’s single source are used as evidence for global uniqueness, though the production resolver has different behavior.
12. **classification:** `validator defect`, `reference-resolution defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; an ambiguous authority can be treated as unique.
14. **minimum safe remediation:** Replace all reference lookup with `resolveUniqueArtifact()` that collects every match, schema-validates every containing manifest, compares full identity tuples, and returns either one typed record or a fail-closed error.
15. **new regression invariant:** Zero matches, two matches in one manifest, two across manifests, or same ID with any path/hash/type/authority difference all fail; ordering never changes the result.
16. **risk of point-fix overfitting:** High. Replacing `.find()` with `.filter()` only in Domain code leaves other evidence and waiver resolvers vulnerable and may still skip invalid containing manifests.

## 5. A4-CODE-HIGH-005

1. **finding_id:** `A4-CODE-HIGH-005`
2. **reviewer:** Code Reviewer
3. **severity:** `HIGH`
4. **title:** Chronology is enforced, but not-required sensitivity is derived from only free-form trigger text.
5. **affected_control_contract:** Execution-approval requirements must derive from structured execution/evidence categories, not wording chosen by the Task author.
6. **affected_files_and_lines:** `.codex/blueprints/schemas/classification.schema.json:6-13`; `.codex/scripts/validate-task.mjs:430-469`; `.codex/tests/run-governance-fixtures.mjs:101,211-214`.
7. **exact_failure_condition:** Approved and not-required timestamps participate in ordering, but `sensitiveExecution` is a regex over `classification.triggers`. Scope, Blueprint execution, semantic evidence categories, and external evidence are not cross-checked.
8. **reproducible_read_only_check:** Build two otherwise identical sensitive Tasks; omit the regex magic words from one trigger list. The latter may use `execution_approval=not-required` even though the structured work is unchanged.
9. **minimal exploit or incorrect-GO construction:** Describe a sensitive evidence or database-affecting action using a neutral trigger such as `governance`; mark execution approval not-required; keep later timestamps ordered; the production gate does not require approval.
10. **why 50-case/54-case fixtures did not detect it:** CASE-36 tests only that adding the literal phrase `database migration` activates the regex. No fixture keeps sensitive structured content while neutralizing the trigger text. R4-18 through R4-20 are integer tautologies, not validator calls.
11. **existing positive fixture encoded an incorrect assumption:** Yes. CASE-01 treats absence of trigger keywords as sufficient proof that not-required is valid.
12. **classification:** `validator defect`, `policy defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; it supplies a construction that can incorrectly remove human execution approval.
14. **minimum safe remediation:** Define structured execution categories and a deterministic sensitivity classifier. Unknown or conflicting classification fails closed; trigger prose becomes descriptive only.
15. **new regression invariant:** Adding a sensitive category can never reduce approval requirements; changing prose alone cannot change sensitivity; structured conflicts always reject.
16. **risk of point-fix overfitting:** High. Expanding the regex only creates new euphemism bypasses.

## 6. A4-CODE-HIGH-006

1. **finding_id:** `A4-CODE-HIGH-006`
2. **reviewer:** Code Reviewer
3. **severity:** `HIGH`
4. **title:** The exact 50-case report contract is sound, but the 54-case suite gives false assurance about production integration.
5. **affected_control_contract:** Regression evidence supporting a governance claim must run the authoritative production entrypoint and emit a trusted, versioned, exact-set report.
6. **affected_files_and_lines:** `.codex/scripts/lib/governance-controls.mjs:75-92`; `.codex/tests/run-governance-fixtures-concurrency.mjs:1-36`; `.codex/tests/run-remediation-4-contract-fixtures.mjs:1-45,65`; `.codex/tests/run-governance-fixtures.mjs:118-125,241-245`.
7. **exact_failure_condition:** The 54 suite calls helper functions directly, uses tautological arithmetic for chronology, and emits only line/count output. Passing helpers are not necessarily imported by `validateTask()`. A green 54/54 result is therefore not proof of integrated remediation.
8. **reproducible_read_only_check:** Compare imports: the 54 suite imports six remediation helpers; `validate-task.mjs:9` imports only two of them. Inspect R4-18 through R4-20 (`a>b`) and the lack of a 54-case suite manifest/report.
9. **minimal exploit or incorrect-GO construction:** Leave production code unchanged or vulnerable, implement a correct unused helper, and point the 54-case suite at the helper. All cases pass while production still accepts the bypass.
10. **why 50-case/54-case fixtures did not detect it:** This finding is the explanation. The 50 suite has production coverage but an incorrect positive oracle; the 54 suite has relevant negative ideas but not production integration.
11. **existing positive fixture encoded an incorrect assumption:** Yes. R4-16/R4-17 and R4-54 equate helper acceptance with production acceptance; the aggregate “54/54” is treated as integrated evidence despite no structured exact-set report.
12. **classification:** `fixture-oracle defect`, `proof-provenance defect`.
13. **blocks_candidate_review_gate:** `true`; it produces a false governance statement that claimed controls were integrated.
14. **minimum safe remediation:** Convert every gate-affecting case into a production-path end-to-end test; give the suite a trusted manifest and structured report; retain helper unit tests only as lower-level supplements.
15. **new regression invariant:** Every claimed control must have at least one test that fails when its production call site is deleted. Parent report parsing must be tested with injected malicious/truncated child outputs.
16. **risk of point-fix overfitting:** High. Adding more helper cases increases the pass count without proving the call graph.

## 7. SEC-A4-001

1. **finding_id:** `SEC-A4-001`
2. **reviewer:** Security Reviewer
3. **severity:** `HIGH` (blocking)
4. **title:** Declared JSON string unescape does not decode legal Unicode escapes.
5. **affected_control_contract:** `scan-contract.yaml` promises `json-string-unescape-once` before pattern detection.
6. **affected_files_and_lines:** `.codex/governance/scan-contract.yaml:5`; `.codex/scripts/lib/secret-scanner.mjs:38-46`; `.codex/tests/run-remediation-4-contract-fixtures.mjs:48-49`; `.codex/tasks/GOV-PHASE1-REMEDIATION-4/security-evidence.yaml:1`.
7. **exact_failure_condition:** Manual replacements handle slash/quote/backslash. The `JSON.parse` branch re-escapes backslashes first, so `\u0070` remains escaped instead of becoming `p`.
8. **reproducible_read_only_check:** Pass a synthetic `\u0070ostgresql:\/\/user:value@host/db` string to `scanText()`. A4 observed `[]` instead of `CREDENTIAL_URI`.
9. **minimal exploit or incorrect-GO construction:** Store a credential URI in a manifest-included JSON/YAML text with the scheme’s first character represented as a JSON Unicode escape. The declared-contract clean scan can report no finding.
10. **why 50-case/54-case fixtures did not detect it:** CASE-41/R4-41 covers escaped slashes only. No differential representation table includes Unicode escapes.
11. **existing positive fixture encoded an incorrect assumption:** Yes. The broad label “JSON escaped URI detected” is supported by only one escape form and was treated as coverage of the declared JSON unescape stage.
12. **classification:** `canonicalization defect`, `scanner-contract defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; it is an in-contract false negative.
14. **minimum safe remediation:** Implement one bounded `canonicalizeScannerInput()` using well-defined JSON string decoding and feed every canonical variant through the same detector pipeline.
15. **new regression invariant:** Semantically equivalent raw, slash-escaped, quote-escaped, Unicode-escaped, and bounded URL-encoded inputs yield the same finding set; decoding stops at the declared bound.
16. **risk of point-fix overfitting:** Critical. Adding a `\u00xx` regex misses surrogate pairs, mixed escapes, and composition order.

## 8. SEC-A4-002

1. **finding_id:** `SEC-A4-002`
2. **reviewer:** Security Reviewer
3. **severity:** `HIGH` (blocking)
4. **title:** Declared Authorization and Cookie classes omit Basic credentials and quoted cookie values.
5. **affected_control_contract:** The scan policy declares `Authorization`, `Cookie`, and `Set-Cookie`, not only Bearer and unquoted values.
6. **affected_files_and_lines:** `.codex/governance/scan-contract.yaml:7`; `.codex/scripts/lib/secret-scanner.mjs:9-11`; `.codex/tests/run-governance-fixtures.mjs:215`; `.codex/tests/run-remediation-4-contract-fixtures.mjs:50-56`.
7. **exact_failure_condition:** Authorization regex matches Bearer only. Cookie regex excludes quoted values.
8. **reproducible_read_only_check:** Call `scanText()` with a synthetic Basic Authorization header and with `Cookie: id="<long synthetic value>"`; A4 observed empty findings for both.
9. **minimal exploit or incorrect-GO construction:** Put either declared header form into a manifest-included governance artifact; the clean contract claim remains true despite credential-bearing content.
10. **why 50-case/54-case fixtures did not detect it:** Tests cover Bearer, one unquoted Cookie, one unquoted Set-Cookie, and a short harmless Cookie. They do not table-drive header scheme or quoting variants.
11. **existing positive fixture encoded an incorrect assumption:** Yes. “Cookie detected” and the policy header list imply class coverage from one unquoted example.
12. **classification:** `scanner-contract defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; it is an in-contract false negative.
14. **minimum safe remediation:** If these header classes remain declared, implement structured header/value parsing with explicit supported authorization schemes and quoted/unquoted cookie handling. Otherwise narrow the contract before claiming completion.
15. **new regression invariant:** Every declared header grammar variant has positive and adjacent safe-negative cases; an unsupported scheme is never silently claimed as covered.
16. **risk of point-fix overfitting:** High. Alternating `Basic|Bearer` in one regex still misses quoting, whitespace, folded values, and cookie grammar.

## 9. SEC-A4-003

1. **finding_id:** `SEC-A4-003`
2. **reviewer:** Security Reviewer
3. **severity:** `HIGH` (blocking)
4. **title:** Declared opaque high-entropy detection excludes URL-safe values.
5. **affected_control_contract:** Policy declares opaque values of minimum length 32 and entropy threshold 4.2 without limiting the alphabet to standard Base64.
6. **affected_files_and_lines:** `.codex/governance/scan-contract.yaml:8-9`; `.codex/scripts/lib/secret-scanner.mjs:49-60`; `.codex/tests/run-remediation-4-contract-fixtures.mjs:52,55-56`.
7. **exact_failure_condition:** Candidate extraction uses `[A-Za-z0-9+/=]{32,63}`. `_` or `-` breaks the candidate, so a URL-safe high-entropy value may have no qualifying contiguous segment.
8. **reproducible_read_only_check:** Pass a 33-character mixed-case/numeric synthetic value containing `_` to `scanText()`; A4 observed no entropy finding.
9. **minimal exploit or incorrect-GO construction:** Store a URL-safe opaque token inside a scanned manifest artifact; the declared opaque-value claim misses it.
10. **why 50-case/54-case fixtures did not detect it:** Only one standard-alphanumeric entropy positive is present. There is no alphabet boundary table and no entropy-specific safe-negative set.
11. **existing positive fixture encoded an incorrect assumption:** Yes. R4-44’s name “opaque entropy detected” overgeneralizes from one alphabet.
12. **classification:** `scanner-contract defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true` while the broad contract remains.
14. **minimum safe remediation:** Prefer `NARROW_CONTRACT`: explicitly define the supported candidate alphabet and rename the claim. If URL-safe opaque values are required, implement and tune that alphabet with safe negatives.
15. **new regression invariant:** The detector is complete for the exact declared alphabet/length domain and makes no claim outside it; boundary characters and lengths are table-driven.
16. **risk of point-fix overfitting:** High. Adding `_` alone misses `-`, padding, longer values, and false-positive controls.

## 10. SEC-A4-004

1. **finding_id:** `SEC-A4-004`
2. **reviewer:** Security Reviewer
3. **severity:** `HIGH` (blocking)
4. **title:** Policy declares extension-magic mismatch although no such comparison or finding class exists.
5. **affected_control_contract:** Every finding class in the structured scan contract must be implemented and regression-tested, or removed from the claim.
6. **affected_files_and_lines:** `.codex/governance/scan-contract.yaml:10`; `.codex/scripts/lib/secret-scanner.mjs:24-29,71-81`; `.codex/tests/run-governance-fixtures.mjs:218`; `.codex/tests/run-remediation-4-contract-fixtures.mjs:53-56`; Remediation 4 matrix/security evidence line 1.
7. **exact_failure_condition:** `scanBinaryContent()` detects magic but receives no manifest artifact type and never compares extension/type to magic. It cannot emit `EXTENSION_MAGIC_MISMATCH`.
8. **reproducible_read_only_check:** Scan PDF bytes under `probe.txt`; output contains `PDF_SIGNATURE`, not an extension/type mismatch finding.
9. **minimal exploit or incorrect-GO construction:** The known signature is still rejected, so the direct security bypass is limited; the incorrect construction is a governance evidence package claiming an implemented mismatch control that does not exist.
10. **why 50-case/54-case fixtures did not detect it:** CASE-43 checks only that any binary finding occurs. R4-45/R4-46 cover MZ/ELF signatures, not extension/type comparison or the full declared matrix.
11. **existing positive fixture encoded an incorrect assumption:** Yes. Generic “binary rejected” results were used to support a distinct declared mismatch capability.
12. **classification:** `policy defect`, `scanner-contract defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; it demonstrates a false governance/security claim even though known magic remains rejected.
14. **minimum safe remediation:** `NARROW_CONTRACT`: remove extension-magic-mismatch from Phase 1 while all binaries are categorically forbidden. Only implement it later if artifact-type-aware binary admission is introduced.
15. **new regression invariant:** The set of declared scanner finding classes exactly equals the set of producible, asserted classes; contract-to-implementation drift fails a meta-test.
16. **risk of point-fix overfitting:** Medium-high. Emitting a mismatch label whenever a signature is seen would misrepresent actual type comparison and duplicate the existing binary prohibition.

## 11. A4-DOMAIN-AUTHORITY-BINDING-001

1. **finding_id:** `A4-DOMAIN-AUTHORITY-BINDING-001`
2. **reviewer:** Railway Domain Reviewer
3. **severity:** `HIGH` (blocking)
4. **title:** Dedicated Domain approval schema exists but is not applied and Rule/Approval/Source are not fully cross-bound.
5. **affected_control_contract:** A confirmed Rule must reference one schema-valid authoritative human approval whose owner, Rule, source, scope, times, and verification method exactly agree with the Rule authority record.
6. **affected_files_and_lines:** `.codex/blueprints/schemas/domain-rule-approval.schema.json:1`; `.codex/scripts/validate-task.mjs:16-27,159-180,230-250`; `.codex/scripts/lib/governance-controls.mjs:61-72`; `.codex/tests/run-governance-fixtures.mjs:140-150,221-225`; `.codex/tests/run-remediation-4-contract-fixtures.mjs:57-64`.
7. **exact_failure_condition:** The production schema map omits the Domain approval schema. Hand-written checks cover provenance literals, Rule ID/version/core hash, and record chronology, but omit equality for human owner, source reference/hash, scope, effective time, and verification method across the Rule and approval record.
8. **reproducible_read_only_check:** Build a separately schema-valid Rule and approval record, then make owner, scope, effective time, source reference, and source hash disagree across them. The A4 production-path probe observed no binding error for those mismatches.
9. **minimal exploit or incorrect-GO construction:** File an authoritative approval artifact with internally valid fields and matching artifact bytes, while the Rule claims a different owner/source/scope/effective basis. The confirmed Rule can enter `applicable_rules` under false authority claims.
10. **why 50-case/54-case fixtures did not detect it:** R4-54 calls the incomplete helper using an approval object that omits many dedicated-schema fields. CASE-50 creates a richer artifact but expects GO without the production validator ever loading the dedicated schema or checking all cross-record equalities.
11. **existing positive fixture encoded an incorrect assumption:** Yes. R4-54 explicitly accepts a partial “valid procedural approval.” CASE-50 includes a placeholder source hash and treats current hand-written checks as full authority binding.
12. **classification:** `validator defect`, `schema defect`, `proof-provenance defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; it permits false Domain authority and an incorrect GO.
14. **minimum safe remediation:** Implement one `validateDomainApprovalBinding()` that starts with dedicated-schema validation, consumes a uniquely resolved typed artifact, and compares every Rule/Approval/Source field before chronology and content hash checks.
15. **new regression invariant:** Mutating any field on one side of the Rule/Approval/Source triple without the corresponding authorized update fails. Schema-loader deletion must be caught by mutation tests.
16. **risk of point-fix overfitting:** Critical. Adding individual equality checks to `validate-task.mjs` recreates the same fragmented path and will miss the next field.

## 12. A4-DOMAIN-APPROVAL-UNIQUENESS-002

1. **finding_id:** `A4-DOMAIN-APPROVAL-UNIQUENESS-002`
2. **reviewer:** Railway Domain Reviewer
3. **severity:** `HIGH` (blocking)
4. **title:** Domain approval global uniqueness check hides same-manifest duplicate IDs.
5. **affected_control_contract:** `approval_artifact_id` must resolve to exactly one authoritative approval record across all allowed manifests.
6. **affected_files_and_lines:** `.codex/scripts/validate-task.mjs:146-175,307-309`; `.codex/blueprints/schemas/artifact-manifest.schema.json:6`; `.codex/scripts/lib/governance-controls.mjs:32-40`.
7. **exact_failure_condition:** Same as Code finding 004: per-manifest `Array.find()` collapses multiple matches to one before the global count.
8. **reproducible_read_only_check:** Use two same-ID entries in one non-current manifest. The real duplicate count is two; production resolver visible count is one.
9. **minimal exploit or incorrect-GO construction:** Hide an ambiguous or forged approval after the first matching record and let the Domain confirmation path accept the first as globally unique.
10. **why 50-case/54-case fixtures did not detect it:** Domain positive CASE-50 has one artifact. Helper duplicate cases validate only one supplied array and never search another Task manifest.
11. **existing positive fixture encoded an incorrect assumption:** Yes, insofar as CASE-50’s single-artifact success was taken as evidence for a global resolver it never exercised.
12. **classification:** `reference-resolution defect`, `validator defect`, `fixture-oracle defect`.
13. **blocks_candidate_review_gate:** `true`; ambiguous approval authority can be accepted.
14. **minimum safe remediation:** Reuse the common `resolveUniqueArtifact()`; Domain code must not implement a special resolver.
15. **new regression invariant:** Same-manifest and cross-manifest collisions, identical or conflicting, all fail before authority evaluation; input ordering never changes the result.
16. **risk of point-fix overfitting:** Critical if repaired only in Domain confirmation. Waiver and typed-proof references need the same resolver semantics.

## Cross-review deduplication

- `A4-CODE-BLOCKER-004` and `A4-DOMAIN-APPROVAL-UNIQUENESS-002` are the same root cause and should be one resolver work package.
- `A4-CODE-BLOCKER-003`, `A4-CODE-BLOCKER-004`, and both Domain findings share a broader architectural cause: typed references are resolved by ad hoc code rather than a common unique resolver plus schema registry. Requirement semantics and Domain field binding remain separate validators on top of that shared infrastructure.
- `A4-CODE-BLOCKER-002` and the Domain binding finding are both proof-provenance failures, but they must remain separate domain-specific validators: commit proof and Rule authority have different input models and gate meanings.
- `SEC-A4-001` through `SEC-A4-004` belong to one scanner work package, but require two different convergence decisions: implement the promised canonicalization/header pipeline; narrow claims for entropy alphabet and extension/type mismatch unless those features are deliberately implemented.
- `A4-CODE-HIGH-006` is a cross-cutting fixture-oracle root cause that explains why every other cluster survived green automation. It is not a substitute for fixing those controls.
- `A4-CODE-HIGH-005` is related to policy lattice design but is not a path-scope issue; execution sensitivity needs its own structured classification model.

## Lifecycle control gap (not one of the twelve formal Reviewer findings)

`.codex/scripts/lib/lifecycle-projection.mjs:5-8` has a fixed two-file source list, and lines 33-42 hardcode the last review, `a4_started=false`, and all gate states. `.codex/governance/phase-status.json:18-28` therefore remained pre-A4 even after A4 was active and completed. The immediate cause is both a missing transition source and a projector designed around known fixed Task IDs; the current Task is not an input. Because A4 Reviewers recorded this as a limitation rather than a separate formal finding, it must not be added to or substituted for the twelve findings. It is nevertheless a required convergence item if Phase 1 continues to claim current lifecycle state.

## Why all fixtures passed

| Question | Evidence-based answer |
|---|---|
| Does the 50-case suite call the production validator? | Yes: `run-governance-fixtures.mjs:118-125` calls `validateTask()`. Its problem is the oracle and fixture model: CASE-01 expects GO for self-declared candidate/staged hashes and generic PASS evidence. |
| Does the 54-case suite call the production validator? | Mostly no. It imports helpers directly at line 1. Several are absent from the production import list at `validate-task.mjs:9`. |
| Does it bypass the formal schema loader? | Yes for waiver, candidate/staged proof, and Domain approval helper tests. The production loader’s closed map at `validate-task.mjs:16-27` omits these dedicated schemas. |
| Does helper logic differ from production logic? | Yes. Scope/proof/waiver/Domain/report helpers are tested in isolation; production partially duplicates or omits them. Cross-Task artifact resolution exists only in production and is not tested by the helper suite. |
| Does the oracle only check exit code? | The 50-case oracle checks exit, overall gate, and sometimes an error regex, but not typed proof provenance or the resolved artifact identity. The 54 suite checks booleans and a final count only. |
| Does a positive fixture encode untrusted proof? | Yes. CASE-01 uses constant hashes and generic PASS references. R4-10 accepts a partial waiver. R4-16/R4-17 accept underspecified proofs. R4-54 accepts an incomplete Domain approval. CASE-50 expects GO without dedicated schema application. |
| Are scanner fixtures testing the full canonicalization pipeline? | No. They directly call `scanText()` with selected representations. There is no differential suite for all equivalent encodings, header grammars, or declared finding classes. |
| Does concurrency test malicious child reports? | The parent validates reports against a trusted suite, and helper-level adversarial reports are tested in R4-26 through R4-35. The concurrency harness itself only spawns the trusted runner twice; it does not inject a child that emits truncated, duplicated, or forged output. |

The central corrective principle is therefore: a control does not count as implemented until its dedicated schema, resolver, and validator are on the authoritative production call graph and a production-path mutation test proves that removing the call fails the suite.
