# Migration 320 Integrity

The authoritative validator was rerun against `GOV-M320-DRYRUN` after the final candidate manifest was rebuilt.

- Structural status: `VALID`
- Calculated Gate: `NO-GO`
- Validator exit: 2
- Structural errors: 0
- Gate reasons: 41
- External evidence hashes: 5/5 unchanged
- Migration 320 Task/evidence baseline: 13/13 files byte-identical

The five unchanged external evidence artifact IDs are `ART-M320-COMPAT-REPORT`, `ART-M320-BEFORE-AFTER`, `ART-M320-ANOMALIES`, `ART-M320-CLOSURE`, and `ART-M320-NO-GO`. Exact expected and actual hashes are recorded in `validation-results.json`.

Candidate Domain Rules still require human decision; formal reviews, approvals, and bootstrap candidate evidence remain insufficient for execution. No original Migration 320 artifact or evidence was edited. Migration 320 Execution Gate remains `NO-GO`.
