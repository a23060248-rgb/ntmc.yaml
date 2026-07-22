# Scope and Bootstrap Proof Model

## Effective scope

`computeEffectiveScope()` intersects six mandatory operands:

1. Phase Policy
2. Task Intent
3. Classification
4. Blueprint
5. Role Policy
6. Agent Assignment

Every operand is required. A missing or empty operand grants no authority. Role Policy and Assignment are bound to one explicit actor role, or to a single uniquely derivable role; ambiguity fails closed. Declared changes and `validate-change-scope` use the same actor-bound scope result. Product and database writes remain prohibited.

Read-only overbreadth in a historical assignment remains a `NO-GO` reason while the effective intersection denies that path. Write overbreadth, actor mismatch, missing authority, and declared change escape are structural failures.

## Bootstrap candidate proof

The only retained proof type is `BOOTSTRAP_WORKSPACE_CANDIDATE` with assurance `INTERNAL_CONSISTENCY_ONLY`. It binds:

- Task ID
- exact manifest SHA256
- sorted included file-set SHA256
- included file count
- deterministic scanner report SHA256
- generation time
- validator version
- canonical record payload SHA256

It does not assert a trusted producer, a Git index state, a staged blob set, or human approval. Bootstrap `STAGED_EXACT` schemas and executable paths were removed. A future steady-state implementation must be separately authorized and anchored to an actual human-attested bootstrap commit.
