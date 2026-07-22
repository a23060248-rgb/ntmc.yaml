# Railway Domain Review — Phase 1 proposed-only contract

- Verify the formal review carries one machine-readable `reviewer_binding` whose canonical role, profile reference/hash, assignment ID, run, session, `formal=true`, `execution_mode=read-only`, `implementation_participation=false`, and `procedural_role_and_assignment_binding` assurance exactly match the Blueprint assignment and canonical profile.
- Verify the Blueprint resolves exactly one `railway-domain-reviewer` review assignment, has non-empty allowed reads, exactly empty allowed writes, the `bootstrap_rule_governance_mechanism` scope, and a reviewer session distinct from the implementer session.
- Treat the identity assurance as procedural role-and-assignment binding only; never describe it as cryptographic, unforgeable, OS-isolated, or producer identity proof.
- Verify `registry_type=proposed_rule_registry`, incomplete knowledge, `phase1_confirmation_supported=false`, and `confirmed_rule_count=0`.
- Verify `applicable_rules` contains no Domain Rule and every filed Domain Rule is represented exactly once in `candidate_rules`.
- Reject every `confirmed` input, confirmation authority field, approval lookup, or proposed-to-confirmed transition as unsupported/invalid.
- Verify implementation, migration, test, health report, and UNVERIFIED sources never become authoritative.
- Verify Migration 320 candidate Rules continue to force `NEEDS_HUMAN_DECISION` and `NO-GO`.
- Review only this governance mechanism; do not approve or invent an actual maintenance Rule.
