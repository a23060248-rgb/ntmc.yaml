# Role permission and audit matrix

This document is the acceptance source for the six formal application roles. Frontend visibility is a convenience; the API policy is authoritative.

## Roles

| Role | Primary responsibility |
|---|---|
| `system_admin` | Full system administration |
| `maintenance_supervisor` | Maintenance approval, exceptions and supervision |
| `scheduler` | Schedule import, generation, change and publication |
| `technician` | C-order execution and P-order backfill |
| `warehouse_staff` | Inventory posting and turnaround logistics |
| `viewer` | Read-only query access |

## Mutation policies

| Policy | Admin | Supervisor | Scheduler | Technician | Warehouse | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Master data | Y | Y | N | N | N | N |
| Schedule import/generate/publish | Y | Y | Y | N | N | N |
| P package/first print | Y | Y | Y | N | N | N |
| P backfill/completion print | Y | Y | N | Y | N | N |
| C work order | Y | Y | N | Y | N | N |
| Inventory receipt/issue/return/transfer | Y | Y | N | N | Y | N |
| Work-order material consumption | Y | Y | N | Y | Y | N |
| Serialized asset master | Y | Y | N | N | Y | N |
| R-order general processing | Y | Y | N | Y | Y | N |
| R-order external send/accept/scrap | Y | Y | N | N | N | N |
| R-order return to stock | Y | Y | N | N | Y | N |
| Raw database administration | Y | N | N | N | N | N |

## Enforcement

- Backend policies are defined in `erp-api/src/config/rolePolicy.js` and enforced with `resolveAuth` plus `requireRoles`.
- Frontend policies are mirrored in `frontend/src/shared/auth/rolePolicy.ts` for navigation and action visibility.
- A missing or expired API session returns `401`.
- An authenticated role outside the mutation policy returns `403` before business validation.
- `/api/db` is restricted to `system_admin` because it exposes generic table mutation.

## Audit requirements

Every POST, PUT, PATCH and DELETE request writes an `operation_audit_log` row containing:

- actor, role and authentication adapter;
- request method, path and request ID;
- response status, IP address and user agent;
- sanitized request payload;
- route-provided before/after business summaries when available;
- a sanitized response summary for other mutations.

Credentials and tokens are redacted before persistence.

## Rehearsal acceptance

`verify-permission-audit-rehearsal.js` runs against `AUTH_MODE=api` and six database-backed bearer sessions. The accepted Phase 8 run verified 9 policy families, 54 role combinations, 28 forbidden cases, anonymous `401`, successful before/after summaries and denied-request auditing.
