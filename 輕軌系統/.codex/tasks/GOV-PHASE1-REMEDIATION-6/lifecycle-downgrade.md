# Lifecycle Projection Downgrade

`phase-status.json` is now explicitly:

- `authority: informational`
- `generated: true`
- `may_be_stale: true`
- `used_as_gate_input: false`
- `used_as_scope_input: false`
- `used_as_approval_input: false`

The event log records R6 as `COMPLETED / READY_FOR_REVIEW`, while the last completed formal review remains A5 with outcome `BLOCKER`. The projection shows no active Task, A6 absent, Session B not authorized or started, and every Gate `NO-GO`.

Lifecycle data is a deterministic convenience projection. It cannot expand scope, provide approval chronology, establish proof provenance, or change a Gate result. Consumers must use the underlying Task, evidence, review, approval, and trust-anchor artifacts.
