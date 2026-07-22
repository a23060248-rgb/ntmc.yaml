# A6 Finding Remediation Matrix

| A6 finding | Production remediation | Regression invariant | R7 disposition |
|---|---|---|---|
| A6-CODE-BLOCKER-001 | `routeGovernanceGates()` computes Candidate Review without final approval, Session B, Git stage, STAGED_EXACT, or Migration 320 inputs. Human Commit is a separate human-exclusive result. | A clean transient fixture can produce Candidate GO while Human Commit stays NO-GO, both steady gates stay DISABLED, and Migration 320 stays NO-GO. A mutation that reintroduces final approval into Candidate is killed. | Implemented; formal closure remains exclusively for A7. |
| A6-SEC-HIGH-001 | The scanner report has a dedicated schema and `validateBootstrapScanReport()` recomputes the approved contract bundle, manifest, exact file set, count, claims, result, finding registry, and canonical payload before candidate binding. | Wrong report ID/version/hash/registry/claim/file-set/count/manifest/finding/payload reports are rejected; trust-claim and skipped-binding mutations are killed. | Implemented; formal closure remains exclusively for A7. |
| A6-SEC-HIGH-002 | The scanner contract is split into exact registry, canonicalization, binary-oracle, and contract-matrix inputs. Binary output is narrowed to five registered classes and nine magic signatures; the earlier extension/magic mismatch claim is removed. | Every registered class and every magic has a production positive and safe-negative case; missing matrix coverage and binary-oracle mutations fail. | Implemented; formal closure remains exclusively for A7. |

The A6 Reviewer outcome remains archived as BLOCKER. This matrix is implementation traceability, not Reviewer revalidation.
