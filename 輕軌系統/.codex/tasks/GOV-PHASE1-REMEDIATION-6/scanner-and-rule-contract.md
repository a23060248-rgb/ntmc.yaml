# Scanner and Rule-Class Contract

## Deterministic scanner v4

Candidate text extensions are exactly `.md`, `.yaml`, `.yml`, `.json`, `.toml`, `.mjs`, and `.js`. The production pipeline applies raw UTF-8, JSON/backslash unescape, and bounded tolerant percent decoding before credential, URI, header, session, structured-token, high-entropy, private-key, and operational-path classification. Binary checks cover nine declared signatures, NUL/control content, and extension/magic mismatch.

The final exact manifest scan covered 81 files and produced zero findings. This means only `no_findings_within_declared_contract`; it does not mean global sensitive-data absence, repository-wide cleanliness, trusted producer identity, or OS isolation.

## Rule-class authority matrix

| `rule_class` | Allowed effect in Phase 1 bootstrap |
|---|---|
| `governance_control` | Procedural governance only |
| `technical_constraint` | Technical scope and safety constraints only |
| `railway_domain_candidate` | Candidate registry only; requires human decision and keeps Gate `NO-GO` |
| `railway_domain_authority` | Unsupported in bootstrap Phase 1 |

The Domain registry remains `proposed_rule_registry`, is not a complete knowledge base, has confirmed Rule count zero, and has an empty `applicable_rules` collection. Generic meta registries cannot carry railway business authority. No agent path promotes a candidate to confirmed authority.
