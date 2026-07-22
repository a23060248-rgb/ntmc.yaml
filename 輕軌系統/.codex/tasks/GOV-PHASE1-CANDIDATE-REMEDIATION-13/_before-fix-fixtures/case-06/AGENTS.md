# 輕軌系統 Codex 治理規則

本檔適用於 `${PRODUCT_ROOT}`（Git 中的 `輕軌系統/`）全部內容；其上一層 Git 容器以 `${GIT_ROOT}` 表示。根 Codex Task 是 Meta Governance Orchestrator；不要建立或模擬 `orchestrator.toml`。

## 唯一工作範圍

- 唯一產品與治理根目錄是本目錄 `輕軌系統`。
- Agent 預設只能在 `${GIT_ROOT}` 執行唯讀 Git `status`、`diff`、`diff --cached` 與 `ls-files`。
- 不得盤點、搜尋、測試、修改或引用 sibling directories、舊系統、原型、Legacy HTML 或備份。
- 唯讀 Git 命令必須使用明確 pathspec，只限 `輕軌系統/AGENTS.md`、`輕軌系統/.codex/**`、`輕軌系統/.agents/**`，或當次 Task 明文核准的輕軌系統內路徑。
- 禁止 `git add .`、`git add -A`、無 pathspec 的批次修改，以及對其他目錄執行 restore、reset、clean、delete。
- branch 建立／切換、commit、merge、rebase、worktree 建立／刪除、push、tag、reset、restore、clean 與 stash 均為人工專屬操作；只有使用者在當次 Task 明確授權時才可由 Agent 執行。
- `.codex/scripts/validate-change-scope.mjs` 只能證明 staged、unstaged、untracked 檔案範圍；它不能限制或證明 branch、commit、worktree 與遠端保護狀態。
- 只有此 deterministic scope validator 可在人工要求提交前檢查時列舉 repository-wide 變更檔名，以偵測產品根外變更；它不得開啟或引用 sibling 內容。

## Phase 狀態與產品鎖

- 先讀 `.codex/governance/phase-status.json`。
- `phase = "phase1_governance_only"` 時，只能修改 `AGENTS.md`、`.codex/**`、`.agents/**` 與本階段明列的治理文件。
- 此狀態下禁止修改 `frontend/**`、`erp-api/**`、`db-design/**`、migration 與產品功能。
- `.codex/governance/phase-policy.yaml` 是 Phase scope 的唯一權威來源；`phase-status.json` 是 deterministic 產生的非權威資訊投影，不得作為 Gate、scope、review 或 approval 輸入。
- Phase 1 目前為 `governance_mode = bootstrap`：workspace validator 本身未提交且不受信任，只能產生 `INTERNAL_CONSISTENCY_ONLY` 證據；Git trust anchor 尚不存在。
- Phase Policy 只能依明確人工核准更新；Agent 不得自行解除產品鎖。

## 任務開始順序

1. 讀本檔與 `.codex/governance/phase-status.json`。
2. 使用 `$task-classification` 判定 L1、L2 或 L3。
3. 建立或驗證 `.codex/tasks/<TASK-ID>/` 工件。
4. 只選必要 Agent；根 Task 直接派工，子 Agent 不得再次派工。
5. 實作前確認 scope、Rule IDs、證據、停止條件與 HITL gate。

## Agent 與執行模型

- `[agents] max_depth = 1`、`max_threads = 4`。
- 根 Task 負責分類、Blueprint、規則選擇、派工、工件完整性與人工閘門，不取代人類 Owner。
- 10 個 Custom Agent 按任務需要啟用；不得為了形式讓每個任務走全部角色。
- 每個 Task Blueprint 必須依 `.codex/governance/agent-path-policy.yaml` 指定 machine-readable `allowed_paths` 與逐角色 assignment；此政策是提交前 fail-closed scope gate，不是 OS sandbox。
- 同一 API contract、狀態機或 migration 的寫入工作必須循序執行。
- 平行工作只限檔案範圍不重疊的任務，或 read-only 探索、QA 與分析。

