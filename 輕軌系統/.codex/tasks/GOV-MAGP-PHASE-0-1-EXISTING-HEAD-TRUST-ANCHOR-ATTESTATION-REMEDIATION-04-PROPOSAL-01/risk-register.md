# Proposal-01 risk register

| ID | Severity | Risk | Required control |
|---|---|---|---|
| R-01 | Critical | Human-supplied global-ignore readiness is mistaken for a complete 147-path effective-ignore result. | Label it prerequisite-only and require 147/147 same-freeze Git-native outcomes in REMEDIATION-04. |
| R-02 | High | A historical Proposal-02 or REMEDIATION-03 value is promoted as current PASS evidence. | Use Proposal-02 only as path-set input; recompute current HEAD/tree/index/bytes and rerun all 43 cases. |
| R-03 | High | Noncanonical producer or reviewer roles invalidate the machine-readable scope model. | Permit only architect, qa-engineer, documentation-engineer as producers and the four canonical reviewer roles. |
| R-04 | High | Railway Domain Review lacks exact procedural role/profile/assignment binding. | Bind exactly one Blueprint assignment, canonical profile and manifest hashes, unique run/session, read-only mode, empty writes, and no implementation participation. |
| R-05 | High | A precisely scoped Git observation is overstated as repository-wide no-mutation proof. | State every pathspec and command boundary; make no broader claim. |
| R-06 | High | Stage A inputs change after some cases run, producing mixed-time evidence. | Freeze the subject once; any change forces all 43 cases and production observation to rerun. |
| R-07 | High | Final manifest and HANDOFF refer to different package states. | Complete all artifacts first, generate manifest last, then perform read-only checks only. |
| R-08 | High | Work review is treated as a canonical actor role or as formal review completion. | Keep Work as an external independent read-only acceptance layer and leave formal review_completion `NOT_STARTED` until all four reviews complete. |
| R-09 | Medium | Human authorization hash is treated as cryptographic Human identity. | Record it as an exact Human-supplied binding only; do not claim unforgeable identity. |
| R-10 | Critical | Proposal preparation is mistaken for authorization to create or execute REMEDIATION-04. | Require a separate Human decision binding the exact Scope Hash and Work Order Hash. |

Residual assurance is limited to Task-local proposal consistency. This proposal does not adopt a Trust Anchor or authorize downstream execution.
