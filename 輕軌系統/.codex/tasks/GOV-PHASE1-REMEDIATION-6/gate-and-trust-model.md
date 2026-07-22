# Gate and Bootstrap Trust Model

## Four distinct Gates

| Gate | Decision authority | Current state |
|---|---|---|
| Bootstrap Candidate Review Gate | Structural validator plus independent Reviewer findings | `NO-GO` |
| Bootstrap Human Commit Gate | Human governance owner only | `NO-GO` |
| Steady-State Governance Preparation Gate | Requires a human-attested bootstrap commit and exact manifest trust anchor | `NO-GO` |
| Steady-State Governance Execution Gate | Requires established steady-state trust plus exact staged evidence | `NO-GO` |

Migration 320 Execution Gate is separate and remains `NO-GO`.

## Trust boundary

- Governance mode is `bootstrap`.
- Validator provenance is `untrusted-workspace`.
- Proof assurance is `INTERNAL_CONSISTENCY_ONLY`.
- `git_trust_anchor_established` is false.
- Machine validation may prove internal consistency of the current exact candidate, but cannot approve a commit or establish its own producer identity.
- Transition to steady state requires a bootstrap commit SHA, the manifest SHA256, and a human attestation that binds them.

The validator always reports the human commit and both steady-state Gates as `NO-GO`; no Task field or generated summary can override them.
