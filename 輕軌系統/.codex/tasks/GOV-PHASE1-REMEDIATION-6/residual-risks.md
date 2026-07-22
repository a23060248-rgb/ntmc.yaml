# Residual Risks

1. The validator and scanner remain mutable, uncommitted workspace artifacts. Their output proves internal consistency only and cannot establish trusted producer provenance.
2. No Git trust anchor exists. A human must later bind an exact bootstrap commit SHA to the exact manifest SHA256 before steady-state preparation can be considered.
3. The Bootstrap Human Commit Gate is human-exclusive. This Task has no authority to stage, commit, push, merge, or release.
4. Scanner v4 is deterministic only for its declared candidate extensions, canonicalization bounds, signatures, and finding classes. It is not DLP, OS isolation, repository-global scanning, or proof that no sensitive data exists elsewhere.
5. Lifecycle projection is informational and may be stale. It cannot authorize a Gate, scope, approval, or transition.
6. Railway Domain knowledge remains proposed and unverified; no confirmed business Rule exists and no agent may promote one.
7. A6 has not independently tested the new implementation. A5 remains `ARCHIVED / BLOCKER` and cannot be overwritten by implementer evidence.
8. Repository-wide Git state, index state, staged blobs, branches, remote controls, and branch protection were not inspected or mutated.

Every risk that could authorize a commit, steady-state execution, or Migration 320 is retained as a `NO-GO` condition rather than deferred as harmless.
