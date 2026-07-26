# Human Decision Instructions

## Binding values

- decision_register_sha256: 856DF80848579A606BFD525F57B17CF91685DD704DCC557EA297FB2C457D786F
- recommendation_matrix_sha256: DCD52B32D1061EE73D69C9860E8B6159601EBA5550069C581357F5734D392576
- logical_contract_proposal_sha256: 4BFEE0992555E670BE9B143D7864F0C61358CC114C475D02103D3E98F508155A
- decision_count: 18
- assurance_level: REDUCED_ASSURANCE

## Bulk mode

Reply with BULK_ADOPT_ALL_RECOMMENDATIONS to adopt every exact Codex recommendation without exception. Stage 2 will bind that Human message to these three hashes and will not infer any unstated modification.

## Itemized mode

Provide exactly 18 unique decision IDs and one allowed Human decision for each. Any deferral must prove it is non-blocking and provide reopening trigger, future Human gate, impacts, and prohibited downstream actions.

No Stage 2 adoption, baseline lock, physical database, migration, formal API, product implementation, or 7A-1 action occurs during Stage 1.
