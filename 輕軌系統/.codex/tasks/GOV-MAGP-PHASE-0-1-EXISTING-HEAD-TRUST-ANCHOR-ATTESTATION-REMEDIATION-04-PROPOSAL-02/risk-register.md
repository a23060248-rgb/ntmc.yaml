# Proposal-02 risk register

| ID | Severity | Risk | Control |
|---|---|---|---|
| R-01 | Critical | Review launch occurs with null or symbolic scope bindings. | Prohibit launch until the exact review-candidate manifest, entries, self rule, fixed policy Hashes, run/session, role/profile and scope are bound. |
| R-02 | High | The two 147 Hash contracts are conflated. | Use only `current_147_entries_jcs_sha256` for RFC 8785 JCS and keep the separately named line-manifest Hash. |
| R-03 | Critical | Scope Hash omits mutable or external evidence inputs. | Hash the complete materialized Scope Core containing all arrays, paths, hashes, states, contracts, gates, and prohibitions. |
| R-04 | High | Human external global-ignore readiness is promoted to 147-path PASS. | Retain prerequisite-only labels and require a same-freeze 147/147 Git-native result in the target Task. |
| R-05 | High | Proposal-01 or REMEDIATION-03 is rewritten. | Bind full frozen file sets and fail closed on any byte mismatch. |
| R-06 | High | Work acceptance substitutes for formal L3 review. | Preserve Work as an external post-freeze read-only layer only. |
| R-07 | Critical | Proposal preparation starts target execution or Git/product operations. | Require a separate Human approval binding Scope and Work Order Hashes; preserve all prohibitions. |
