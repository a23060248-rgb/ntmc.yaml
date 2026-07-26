Codex, act only as EXTERNAL_SCOPE_CONTAMINATION_REVIEWER for review generation R1.

This review must run in a BRAND_NEW_TOP_LEVEL_CODEX_CHAT. Do not use this preparation conversation, any other Reviewer conversation or payload, implementation conversation, memory, subagents, Git, network, services, databases, seeds, migrations, .env, repository search, globs, recursive discovery, or cwd inference. Do not write any repository or source file.

MANDATORY FIRST READ:
C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01/review-packages/scope-contamination-review/absolute-launch-envelope.json

Validate the launch envelope RFC 8785 JCS hash, then the exact package, role, generation, assignment, run, session nonce, package manifest, frozen review target, source binding, and exact-read-scope bindings. Read only paths explicitly listed in exact-read-scope.json and honor every content_scope limit. Any invalid binding, forbidden read, or out-of-scope read is a BLOCKER.

Review only the requirements assigned to EXTERNAL_SCOPE_CONTAMINATION_REVIEWER. Do not perform another Reviewer's role, approve source authority, approve MAGP architecture, start Architecture Reconciliation, create a Core Object Library, run the Aggregator, or alter evidence.

Return exactly one wrapper conforming to return-payload.schema.json:
{"payload_core":{...},"payload_core_sha256":"<RFC8785_JCS_SHA256_OF_PAYLOAD_CORE>"}

The final response must itself be RFC 8785 JCS canonical JSON, contain exactly those two top-level fields, set mandatory_exit_requested=true, and contain no Markdown or natural language outside the JSON. If startup is invalid, use embedded-startup-blocker-template.json and stop before substantive review.
