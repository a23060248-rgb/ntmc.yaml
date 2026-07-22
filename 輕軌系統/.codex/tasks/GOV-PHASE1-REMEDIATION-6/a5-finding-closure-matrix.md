# A5 Finding Closure Matrix

This is remediation evidence. It does not alter A5, does not declare formal closure, and requires fresh independent A6 revalidation.

| A5 finding | Implemented control | Production-path regression evidence | Implementer status |
|---|---|---|---|
| `A5-CODE-BLOCKER-001` | `resolveActorScope()` requires one exact actor and intersects Phase Policy, Intent, Classification, Blueprint, Role Policy, and Assignment; missing or empty authority fails closed. | Actor omission/ambiguity, missing operand, empty operand, and intersection-to-union cases in the 68-case suite, 20 production cases, and mutation set. | Ready for independent revalidation |
| `A5-CODE-BLOCKER-002` | Removed bootstrap `STAGED_EXACT`, caller proof booleans, producer identity, and generic final prerequisites. Bootstrap record is manifest-bound and `INTERNAL_CONSISTENCY_ONLY`; human commit is always outside validator authority. | Self-declared producer, staged field, old prerequisite, tampered report, and forged Gate production cases. | Ready for independent revalidation |
| `A5-CODE-HIGH-003` | Replaced helper-only oracle with production entrypoints, exact invariant identity, artifact hashes, schema-loader checks, and mutations against production modules. | 68/68 fixtures, 20/20 production integration, 10/10 mutations killed, adversarial child reports rejected. | Ready for independent revalidation |
| `A5-CODE-MEDIUM-004` | Lifecycle contract is narrowed to informational projection and explicitly prohibited as Gate, scope, or approval input. | Lifecycle-authority production case and phase-status schema assertions. | Ready for independent revalidation |
| `A5-SEC-HIGH-001` | Bounded tolerant percent decoding preserves independently detectable content while reporting malformed mixed/invalid encodings. | Mixed malformed-percent plus credential-class production case and canonicalization fixtures. | Ready for independent revalidation |
| `A5-SEC-HIGH-002` | Contract v4 declares and tests quoted headers, URL-safe entropy, extension policy, nine binary signatures, NUL/control bytes, and extension/magic mismatch. | Header/binary matrix fixtures, production scanner cases, and scanner mutations. | Ready for independent revalidation |
| `A5-DOMAIN-META-REGISTRY-BYPASS-001` | Required `rule_class` and `authority_effect`; generic meta registries cannot carry railway business authority, and Domain candidates can only appear in `candidate_rules`. | Generic meta business bypass, missing class, duplicate Rule, and Domain-applicable production cases plus mutations. | Ready for independent revalidation |

A5 remains `ARCHIVED / BLOCKER` until a distinct formal review process evaluates this new candidate.
