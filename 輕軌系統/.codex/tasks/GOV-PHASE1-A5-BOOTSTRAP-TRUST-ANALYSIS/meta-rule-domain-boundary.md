# Meta-rule and Railway Domain Boundary

Status: `PROPOSED MODEL / NOT IMPLEMENTED`

## Finding

The current generic Rule schema combines semantic category, lifecycle status, source shape, and authority fields in one open model. The loader then adds `registry=meta` or `registry=domain` according to directory location. Phase 1 proposed-only checks apply to `.codex/domain/index.yaml`, while the Blueprint `applicable_rules` loop accepts any `status=confirmed` Rule not labeled `registry=domain`.

This makes the directory name an authority discriminator. A `category=domain` Rule in `.codex/meta-rules` can carry a maintenance statement, prohibition, verification, and report source yet bypass the proposed-only registry.

## Required classification model

```yaml
rule_class:
  - governance_control
  - technical_constraint
  - railway_domain_candidate
  - railway_domain_authority
```

`rule_class` must be required, closed, and validated independently of filename, directory, `category`, or `status`. `category` may remain descriptive but cannot grant authority.

### Allowed-use matrix

| rule_class | Meaning | Phase 1 status | `applicable_rules` | `candidate_rules` | Permitted evidence/authority |
|---|---|---|---|---|---|
| `governance_control` | Constrains governance workflow, review, evidence, or Git procedure | Supported after explicit bootstrap allowlisting | Allowed only after typed class validation; bootstrap recommendation is static Phase Policy/AGENTS instead | No | Human-approved governance baseline; no business-state effect |
| `technical_constraint` | Narrows tool behavior such as path, scanner, or environment validation | Supported if its enforcement is implemented and tested | Allowed only to tool execution, never to maintenance/business decisions | No | Trusted governance baseline plus production enforcement |
| `railway_domain_candidate` | Proposed statement about maintenance, inventory, work orders, permissions, or migration compatibility | Supported as evidence-only | Never | Required; any L3 use forces Railway Domain `NEEDS_HUMAN_DECISION/NO-GO` | Reports/tests may support proposal but cannot confirm it |
| `railway_domain_authority` | Authoritative Railway maintenance/business decision | Unsupported in Phase 1 | Never | Never in Phase 1 | Future separately approved Domain authority model only |

## Semantic guardrails

Classification cannot rely solely on an author-selected `rule_class`. The validator must also inspect structural use:

- A Rule mentioning work-order states, P/C/R/J relationships, inventory issue/return, serialized parts, maintenance acceptance, permissions for completion/review/closure, or Migration 320 business readiness must be at least `railway_domain_candidate`.
- A Rule whose result changes a product/business Gate cannot be `governance_control` or `technical_constraint` merely because it is stored under `.codex/meta-rules`.
- `technical_constraint` may only narrow tool operations. It cannot provide a positive business conclusion.
- Any mismatch between declared class, content/use category, registry, or Blueprint position fails closed.
- Phase 1 rejects `railway_domain_authority` everywhere, including generic registries, Task-local artifacts, templates, and imported references.

## Namespace-independent validator invariants

1. Parse every Rule with one schema requiring `rule_class`.
2. Resolve each Rule ID uniquely across all registries before use.
3. Compute an effective class from declared class plus structural category/use constraints; a stricter inferred class wins.
4. Validate Rule placement and Blueprint use against the allowed-use matrix.
5. Reject all Railway Domain classes from `applicable_rules` in Phase 1.
6. Require every filed Railway Domain candidate to appear exactly once in the proposed registry and in `candidate_rules` when a Task depends on it.
7. Candidate use forces `NEEDS_HUMAN_DECISION/NO-GO`; no `status=confirmed` string can override this.
8. Reports, implementation, migrations, tests, and health evidence never become human Domain authority.
9. Generic governance controls cannot grant themselves authority through owner/source/status fields; authority comes from the bootstrap baseline or later trusted governance change process.

## Existing meta-rule disposition

The current candidate contains six files with eleven confirmed Rules. The table distinguishes semantic retention from dynamic Rule authority.

