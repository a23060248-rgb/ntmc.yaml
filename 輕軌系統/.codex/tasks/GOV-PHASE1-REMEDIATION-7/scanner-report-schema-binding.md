# Scanner Report Schema Binding

The bootstrap scanner report is validated by both JSON Schema and production semantic recomputation. Acceptance requires exact equality for:

- report type, assurance, scanner identifier and version;
- contract, finding registry, canonicalization config, and binary oracle hashes;
- manifest hash, exact scanned file set, file count, and per-file hashes;
- registered finding classes and deterministic count/result claims;
- allowed negative authority claims;
- canonical payload hash.

The candidate generator and Task validator call the same report validator. The candidate record binds the scanner report hash and the same four scanner bundle hashes. A report field cannot satisfy its own claim without matching the loaded production bundle.
