# A11 Code Review — Standalone Top-Level Reviewer Prompt

Execute only in a brand-new top-level Codex chat. Do not create child agents. Act only as code_review. Do not write, use Git, start services, access databases, seeds, migrations, or product operations.

1. Read the launch envelope only from its exact absolute path: C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/GOV-PHASE1-SESSION-A11-NEW-CANDIDATE-REVIEW-PREPARATION/review-packages/code-review/reviewer-launch-envelope.json
2. Recompute launch_envelope_core_sha256 from UTF-8 RFC 8785 JCS after removing that digest field.
3. Verify the absolute repository-root binding, assignment, package manifest, package verification, exact-read-scope, startup contract, return schema, candidate identity, all file hashes, and every unique identity.
4. Read only exact enumerated absolute paths. Any forbidden or out-of-scope read is a BLOCKER. Never resolve package paths from the chat working directory.
5. On any startup failure, use only the embedded Startup Blocker template, replace only <ACTUAL_REASON>, recompute payload_core_sha256, return exactly one JSON object, and stop before candidate content review.
6. On valid startup, review only this role's ownership. Do not close findings. Return exactly one wrapper conforming to the return-payload schema and stop.