## 環境與資料庫安全

- 禁止讀取、顯示、複製或修改既有 `.env`、`.env.test` 與任何 `.env*` 內容。
- 不得把 `.env*` 加入 `.worktreeinclude`、任務工件、log、commit 或 PR。
- Agent 不得取得正式環境憑證或正式資料庫連線字串。
- Agent DB profile 只允許 loopback host、PostgreSQL 5433、`ntmc_erp_rehearsal_*` 與 `DATABASE_SAFETY_MODE=rehearsal`。
- Agent 專用流程不得載入一般 `.env`；使用 `.codex/environment/agent-safe-profile.json` 與 `.codex/scripts/validate-agent-environment.mjs`。
- safe profile 只驗證無憑證 JSON profile；不構成 runtime command、PowerShell、`cmd.exe`、外部 executable、parent permission override 或 OS 級隔離。
- 啟動 API、產品測試、seed、migration 或任何 DB 連線前，必須先取得本次 Task 的人工授權，並留下安全 gate PASS 證據。
- Phase 1 治理建置期間，上述產品與 DB 操作全部禁止。

## Domain Rule 治理

- 從程式、migration、測試或既有文件萃取的規則一律只能標記 `proposed`、`candidate` 或 `unverified`。
- Phase 1 不支援 Domain Rule promotion；任何 `confirmed` Domain Rule 輸入都是 unsupported/invalid，不得進入權威集合或觸發 approval lookup。
- implementation、migration 與 test evidence 只是證據，不單獨構成正式業務依據。
- Phase 1 的 `applicable_rules` 不得包含任何 Domain Rule；所有候選 Domain Rule 只能存在於 `candidate_rules`，Railway Domain Reviewer 必須輸出 `NEEDS_HUMAN_DECISION`。
- 完整 human approval promotion 是未來能力，不得以殘留 schema、fixture、helper 或 Agent 自填 authority 欄位重新啟用。
- Agent 不得補完未定義的維修、權限、庫存或稽核規則。

## 審查獨立性

- 實作者不得擔任同一 Task 的正式 Reviewer。
- Reviewer 必須使用乾淨 Agent thread，只讀取 Task artifacts、base/head diff、handoff、test evidence、Rule IDs 與 checklist。
- Reviewer 不得取得實作者完整對話或未落檔辯護。
- Reviewer 只能輸出 `PASS`、`PASS_WITH_CONDITIONS`、`BLOCKER` 或 `NEEDS_HUMAN_DECISION`。
- Reviewer 不得修改產品程式後自行宣告通過。
- 正式 typed Railway Domain Review 必須以 `procedural_role_and_assignment_binding` 綁定 Blueprint 中唯一的 `review_assignments`、canonical `railway-domain-reviewer` profile 與 manifest profile hash；role、profile、scope、run、session、read-only、空 write paths 或未參與 implementation 任一不一致即 structural invalid。此綁定不構成 cryptographic 或 unforgeable identity。
- L3 最終審查必須使用全新 Codex Task／Session，並由人工核准；Agent 不得自行 merge 或 release。

## Migration 320 示範鎖

- `GOV-M320-DRYRUN` 僅是 L3 evidence-only governance dry run。
- 不得修改 migration 320、產品程式或資料庫；不得執行 migration、seed、API 或 DB command。
- 只能引用既有相容性報告、hash、異常清單與 GO／NO-GO 證據。
- 必須保留 `NO-GO`，不得降低 gate、忽略 blocker 或偽造 formal clone 證據。

## 規則優先序與衝突

1. 系統、使用者明確指令與 sandbox／permission policy。
2. 本 `AGENTS.md`。
3. `.codex/domain/` 中人工 `confirmed` Rules。
4. `.codex/agents/*.toml`。
5. `.agents/skills/*/SKILL.md`。
6. Workflow、Task brief、Blueprint 與 handoff。

