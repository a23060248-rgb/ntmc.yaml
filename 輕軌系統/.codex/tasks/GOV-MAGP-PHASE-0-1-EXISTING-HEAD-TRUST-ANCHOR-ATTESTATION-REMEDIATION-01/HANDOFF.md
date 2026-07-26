# HANDOFF

## Current goal

Provide Work with a read-only review candidate for the Human-selected
`EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION` model.

## Candidate result

`READY_FOR_WORK_READ_ONLY_REVIEW`

## Exact bindings

- Task ID: `GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-01`
- Product root: `C:\Users\a2306\Desktop\code\ntmc.yaml\輕軌系統`
- HEAD: `22baa18784a081dd8c0d8a3ce177ba00363251de`
- Branch: `codex/precheck-template-maintenance`
- Anchor object type: `EXISTING_GIT_COMMIT_AND_TREE`
- HEAD tree: `c6f30a81ff45273aca851126160f2588937d2550`
- Exact paths: `147`
- Partition: `106 + 41`
- Source manifest SHA-256: `5CE80FC02491E66701D9D5573DB3123561FE41C74BABE7C0D0F5496404207685`
- Candidate manifest SHA-256: `2C01A85E3348B174B7BFB1F3F1D0A26CAB485423297252C7C7F4F35C65702E5D`
- Attestation binding SHA-256: `61FB873D2219F194A44CF7979D9AEC2F6717B28CC8314250251E42000B743247`

## What changed

- Added only this new Task-local directory.
- Proposed the existing commit and tree as a content-addressed trust-anchor
  candidate without creating a commit or claiming a tree delta.
- Added a production validator that recomputes bottom-level Git, file,
  dependency and historical evidence.
- Added eleven safety-rejection cases that invoke the production validator
  entry directly.

## Validation

- Production positive case: `PASS`
- Production direct-entry rejection cases:
  `PASS_11_OF_11`
- Historical Tasks and 147 candidates before/after: `MATCH`
- External reference content read: `false`
- Git mutation: `NO`

## Freeze and manifest

This HANDOFF is frozen before the final self-excluding Task artifact manifest.
The final manifest generator must run last and immediately invoke the production
validator against every manifest entry, byte count and SHA-256.

## Boundaries

The model selection is not Human trust-anchor adoption. Work review is not Human
adoption. No downstream Git mutation, 8A-0GC, product implementation,
source-authority adoption, or architecture reconciliation is authorized.

## Next step

Work performs an independent read-only review. If Work accepts the candidate,
Human may separately decide whether to adopt the exact existing-HEAD trust
anchor.
