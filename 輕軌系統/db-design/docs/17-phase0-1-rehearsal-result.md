# Phase 0-1 PostgreSQL rehearsal result

Execution date: 2026-07-15 (Asia/Taipei)

## Scope

This run only verified the PostgreSQL environment, a disposable fresh database, all 28 business migrations, migration rerun behavior, custom-format backup, restore, and ledger reconciliation. The formal database was not migrated or seeded.

## PostgreSQL environment

| Item | Result |
|---|---|
| Installed PostgreSQL service | PostgreSQL 18, Windows service `postgresql-x64-18` |
| Standard service port | `5432` |
| Standard service data directory | `C:\Program Files\PostgreSQL\18\data` |
| Standard authentication | Local TCP requires SCRAM password; no formal credential was used |
| Rehearsal port | `5433` |
| Rehearsal data directory | `C:\Users\a2306\Desktop\code\ntmc.yaml\.runtime\pgdata` |
| Rehearsal database role | `postgres` |
| Rehearsal client tools | pgAdmin PostgreSQL 18.4 `psql`, `pg_dump`, and `pg_restore` |

The project rehearsal cluster was started successfully and intentionally remains running on `127.0.0.1:5433` for the requested rehearsal work.

## Fresh database and migrations

| Item | Result |
|---|---|
| Safety source database | `ntmc_erp_rehearsal_phase01_20260715` |
| Fresh database | `ntmc_erp_rehearsal_fresh_20260714180902` |
| Restored database | `ntmc_erp_rehearsal_restore_20260714180902` |
| Manifest migrations | 28 |
| Ledger rows | 29 = bootstrap 1 + business migrations 28 |
| First run | 20 `APPLIED`, 9 `BASELINED` |
| Second run | 28 `VERIFIED`, 0 `APPLIED` |
| Ledger digest, fresh | `15239f933a48ccb6d375e77c6b12a558` |
| Ledger digest, restore | `15239f933a48ccb6d375e77c6b12a558` |

The restored ledger was also compared row by row using migration ID, sequence, file name, file SHA256, and status. It exactly matches the fresh database.

## Backup and restore

| Item | Result |
|---|---|
| Dump format | PostgreSQL custom format (`pg_dump -Fc`) |
| Dump path | `輕軌系統/.local-rehearsal/fresh-session-20260714180902.dump` |
| Dump bytes | 585,143 |
| Dump SHA256 | `4DB0AAF0B3B9FC948A059573516E85AEDB428A8C8B1B6DFC1D56575426C30AE9` |
| Restore result | PASS |
| Fresh/restore summary | Exact match |
| Fresh/restore ledger | Exact match |

The compared data summary includes ledger rows, equipment-alias table/view existence, rehearsal users, work orders, materials, assets, and inventory transactions.

## Seed corrections required by the fresh run

The first fresh run exposed that PM templates were created as published before their structural resources were seeded. Published templates are intentionally immutable, so material and attachment inserts were rejected. The rehearsal bootstrap now:

1. Creates P1-P4 as draft revisions.
2. Loads materials, instruments, WI, and the approved P1 profile.
3. Loads 152 P1 check items in 13 sections.
4. Creates and publishes the two P1 attachment-library versions and binds them to P1.
5. Publishes only templates that contain active check items.

Result: P1 is `PUBLISHED` with 152 items. P2, P3, and P4 remain `DRAFT` because equivalent approved check-item profiles have not yet been supplied. This avoids publishing incomplete templates.

## API and automated verification

- API syntax check: PASS.
- API tests: 58/58 PASS.
- Frontend tests: 8/8 PASS.
- TypeScript and Vite single-file build: PASS.
- `frontend/dist/index.html`: 659,451 bytes.
- Main rehearsal API checks: 11/11 returned HTTP 200, including health, DB health, dashboard, work orders, precheck, inventory, turnaround, master data, equipment aliases, reports, and session login.
- `git diff --check`: PASS (existing line-ending and global Git-ignore permission warnings only).
- `git diff --cached --check`: PASS.
- Legacy HTML SHA256 remains `46647B38352C3B543E7A78FE63B801008D237AF49C88F5E0A2557AF7DBFB2E73`.

## Notes and boundaries

- The formal/local `ntmc_erp` database was not connected to for migration or seed work.
- The standard PostgreSQL 18 service on port 5432 was inspected only through service/configuration metadata; no password was requested or used.
- Failed disposable fresh databases from earlier attempts were retained as evidence and were not deleted during this run.
- No formal database migration was applied.

