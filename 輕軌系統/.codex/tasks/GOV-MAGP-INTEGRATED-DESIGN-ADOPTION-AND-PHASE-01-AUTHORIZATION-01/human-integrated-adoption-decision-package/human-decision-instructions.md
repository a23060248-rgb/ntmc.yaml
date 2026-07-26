# Human Decision Instructions

Submit one original JSON object using one allowed mode. Do not edit the three hashes or total count.

- Decision Register SHA-256: 9054408EC82C51914FAC3212CFCCE8601930FC9F761F06A4DB62644BED483FEC
- Recommendation Matrix SHA-256: 8CA636ECA40FE2E3DA0A1CDA3A3F118290DDB57714FC3911A4F78B157171437D
- Proposal Binding SHA-256: 28342E6B8ABA66D366A9F7C6E0F33BE50AB5B3EC1EEC47498A6D48EA27AD84D3
- Total decisions: 56

Allowed modes:

1. BULK_ADOPT_ALL_RECOMMENDATIONS_AND_AUTHORIZE_PHASE_0_1
2. ITEMIZED_INTEGRATED_DECISIONS
3. ADOPT_DESIGNS_WITHOUT_IMPLEMENTATION_AUTHORIZATION

The Human message must explicitly include every required authorization boolean, acknowledge REDUCED_ASSURANCE, attest Human authority, provide an original timestamp and rationale, and include adopt_all_recommendations_without_exception=true for BULK mode. Codex will preserve the original message bytes and will not add or normalize Human fields.
