# A7 Finding Remediation Matrix

This matrix records implementation coverage only. Session A7 remains archived with its original outcomes; no finding is formally closed until a separately authorized A8 revalidates the 97-file candidate.

| Filed finding | Implemented control | Production evidence | Mutation evidence | Formal disposition |
|---|---|---|---|---|
| A7 Code BLOCKER: derived projection reverse-influence | `computeAuthoritativeGateMap()` computes the five-Gate map first; saved Gate fields and final-summary text are output-only consistency checks and cannot replace that map. | `PROD-GATE-01` through `PROD-GATE-08` | `MUT-GATE-01` through `MUT-GATE-08` | Ready for A8 revalidation; A7 unchanged |
| A7 Code BLOCKER: missing Session B and steady-state production mutations | Exact dependency matrix and production mutations cover final approval, Session B, trust anchor, Migration 320, calculated Gate, eligibility, preparation, and execution. | 34/34 production integration cases | 8/8 Gate mutations killed | Ready for A8 revalidation; A7 unchanged |
| A7 Security HIGH: nine binary magics not irreducible | One registry fixes MZ, ELF, ZIP, PDF, SQLite, PGDMP, OLE, PNG, and JPEG; the registry hash binds contract, report, and candidate. | 72/72 scanner production cases; every magic has a dedicated positive and safe-negative oracle | 45/45 per-magic mutations killed | Ready for A8 revalidation; A7 unchanged |
| A7 Railway Domain BLOCKER: malformed and unused dedicated Schema | One 15-Schema loader parses, identities, versions, compiles local references, hashes, and loads the dedicated Railway Domain Review Schema without fallback. | `PROD-SCHEMA-01` through `PROD-SCHEMA-06`; `PROD-DOMAIN-01` through `PROD-DOMAIN-05` | Domain-Schema skip and external-as-mechanism mutations killed | Ready for A8 revalidation; A7 unchanged |
| A5-SEC-HIGH-002 and A6 scanner finding | Contract v5 keeps declared canonicalization and content classes; exact binary recognition is now registry-driven and mutation-backed. The removed extension-versus-magic claim remains out of Phase 1. | 68/68 fixtures, 72/72 scanner production cases | Scanner 10/10 plus binary 45/45 mutations killed | Requires A8 Security revalidation |

No STAGED_EXACT proof, waiver authority, confirmed Domain Rule, dynamic business meta-rule authority, OS/container isolation, DLP, cryptographic identity, remote Git control, or Migration 320 execution authority was added.
