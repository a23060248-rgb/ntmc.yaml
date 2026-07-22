# GOV-M320-DRYRUN Implementation Plan

## Scope

Perform an evidence-only governance replay. Do not modify migration 320, `frontend`, `erp-api`, `db-design`, any product function, or any database.

## Ordered steps

1. Record the five existing evidence files and SHA256 values.
2. Confirm the recorded decision remains `NO-GO`.
3. Preserve the three blockers: formal-clone provenance, incomplete P-to-C values/attachments, and absent shortage/inventory direct links.
4. Record that all extracted Domain Rules remain `proposed`.
5. Project `traceability.yaml` into one deterministic `task-graph.json`.
6. Run static governance validation only.
7. Leave formal L3 review and final approval pending for a new Task／Session and humans.

## Evidence

Only the files listed in `artifact-manifest.yaml` may support this replay. Their recorded SHA256 must match current content.

## Stop conditions

Stop on missing evidence, hash mismatch, scope escape, product or database operation, changed `NO-GO`, hidden blocker, or fabricated formal-clone claim.

## Human gates

Scope is approved for the dry run. Formal review, merge, release, formal migration and any product change remain unapproved.
