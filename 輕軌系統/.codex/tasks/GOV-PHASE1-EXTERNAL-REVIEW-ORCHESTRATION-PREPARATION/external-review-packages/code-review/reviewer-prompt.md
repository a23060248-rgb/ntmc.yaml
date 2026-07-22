# GOV-PHASE1-B6EXT-CODE-REVIEW — Standalone External Top-Level Reviewer Prompt

Execute this prompt only in a brand-new top-level Codex chat. This prompt is self-contained; do not attach or rely on any prior conversation, implementer conversation, hidden reasoning, or conversation memory.

## Non-negotiable execution boundary

- Act only as EXTERNAL_CODE_REVIEWER.
- Do not create child agents or subagents.
- Do not write to the repository or any task directory.
- Do not run Git, services, databases, seeds, migrations, or product operations.
- Read only exact paths enumerated in `.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION/external-review-packages/code-review/exact-read-scope.json`.
- Never read a parent directory, recursive glob, another Reviewer payload/chat, Aggregator output, Human Approval, collab, product directories, or Migration 320 implementation plan/handoff.
- Return exactly one JSON object conforming to `.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION/external-review-packages/code-review/return-payload.schema.json`; no Markdown fence, natural-language summary, second outcome, or later correction.
- After returning the payload, stop immediately.

## Startup, before candidate content review

1. Read `.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION/external-review-packages/code-review/assignment.json`, `package-manifest.json`, `package-verification.json`, `exact-read-scope.json`, `capability-artifact-matrix.json`, and `startup-contract.json`.
2. Recompute every core-file SHA-256 and recompute `package_core_sha256` as SHA-256 of UTF-8 RFC 8785 JCS over the package manifest object with `package_core_sha256` removed.
3. Verify assignment, role, run ID, session nonce, scope hash, package ID, candidate binding and every required source hash.
4. If any startup check fails, do not review candidate content. Return one schema-valid BLOCKER payload with `startup.status=STARTUP_BLOCKER`, `review_started=false`, `candidate_content_reviewed=false`, `completed=true`, and `mandatory_exit_requested=true`.

## Technical review

Read `.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION/external-review-packages/code-review/review-requirements.json` and perform every mandatory check using only the exact scope. Treat any out-of-scope access or forbidden read as BLOCKER. Record every actually read path in `access_log.allowed_paths_read`.

Finding closure ownership:
- B2-CODE-FORBIDDEN-READ-001

Do not close any finding you do not own. A closure disposition is valid only when the technical result is PASS and the access log has no forbidden or out-of-scope path.

## Final payload

Construct `payload_core` with the exact identifiers from `assignment.json` and the package digest from `package-manifest.json`. Compute `payload_core_sha256 = SHA-256(UTF-8(JCS(payload_core)))`. Return only:

{"payload_core":{...},"payload_core_sha256":"UPPERCASE_SHA256"}

Do not hash the wrapper. Do not provide a second conclusion. Stop immediately after the one payload.
