# Test Strategy and Results

The final validation run executed production modules and recorded `overall_pass=true` in `validation-results.json`.

| Layer | Result | What it proves |
|---|---:|---|
| JavaScript syntax | 13/13 | Every changed generator, validator, governance library, and test runner parses. |
| Table-driven fixtures | 68/68 | Declared scope, identity, proof, scanner, binary, Rule-class, lifecycle, and path invariants hold. |
| Concurrency isolation | PASS | Unique run/case roots are owned by the runner; caller IDs are ignored. |
| Adversarial fixture reports | 4/4 rejected | Truncated, duplicate-ID, provenance-free forged PASS, and tampered-suite-hash reports fail closed. |
| Production-path integration | 20/20 | Formal schema loader, scope lattice, actor resolver, identity resolver, evidence validation, candidate binding, scanner, Rule-class, lifecycle, and Gate calculation are exercised together. |
| Production-module mutation | 10/10 killed | Removing the role operand, changing intersection to union, first-match resolution, self-declared proof, scanner classes, or Rule authority constraints causes the expected production case to fail. |
| Candidate manifest/hash/scan | PASS | 81 exact files match manifest SHA256; scanner v4 reports zero findings; candidate bindings match. |
| Migration 320 compatibility | PASS as NO-GO | Structural `VALID`, calculated `NO-GO`, exit 2, five external hashes unchanged. |

The oracle checks more than exit code: it asserts finding class or failed invariant, resolved identity count, actor binding, effective scope, proof assurance, resolved Rule authority, Gate results, and exact artifact hashes. Fixture reports are revalidated against a trusted case manifest and per-case artifact hash.

These results are implementer evidence only. They do not supersede A5 or replace an independent A6 review.
