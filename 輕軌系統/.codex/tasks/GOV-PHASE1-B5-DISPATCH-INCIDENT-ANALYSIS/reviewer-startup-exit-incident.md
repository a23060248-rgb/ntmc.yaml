# Reviewer Startup and Exit Incident

## Evidence-backed result

B5 had no persisted Reviewer Startup Contract, Early-Failure Contract, or bounded Completion Contract. The dispatch plan required sequential closure, but did not define a pre-candidate scope-validation stage, a minimum early-failure payload, a response transport compatible with the read-only profile, or a mandatory exit deadline.

The formal Code Reviewer profile says `sandbox_mode = "read-only"` and `Do not ... modify files`. B5 nevertheless assigned four file-write paths to the Reviewer. The registered blueprint schema also defines Reviewer `allowed_write_paths` with a maximum of zero items. This is an output-channel contradiction in the task-local package.

The surviving B5 evidence proves that the Reviewer identified scope defects, produced zero of four required files, remained running, and was interrupted. It does not preserve the exact dispatched prompt, tool transcript, runtime error, or final Reviewer payload. Therefore the precise causal reason for the continued running state is **unknown_insufficient_evidence**; it must not be invented.

## Recommended early-failure contract

A fresh Reviewer must validate its scope before candidate-content review. On failure it returns this machine-readable payload through the read-only response channel and immediately exits:

```yaml
review_status: BLOCKER
failure_stage: PRE_REVIEW_SCOPE_VALIDATION
review_started: false
candidate_content_reviewed: false
finding_id: B5-DISPATCH-SCOPE-SATISFIABILITY-001
reason: <deterministic reason>
missing_or_conflicting_paths: []
forbidden_access_occurred: false
formal_outcome_assurance: procedural
```

The Root may only capture the exact returned bytes and their hash; it may not rewrite the outcome. Early failure is a procedural BLOCKER, never a technical PASS or a completed formal review. A timeout or missing payload is a dispatch blocker and must terminate the sequence.
