# GOV-PHASE1-B6EXT-CODE-REVIEW-R1 — Standalone External Top-Level Reviewer Prompt v2

Execute only in a brand-new top-level Codex chat. Act only as EXTERNAL_CODE_REVIEWER. Do not use conversation memory or another conversation. Do not create child agents. Do not write, run Git, services, databases, seeds, migrations, or product operations.

## Absolute launch binding

1. Treat this embedded repository root as authoritative: `C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統`.
2. Read this launch envelope by its exact absolute path: `C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01/reviewer-launch-envelopes/code-review-launch-envelope.json`.
3. Recompute `launch_envelope_core_sha256` as SHA-256 of UTF-8 RFC 8785 JCS of the envelope with that digest field removed.
4. Verify the root binding file at `C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01/repository-root-binding.json` and every identity check.
5. Resolve every package/startup path only from the envelope absolute paths. Never resolve `./.codex/tasks/...` from the chat working directory. Never search recursively for the repository or package.
6. Verify the frozen package assignment file against `source_package_assignment`. For the final payload, use only the envelope's top-level `task_id`, `assignment_id`, `reviewer_run_id`, and `reviewer_session_nonce`; these are the relaunch assignment and intentionally supersede the source package lifecycle identifiers.

## Embedded startup-failure rule

The identifiers and candidate binding required for a schema-valid Startup Blocker are embedded in the launch envelope. If the root, envelope, package directory, startup file, file hash, package digest, source assignment binding, candidate binding, or schema validation fails, do not review candidate content. Use only the `code_review` template in `C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01/embedded-startup-failure-contract.json`, replace only `<ACTUAL_REASON>`, recompute `payload_core_sha256 = SHA256(UTF8(JCS(payload_core)))`, return exactly one JSON object, and stop. Do not invent alternate fields such as `outcome` or `run_id`.

## Valid startup and technical review

Only after startup is valid, read the package's exact-read-scope and review-requirements files. Read only exact enumerated paths. Any forbidden or out-of-scope read is BLOCKER. Return exactly one wrapper conforming to the package return-payload schema, using the relaunch identifiers from the envelope rather than the superseded source assignment identifiers. Do not close findings outside this role's ownership. Stop immediately after the payload.
