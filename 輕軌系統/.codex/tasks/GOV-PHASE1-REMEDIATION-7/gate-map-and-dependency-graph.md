# Gate Map and Dependency Graph

`routeGovernanceGates()` is the sole result constructor.

| Gate | Inputs | Current state |
|---|---|---|
| Bootstrap Candidate Review | structural candidate evidence, exact scope, required evidence, formal review results, conditions, and review completion | NO-GO pending A7 |
| Bootstrap Human Commit | Candidate GO plus human exact-manifest approval, unchanged post-review baseline, Session B outcome, and final approval | NO-GO |
| Steady-State Governance Preparation | human commit plus bootstrap commit hash, manifest hash, and human attestation | DISABLED |
| Steady-State Governance Execution | steady preparation plus trusted validator provenance and enabled transition | DISABLED |
| Migration 320 Execution | Migration 320 Task evidence, proposed Rules, compatibility, human decision, and original blockers | NO-GO |

Candidate Review cannot consume final commit approval, Session B, Git stage, STAGED_EXACT, or Migration 320 business decisions. A Gate emits a status and its own reasons; no summary field or Task graph is an input.