| Existing Rule | Proposed class | Semantic disposition | Bootstrap file/authority disposition | `applicable_rules` |
|---|---|---|---|---|
| GOV-SCOPE-001 | `governance_control` | Retain the product-root boundary | Consolidate into AGENTS.md/Phase Policy; do not depend on generic Rule loading | Prohibited until typed classes exist |
| GOV-ORCH-001 | `governance_control` | Retain only if the root-orchestrator convention is still required | Prefer AGENTS.md; remove duplicate dynamic Rule representation | Prohibited |
| GOV-GIT-001 | `governance_control` | Retain human-only Git prohibition | Consolidate into AGENTS.md/Phase Policy; explicitly procedural | Prohibited until typed classes exist |
| REV-INDEP-001 | `governance_control` | Retain clean-context/read-only review process | Consolidate into Reviewer workflow/AGENTS.md; preserve procedural limitation | Prohibited until typed classes exist |
| REV-L3-001 | `governance_control` | Retain new-session and human final approval requirement | Consolidate into L3 workflow/Phase Policy | Prohibited until typed classes exist |
| EVD-HASH-001 | `technical_constraint` | Retain exact path/hash verification; state that hash is not authority | Keep only if its production consumer and test remain in bootstrap | Prohibited as a generic Rule; enforce directly |
| EVD-CLAIM-001 | `governance_control` | Retain the rule that structural PASS is not business GO | Consolidate into Gate Policy and Reviewer workflow | Prohibited until typed classes exist |
| SEC-SECRET-001 | `governance_control` | Retain the prohibition on reading/disclosing credentials | Consolidate into AGENTS.md and scanner limitations | Prohibited until typed classes exist |
| CONF-001 | `governance_control` | Retain sanitized-governance-artifact requirement; deduplicate overlap with SEC-SECRET-001 | Consolidate into evidence/security policy | Prohibited until typed classes exist |
| DB-SAFE-001 | `technical_constraint` | Valid future tool constraint, but its product scripts are not wired | Remove from bootstrap candidate; reintroduce only with authorized environment integration | Prohibited |
| DB-OPS-001 | `technical_constraint` | Phase 1 already forbids DB/product execution, making this redundant as active authority | Remove from bootstrap candidate; retain prohibition in Phase Policy | Prohibited |

Preferred bootstrap action: remove all six `.codex/meta-rules/*.yaml` files from the dynamic authority surface. Preserve the selected control semantics in AGENTS.md, Phase Policy, Gate Policy, and Reviewer workflows. The `database.yaml` Rules should also leave the bootstrap candidate file set. If a future full-fix option retains meta-rule files, it must add `rule_class` and the allowed-use matrix before any Rule can be selected.

## Domain registry disposition

Retain `.codex/domain/index.yaml` only under these constraints:

```text
registry_type = proposed_rule_registry
is_complete_domain_knowledge_base = false
phase1_confirmation_supported = false
confirmed_rule_count = 0
applicable_rules = []
all filed Rules = proposed/candidate/unverified
owner and approval authority = absent
```

The current work-order, permission-separation, compatibility, and Migration 320 statements remain `railway_domain_candidate` regardless of whether their `category` currently says `domain` or `compatibility`. Compatibility does not make a business rollout condition authoritative.

## Required exploit and mutation coverage

- Put a `category=domain`, `rule_class=railway_domain_candidate`, `status=confirmed` Rule under every supported registry namespace; production validation must reject it from `applicable_rules`.
- Put report-, implementation-, migration-, test-, and document-sourced Railway Domain content under generic meta-rules; all must reject.
- Mutate the loader to label a Domain candidate `registry=meta`; the production test must still reject based on class/use.
- Mutate `validateTaskDomainSelection` to check only the Domain registry; the cross-namespace test must fail.
- Mutate the Blueprint loop from class-based rejection to `status=confirmed`; the test must fail.
- Verify governance controls continue to constrain governance only and cannot alter Railway business outcomes.

## Migration 320

This boundary does not approve any Migration 320 Rule. Candidate statements and five fixed evidence hashes remain supporting evidence only. Migration 320 continues as `NEEDS_HUMAN_DECISION/NO-GO` under all proposed meta-rule dispositions.
