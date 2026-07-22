# Reviewer Scope Satisfiability Model

## Result

**UNSATISFIABLE — ROOT_PREFLIGHT_DEFECT**

A dispatchable exact scope must pass all of these machine checks before a child is created:

1. Expand the Reviewer's required capabilities into named evidence requirements.
2. Map every capability to at least one concrete repository-relative artifact.
3. Require every mapped artifact to exist, match its frozen hash, stay inside the approved root, and remain outside every forbidden rule.
4. Require all direct recomputation nodes to be readable; a summary cannot substitute when the review requires independent hash recomputation.
5. Reject pre-review reads of future Reviewer, QA, final-summary, after-baseline or human-approval outputs.
6. Validate task-intent, classification, blueprint, assignment, scope and freeze through their registered production contracts.
7. Validate the output transport against the formal role profile. A read-only Reviewer may return a machine-readable payload, but must not be assigned direct file writes unless the production contract permits them.

## B5 application

B5 would have failed steps 2, 3, 4, 6 and 7 before dispatch. The old R11 negative tests only proved absence of forbidden or broad paths; they did not prove that the scope could actually perform the assigned review.
