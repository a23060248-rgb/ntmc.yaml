---
name: task-classification
description: Classify light-rail ERP governance, documentation, feature, bug-fix, review, permission, database, migration, work-order, inventory, audit, and release tasks as L1, L2, or L3. Use before planning or delegating any task under the light-rail system to select required agents, evidence, independent reviews, stop conditions, and human approval gates.
---

# Task Classification

Read `AGENTS.md`, authoritative `.codex/governance/phase-policy.yaml`, and informational `.codex/governance/phase-status.json` before classifying. Do not inspect sibling directories or `.env*` files. Never use phase-status as a Gate or scope authority.

## Produce the classification

1. Extract the objective, included and excluded paths, acceptance criteria, affected domain objects, data operations, permission effects, and deployment effects.
2. Evaluate L3 triggers first. If any L3 trigger applies, classify the task as L3 regardless of apparent size.
3. Otherwise evaluate L2. Use L1 only when no behavior, data, permission, API contract, or business rule changes.
4. Record the result in `.codex/tasks/<TASK-ID>/classification.yaml` using JSON-compatible YAML.
5. Record reasons, triggers, required agents, reviews, evidence, human gates, and stop conditions. Do not start implementation during classification.

## L1: lightweight

Use L1 only for documentation, copy, formatting, or visual-only adjustments that cannot affect behavior, permissions, persisted data, API contracts, audit records, or railway business rules.

Minimum flow: implementer, at least one `qa-readback` evidence/review record, and final summary. `required_reviews` and `evidence_required` may not be empty.

Escalate to L2 if the change touches executable code, validation, navigation, report calculations, API shapes, or user-visible workflow behavior.

## L2: standard

Use L2 for ordinary frontend, API, report, test, or non-core data-structure work without an L3 trigger.

Minimum flow: architect when cross-module, implementer, QA, clean-context Code Review, and conditional Security or Railway Domain Review selected from recorded triggers.

Require Security Review for authentication, authorization, sessions, attachments, external input, secrets, network calls, or sensitive data. Require Domain Review for P/C/R/J work orders, maintenance scheduling, inventory, serialized parts, vehicle positions, formal Word output, or role separation.

## L3: high risk

Classify as L3 when any of these applies:

- schema migration, seed, backfill, data clone, database connection, batch update or delete;
- permission model, authentication, session, audit, formal credential, or production configuration;
- work-order status machine, P/C/R/J relationship, merge, transfer, void, shortage, observation, completion, review, or close flow;
- serialized-part history, installation position, inventory accounting, reconciliation, issue, return, or rollback;
- backward compatibility, legacy-data transformation, release gate, formal deployment, or destructive command;
- missing or conflicting Domain Rule, unknown environment provenance, inability to verify rollback, or unresolved Reviewer blocker.

Minimum flow: Blueprint and human scope approval, architect, required implementers, QA, clean-context Code/Security/Railway Domain/Compatibility Reviews with unique run and session IDs, rollback/restore evidence or an explicit not-applicable reason, new Task or Session for final review, and final human approval. Agent merge and release are forbidden.

## Conservative rules

- When uncertain between two levels, choose the higher level and record why.
- A small diff can still be L3.
- Existing implementation, migration, tests, Agent output, or approval-shaped fields do not create Domain authority.
- Phase 1 supports only proposed, candidate, or unverified Domain Rules and never promotes them to confirmed.
- Put no Domain Rule in `blueprint.applicable_rules`; put proposed Domain Rules in `blueprint.candidate_rules` and require `NEEDS_HUMAN_DECISION`.
- Candidate Rules that affect an L3 decision require Railway Domain Review `NEEDS_HUMAN_DECISION` and calculated gate `NO-GO`.
- Every Blueprint must include Task-level `allowed_paths` and per-role `agent_assignments` that are subsets of `.codex/governance/agent-path-policy.yaml`.
- If scope includes paths outside `輕軌系統`, stop and request human correction.
- If the safe environment gate is absent, do not authorize API, tests, seed, migration, or database access.

## Required output fields

Include:

- `task_id`, `level`, `reasons`, `triggers`;
- `required_agents`, `required_reviews`, `parallel_allowed`;
- `evidence_required`, `human_approval`, `stop_conditions`;
- `scope.include`, `scope.exclude`;
- `classified_by` and `classification_status`.

Use `classification_status: proposed` until a human approves an L3 scope.
