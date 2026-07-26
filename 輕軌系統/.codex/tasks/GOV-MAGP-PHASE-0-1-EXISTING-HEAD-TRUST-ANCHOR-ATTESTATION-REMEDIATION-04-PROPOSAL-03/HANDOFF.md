# TASK_HANDOFF_READY

TASK_ID: `GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-04-PROPOSAL-03`

HANDOFF_PATH: `C:\Users\a2306\Desktop\code\ntmc.yaml\輕軌系統\.codex\tasks\GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-04-PROPOSAL-03\HANDOFF.md`

CANDIDATE_VERDICT: `READY_FOR_INDEPENDENT_WORK_VALIDATION`

## Exact bindings

- HEAD: `f4c293467a9e3249631574947de8bdc93b18a51c`
- Branch: `codex/precheck-template-maintenance`
- Tree: `5860873bc183cfd915d09815f0bc52a471499cfa`
- Proposal-02 manifest external/internal: `29DED06B1D5F21F96940425BFD37821F344FD517FF81FDECFEABC9BAE84861A7` / `4B8BE553B86E300010F1A3939A580953DF75603CBF4EE99D4456DFAE33D4A1BE`
- Proposal-01 manifest external/internal: `213E399C6AF9F4DF6DF1B1169DE9F46B27FD72DD5311349E32CC76A36F0469F4` / `8125972A74D78548980807E96E4263A8CC0FD9419F9B5E426996A2182123744F`
- REMEDIATION-03 manifest external/internal: `571CF4209CE81C5D05AF16B32B75C39F3715C9FB21751770460A8759C4474188` / `5CDAD71141605A905B91FAC72599EEA7E7A737FA21F505F87C465A4A8F78E957`
- Current 147 line-manifest SHA-256: `2C01A85E3348B174B7BFB1F3F1D0A26CAB485423297252C7C7F4F35C65702E5D`
- Current 147 entries JCS SHA-256: `3619690515D3AA4F9675BAB5783664447A58426D76F352521914BBE82E1130FD`
- Proposal-02 Scope Hash: `852EB9B5FEE08ED5B63BB1B7B2A7486CC16564994904CF0F30B5145C57AEA1EB`
- Proposal-02 Work Order exact-byte SHA-256: `A84CD484810741B0B1EF037B8864BB247491292B50FF12AF272E5A87499BA434`

## B-01 candidate correction

`procedural_role_and_assignment_binding` is resolved as the fixed value of `reviewer_binding.reviewer_identity_assurance`, not a standalone field. The canonical Blueprint Railway assignment has exactly the nine schema fields and resolves one `railway-domain-reviewer`. A future actual formal review must create a fully populated `reviewer_binding` only after exact run, session, assignment and review scope exist.

Positive in-memory contract validation reached zero schema and production-validator issues. The deprecated assurance value was rejected through both contracts. No actual formal record was created and no review was launched.

## Package and actions

- Expected frozen package: 14 physical files / 13 manifest entries, manifest self-excluded.
- Files created: 14.
- Files modified: 0.
- Git mutation: `NOT_CLAIMED_BEYOND_PRESERVED_EXPLICIT_PATHSPEC_AND_BINDING_EVIDENCE`.
- Actual REMEDIATION-04 created: false.
- Formal reviews launched: false.
- 43-case cycle run: false.
- Trust Anchor adopted: false.

## Commands run

- Exact-root read-only reads of the Human-authorized authority sources and frozen Task files.
- `git -c safe.directory=C:/Users/a2306/Desktop/code/ntmc.yaml -C <exact-git-root> rev-parse HEAD`
- `git -c safe.directory=C:/Users/a2306/Desktop/code/ntmc.yaml -C <exact-git-root> branch --show-current`
- `git -c safe.directory=C:/Users/a2306/Desktop/code/ntmc.yaml -C <exact-git-root> rev-parse HEAD^{tree}`
- Chunked `ls-tree`, `ls-files --stage`, `diff`, `diff --cached`, `check-attr`, and Task-scoped `status` calls using explicit exact pathspecs.
- In-memory Node checks for byte/Hash/JCS recomputation, JSON parsing, exact field sets, dedicated schema contracts, and the production `validateFormalRailwayReviewerBinding` entrypoint.
- `apply_patch` writes limited to the exact Proposal-03 Task path.

The final Task artifact manifest Hashes are intentionally returned in the external post-freeze handoff message; embedding them here would violate the self-exclusion and no-post-manifest-write freeze contract.

## Unverified items and residual risks

- Independent Work read-only validation has not run.
- Human acceptance of Proposal-03 has not occurred.
- Actual target scope, run/session identities, review record and formal review return do not exist.
- Agent-context global-ignore access still emits a permission warning; it was recorded and not treated as full ignore evidence.
- No repository-wide Git mutation absence claim is made.

## Next gate

Work must independently validate this frozen package before any Human proposal decision.

## Prohibited next actions

Do not modify Proposal-03 after its final manifest, modify any predecessor, create or execute REMEDIATION-04, launch formal reviews, run the 43 cases, adopt the Trust Anchor, mutate Git, run 8A-0GC, implement product code, or perform migration, seed, database, API, service, or product tests.