若 Reviewer 標記 `BLOCKER`，實作者可正式回覆一次、Reviewer 可再審一次；仍有爭議即升級人工，不得往返超過兩輪。

## 證據與完成條件

- Gate Router 必須分別計算 `Bootstrap Candidate Review Gate`、`Bootstrap Human Commit Gate`、`Steady-State Governance Preparation Gate`、`Steady-State Governance Execution Gate` 與 `Migration 320 Execution Gate`，各自輸出 `status` 與 `reasons`。目前 Candidate、Human Commit 與 Migration 320 為 `NO-GO`；兩個 steady-state Gate 在 bootstrap trust anchor 缺失時為 `DISABLED`。Candidate Gate 不得依賴 final commit approval、Session B、Git stage、STAGED_EXACT 或 Migration 320 業務決策；Bootstrap Human Commit Gate 只能由人工核准。
- `BOOTSTRAP_WORKSPACE_CANDIDATE` 只可綁定 Task、精確 manifest、檔案集合與 deterministic scanner report，assurance 固定為 `INTERNAL_CONSISTENCY_ONLY`；它不證明 producer 身分、Git staging、commit approval 或 steady-state execution authority。Phase 1 bootstrap candidate 不含 `STAGED_EXACT` 執行路徑。
- Phase scope 的有效 write paths 必須由單一 `computeEffectiveScope()` 計算 Phase Policy、Intent、Classification、Blueprint、Role Policy 與 Agent Assignment 的交集；任一來源缺失、衝突、不可證明的 glob 或空集合都 fail-closed。
- 所有 production scope consumer 必須使用 handoff 的明確 `actor_role`，或由恰好一個可涵蓋全部 changed files 的有效 assignment 推導；零個或多個候選角色一律拒絕。
- Scanner 只可聲明「在版本化 deterministic scan contract 內沒有 finding」；report 必須由 validator 重算 contract、finding registry、canonicalization、binary oracle、manifest、included/scanned file set、count、claims 與 payload hash。不得聲明全域無 secret、完整 DLP、producer identity 或 OS isolation。
- Phase 1 不載入 Domain approval schema、不解析 approval artifact，也不提供 proposed-to-confirmed transition。
- Rule 必須明確分類為 `governance_control`、`technical_constraint`、`railway_domain_candidate` 或 `railway_domain_authority`。Bootstrap 只允許前兩類進入 `applicable_rules`；railway candidate 只能進入 `candidate_rules`，而 railway authority 在 Phase 1 不受支援。

- 工程結論必須附命令、結果、修改檔案、未驗證事項與殘餘風險。
- 不得將「腳本可解析」誤寫成「業務 GO」；結構驗證 PASS 與 release gate 是不同結果。
- 新增治理腳本須通過 syntax check、正向案例與至少一個安全拒絕案例。
- L3 必須保存 Blueprint、artifact manifest、test evidence、review findings、human approval 與 traceability。
- L3 核准順序固定為 `scope_approval`、`execution_approval`、`review_completion`、`final_commit_approval`；final 前必須有正式 Review 完成、條件清零、scope validation、精確 governance commit manifest 與 deterministic preapproval gate。
- evidence verdict 以全域唯一、精確比對的 `requirement_id` 計算；required evidence 只接受 `PASS`。`FAIL`、`NOT_VERIFIED`、`PASS_WITH_LIMITATION` 均為 `NO-GO`，`NOT_APPLICABLE` 對 required evidence 直接 invalid。Phase 1 不接受、載入或執行 evidence waiver。
- 所有正式 Rule、證據與 graph edge 必須可追溯來源；來源不存在或 hash 不符即停止。

## 交付

- 所有 Agent 透過 `.codex/tasks/<TASK-ID>/` 交接，不依賴對話記憶。
- 未經人工確認，不提出或執行 commit。
- 交付時列出新增／修改檔案、限定 pathspec diff、驗證結果、尚未完成事項、殘餘風險與建議獨立治理 commit 清單。
