# GOV-PHASE1-B6EXT-CODE-FINDING-VERIFICATION-01

Formal result: VERIFIED_CANDIDATE_PRODUCTION_PATH_DEFECT

The Code R1 wrapper is schema-valid, its RFC 8785 JCS payload hash recomputes to B5FACA5E31B42DF1DB664008A9148CBB1386495CFF8EA33EF1534D56C0E91B46, and all launch-envelope bindings match. It is formally rejected only because four launch-mandated startup reads are absent from the package exact allowlist; this transport/access-contract defect does not decide the technical finding.

CASE-04 reproduced the technical defect through the authoritative validateTask production API: a required, manifest-referenced, schema-invalid nested Security evidence file received regenerated artifact hash, fixture freeze, candidate record and scanner report, yet structural validation remained VALID, Bootstrap Candidate Review Gate was GO, and exit code was 0.

Classification: CANDIDATE_PRODUCTION_PATH_DEFECT. The finding remains OPEN. Candidate remediation was not performed. The 103-file candidate and all protected historical Task trees remained byte-identical. External Security, Railway and Compatibility Reviewers and Aggregator remain paused. Session B Compatibility, Human Exact-Manifest eligibility and Bootstrap Human Commit remain NO-GO/not eligible.
