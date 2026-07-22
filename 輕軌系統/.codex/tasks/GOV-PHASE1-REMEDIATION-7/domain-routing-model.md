# Domain Routing Model

`routeDomainReview()` accepts a typed Railway review with `review_scope=bootstrap_rule_governance_mechanism`.

- `governance_mechanism_outcome` affects only Bootstrap Candidate Review.
- Each typed external decision has `decision_scope=migration_320` and affects only Migration 320 Execution.
- An external Migration 320 decision cannot approve or block the bootstrap mechanism result.
- Proposed Railway Rules remain candidates only and cannot become applicable authority through this router.

Production tests reject an external decision routed as a mechanism result and prove that mechanism PASS does not change Migration 320 NO-GO. No actual Railway business Rule is approved by R7.
