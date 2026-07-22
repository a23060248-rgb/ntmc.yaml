# Historical Artifact Integrity

The R6 baseline collector uses `lstat`, rejects symbolic links, records relative path, byte size, SHA256, and artifact type, and excludes the R6 Task itself. It does not rely on Git diff or tracking state.

Comparison result:

- Frozen historical Task files: 256 before, 256 after, all identical
- Migration 320 governance/evidence files: 13 before, 13 after, all identical
- Frozen-history added/deleted/modified: 0/0/0
- Migration 320 added/deleted/modified: 0/0/0
- Governance-source changes: 7 added, 6 deleted, 37 modified, as expected for R6

Machine-readable evidence is in `baseline-before.json`, `baseline-after.json`, and `baseline-comparison.json`.
