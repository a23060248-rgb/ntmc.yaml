# Codex 企業級多 Agent 治理：Phase 0 盤點與落地藍圖

盤點日期：2026-07-16（Asia/Taipei）  
範圍確認日期：2026-07-17（Asia/Taipei）  
唯一產品／治理根目錄：`C:\Users\a2306\Desktop\code\ntmc.yaml\輕軌系統`  
Git 容器根目錄：`C:\Users\a2306\Desktop\code\ntmc.yaml`（僅供 branch、commit、diff 與 worktree）  
本階段限制：只做靜態盤點與設計；未啟動服務、未執行 migration、未讀取任何 `.env` 內容、未連線任何資料庫、未修改產品程式。

## 1. 結論

本專案適合採用「根 Task 治理 Orchestrator + 專業 Custom Subagents + L3 獨立 Task／Worktree + Blueprint／Rule／Evidence 工件」的混合模型。

第一版不應建立 `orchestrator.toml`。Codex 根 Task 本身就是 Orchestrator，由 `輕軌系統/AGENTS.md`、任務分類 Skill 與治理規則控制；其餘專業角色才放在 `輕軌系統/.codex/agents/*.toml`。這可將 `agents.max_depth` 維持為 `1`，避免子 Agent 再遞迴派工。

後續 Codex Task 必須以 `輕軌系統` 作為工作目錄與產品根目錄。除 Git 狀態、branch、commit、diff 與 worktree 操作外，不盤點、不測試、不修改 `ntmc.yaml` 內其他舊系統或原型。

目前產品測試基礎不是零：後端有 20 個測試檔、82 個 test cases；前端有 4 個測試檔、8 個 test cases；另有多支 rehearsal 與 migration 相容性腳本。然而，尚無 repository CI workflow、coverage gate 與正式資料 clone 證據，因此 DoD 應採「過渡期 + 目標期」兩階段。

本專案的高風險首要項不是 Agent TOML，而是環境隔離：應用目錄存在被 Git 忽略的 `.env` 與 `.env.test`。雖然內容未被本次讀取，但一般 API 啟動預設會讀 `.env`，而資料庫安全檢查只在 `DATABASE_SAFETY_MODE=test|rehearsal` 時強制限制本機 rehearsal DB。Agent 工作環境必須先改成只取得安全的 agent／rehearsal 設定，否則 Markdown 禁令不足以防止誤連遠端資料庫。

## 2. 官方 Codex 能力核對

截至本次盤點，官方文件確認：

- Codex App、CLI 與 IDE extension 支援 Subagent workflow；專案級 Custom Agent 放在 `.codex/agents/*.toml`。
- Custom Agent 必填 `name`、`description`、`developer_instructions`，可另設 `model`、`model_reasoning_effort`、`sandbox_mode`、MCP 與 Skills。
- Repository Skill 正式掃描位置為 `.agents/skills/<skill-name>/SKILL.md`。
- `AGENTS.md` 適合保存每次工作都要遵守的 repository 規則；細部規則可由子目錄 `AGENTS.md` 或 `AGENTS.override.md` 分層。
- Worktree 適合互不干擾的獨立任務，但以 Git commit 為基準；目前未提交變更會被帶入新 worktree，忽略檔只會在 `.worktreeinclude` 明列時複製。
- Subagent 的即時 sandbox／permission override 可能覆蓋 Agent TOML 預設，所以 `sandbox_mode = "read-only"` 是重要防線，但不能被當成唯一防線。

官方來源：

- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Models](https://learn.chatgpt.com/docs/models)

## 3. Repository 現況盤點

### 3.1 輕軌系統邊界與 Git 狀態

- 唯一產品與治理範圍是 `C:\Users\a2306\Desktop\code\ntmc.yaml\輕軌系統`。
- Git repository 根仍是上一層 `C:\Users\a2306\Desktop\code\ntmc.yaml`，只作版本控制容器，不代表其他目錄屬於產品範圍。
- Workspace 父目錄 `C:\Users\a2306\Desktop\code` 不屬於本系統，也不是有效 Git repository。
- 目前分支：`codex/precheck-template-maintenance`。
- `輕軌系統` 工作樹已有大量修改與未追蹤檔案，包含 migration 320、C 工單 workflow、相容性報告與前端改動。
- Phase 1 建置治理檔前，必須先由人確認這批既有變更的保留、提交或分支策略；不得把治理架構與未完成產品變更混成單一 commit。

### 3.2 技術棧

| 區域 | 現況 |
| --- | --- |
| Frontend | React 19、TypeScript、Vite、React Router、TanStack Query、React Hook Form、Zod、Vitest |
| Backend | Node.js 20+、Express、PostgreSQL `pg`、Node test runner、ExcelJS |
| Database | PostgreSQL；共用 `work_order` + P／C／R／J 明細；33 支 `migration-*.sql`，manifest 排序到 320 |
| Deployment | API 有 Dockerfile；未找到 repository CI workflow 或 compose 檔 |
| Out of scope | `ntmc.yaml` 內除 `輕軌系統` 之外的舊系統、原型與其他目錄均不納入盤點、測試或治理 |
| Existing governance | `輕軌系統` 內有 `.claude/*.md` 方法文件；目前沒有產品根層級的 `AGENTS.md`、`.codex/agents` 或 `.agents/skills` |

### 3.3 測試成熟度

| 項目 | 靜態盤點結果 |
| --- | --- |
| Backend tests | 20 個測試檔、82 個 test cases |
| Frontend tests | 4 個測試檔、8 個 test cases |
| Backend syntax | `npm run check` 有完整 Node syntax check 清單 |
| Frontend type/build | `npm run build` 包含 `tsc -b` 與 Vite build |
| Rehearsal | 有 fresh DB、migration、C workflow、PCR、庫存、權限、Word 等 rehearsal scripts |
| Coverage | 未找到 coverage threshold／coverage gate |
| CI | 未找到 GitHub Actions、Azure Pipelines、GitLab CI 或 Jenkinsfile |
| E2E | 主要為 API／DB rehearsal；沒有正式 browser E2E framework |

既有 `system-health-check-20260715.md` 記錄 82/82 API tests、8/8 frontend tests、build 與 rehearsal DB 通過；本次 Phase 0 沒有重跑，不能把該紀錄當成本次即時驗證結果。

### 3.4 已有安全機制

- `.env` 與 `.env.*` 已被 `.gitignore` 排除，只有 example 檔被追蹤。
- `databaseSafety.js` 在 test／rehearsal mode 限制連線為 localhost，並限制資料庫名稱符合 `ntmc_erp_rehearsal*`。
- 角色政策已分成六種應用角色，並有 viewer 與專業異動權限測試。
- migration manifest 每支 migration 有 sequence、ID、file 與 verify SQL。
- 庫存具 idempotency、交易與對帳測試；C 工單具狀態機、版本鎖、事件與相容性 rehearsal。

### 3.5 現有安全缺口

1. API 一般啟動預設讀 `.env`；沒有 `DATABASE_SAFETY_MODE` 時，`databaseSafety.js` 不限制遠端 host 或資料庫名稱。
2. Agent 可讀 workspace 中被忽略的 `.env`；只靠「不要讀」的文字規則不構成技術隔離。
3. 沒有 CI gate、secret scanning、SQL policy check 或 required review 的 repository 證據。
4. main branch protection、CODEOWNERS 與 L3 禁止自動合併屬遠端設定，本地 repository 尚無法證明已啟用。
5. `.worktreeinclude` 若加入 `.env`，Codex managed worktree 會複製它；本專案禁止這樣設定。
6. `databaseViewer`、`dataAdmin` 與 production CORS 已在現有健檢中被列為上線風險。

## 4. 執行模型

### 4.1 根 Task：Meta Governance Orchestrator

根 Task 負責：

- 接收人類意圖並建立 `task-intent.yaml`。
- 判定 L1／L2／L3。
- 選出適用 Blueprint、Meta Rules、Domain Rule IDs 與 Evidence 要求。
- 決定哪些工作可平行、哪些必須循序。
- 建立 `.codex/tasks/<TASK-ID>/` 的工件骨架。
- 派發直接子 Agent；不讓子 Agent 再派工。
- 檢查交接完整性、Reviewer 獨立性與 HITL gate。
- 彙整結果，但不得取代 Domain Owner、Security Owner 或 Database Owner 的人工裁決。

根 Orchestrator 原則上不直接修改產品程式。L1 極小型任務若由根 Agent 實作，正式 QA／Review 必須另開乾淨 Agent thread。

### 4.2 Custom Subagents

第一版規劃 10 個專業 Agent，不另外建立 `orchestrator.toml`：

| TOML | 職責 | Sandbox | 建議模型／effort |
| --- | --- | --- | --- |
| `architect.toml` | 跨模組邊界、ADR、資料流、修改範圍 | read-only | Sol／High；未確認可用型號前省略 `model` |
| `backend-engineer.toml` | Express route、service、auth、audit 實作 | workspace-write | Terra／Medium；L3 用 Sol／High |
| `frontend-engineer.toml` | React、TypeScript、表單、權限顯示 | workspace-write | Terra／Medium |
| `database-engineer.toml` | schema、migration、verify／rollback 設計 | workspace-write，但禁止直接 apply | Sol／High |
| `qa-engineer.toml` | 單元、整合、API、rehearsal、證據整理 | workspace-write，僅能改 tests／evidence | Terra／Medium；複雜 E2E 用 Sol／High |
| `code-reviewer.toml` | correctness、regression、test gaps | read-only | Sol／High |
| `security-reviewer.toml` | auth、權限、secret、OWASP、audit | read-only | Sol／High |
| `railway-domain-reviewer.toml` | 依 Rule ID 審查 P／C／R／J 與維修流程 | read-only | Sol／High |
| `compatibility-reviewer.toml` | migration、舊資料、API、快照與 hash 相容性 | read-only | Sol／High |
| `documentation-engineer.toml` | 技術文件、SOP、操作說明與變更摘要 | workspace-write，限 docs／task artifacts | Terra／Medium |

模型名稱先作建議，不在 MVP 強制釘死。正式建檔前先用 Codex `/model` 或 App model selector 確認帳號實際可用型號；若不確認，TOML 省略 `model` 以繼承父 Task。官方目前建議複雜工作用 GPT-5.6 Sol、日常工作用 Terra、明確重複工作用 Luna；模型供應與帳號權限可能不同。

### 4.3 Subagent 全域設定

建議 `.codex/config.toml`：

```toml
[agents]
max_threads = 4
max_depth = 1
interrupt_message = true
```

原因：第一版只允許根 Task 派發直接子 Agent；最多 4 個 thread 可兼顧探索、QA 與 Reviewer，又避免大量 fan-out。Database、Backend 與同一核心工單流程預設循序，不因 thread 額度存在就平行寫入。

## 5. Reviewer 獨立性

### 5.1 L1／L2

正式 Reviewer 必須是新的 Agent thread，建立時不帶實作者對話。Reviewer 只能取得：

- `task-intent.yaml`
- `classification.yaml`
- Blueprint 與驗收條件
- base／head diff
- `implementation-handoff.yaml`
- `test-evidence.yaml`
- 適用的 Rule IDs 與 checklist

Reviewer 不得取得實作者的完整對話、推理過程或未落檔辯護。若目前客戶端無法保證乾淨 context，改用全新 Task，不得把「另叫一個角色名稱」視為獨立審查。

### 5.2 L3

L3 最終 Code、Security、Domain、Compatibility Review 至少有一個必須在全新 Codex Task／Session 執行。Database migration、權限模型、狀態機、批次更新、稽核與正式部署設定，建議全部使用獨立 Task。

Reviewer 只可輸出：

- `PASS`
- `PASS_WITH_CONDITIONS`
- `BLOCKER`
- `NEEDS_HUMAN_DECISION`

Reviewer 不得一邊修程式一邊宣告通過。

## 6. Subagent、Task 與 Worktree 使用邊界

| 情境 | 執行載體 | 原因 |
| --- | --- | --- |
| Repo 探索、文件盤點、測試缺口分類 | 同一根 Task 的 read-only subagents，可平行 | 讀取型、互不改檔 |
| Backend 與 Frontend 修改範圍完全分離 | 不同 subagents；必要時不同 worktrees | 可獨立驗證且低衝突 |
| 同一 API contract、同一狀態機、同一 migration | 同一 worktree、循序執行 | 避免 schema／contract 競爭 |
| L2 Code Review | 乾淨 read-only reviewer subagent | 輸入可由 diff 與工件完整描述 |
| L3 最終審查 | 全新 Task／Session；必要時獨立 worktree | 降低實作者 context 錨定 |
| Migration rehearsal | 專用 branch／worktree + 一次性 local DB | 需要可丟棄環境與完整證據 |
| 正式 migration／正式部署 | 不由 Agent 自動執行 | 需要人類核准與受控 CI |

目前工作樹已有大量未提交變更。新的 Codex managed worktree 可能把這些變更一起帶入，因此在既有變更分流前，不應用 worktree 執行正式 L2／L3 實作或審查。

## 7. 三級 Workflow

### L1：輕量

適用：文件、文案、無業務邏輯的樣式或明確小修。

```text
Classify -> Implement -> QA read-back -> Final summary
```

最低要求：受影響檔案 read-back、格式／build 的最小驗證、無未記錄風險。

### L2：標準

適用：一般 API、UI、報表、非核心資料結構調整。

```text
Classify -> Blueprint -> Architect（必要時）
-> Implementation -> QA -> Independent Code Review
-> Conditional Security／Domain Review -> Final summary
```

觸發 Security Review：auth、輸入驗證、附件、token、session、外部網路、敏感資料。  
觸發 Domain Review：P／C／R／J、排程、庫存、序號件、坑位、Word 正式表單、權限分工。

### L3：重型

適用：

- Database migration 或資料回填。
- 權限模型、session、audit、狀態機。
- 批次 UPDATE／DELETE、DROP、TRUNCATE。
- 序號件履歷、坑位唯一性、庫存帳務。
- P／C／R／J 核心關聯或向下相容性。
- 正式環境部署與連線設定。

```text
Classify -> Blueprint -> Human scope approval
-> Architect -> Database／Backend／Frontend（依序或受控平行）
-> QA rehearsal -> Code Review -> Security Review
-> Railway Domain Review -> Compatibility Review
-> Human approval -> Merge／release gate
```

任何 Reviewer 為 `BLOCKER`，或任何明文 Domain Rule 缺失，均不得進入 release gate。

## 8. MAGP-Codex 目錄樹

所有治理檔應建立在唯一產品根目錄 `ntmc.yaml/輕軌系統/`。為確保專案級 Agent、Skill 與指令的適用範圍正確，Codex App／CLI Task 應從此目錄啟動；上一層只處理 Git：

```text
輕軌系統/
├── AGENTS.md
├── .codex/
│   ├── config.toml
│   ├── agents/
│   │   ├── architect.toml
│   │   ├── backend-engineer.toml
│   │   ├── frontend-engineer.toml
│   │   ├── database-engineer.toml
│   │   ├── qa-engineer.toml
│   │   ├── code-reviewer.toml
│   │   ├── security-reviewer.toml
│   │   ├── railway-domain-reviewer.toml
│   │   ├── compatibility-reviewer.toml
│   │   └── documentation-engineer.toml
│   ├── governance/
│   │   ├── magp-model.md
│   │   ├── governance-priority.md
│   │   ├── risk-classification.yaml
│   │   ├── human-approval-policy.yaml
│   │   └── residual-risk-register.yaml
│   ├── blueprints/
│   │   ├── schemas/
│   │   │   ├── task-intent.schema.json
│   │   │   ├── blueprint.schema.json
│   │   │   └── review.schema.json
│   │   └── templates/
│   │       ├── feature.yaml
│   │       ├── bugfix.yaml
│   │       ├── migration.yaml
│   │       └── review.yaml
│   ├── meta-rules/
│   │   ├── global.yaml
│   │   ├── database.yaml
│   │   ├── security.yaml
│   │   ├── review-independence.yaml
│   │   ├── evidence.yaml
│   │   └── confidentiality.yaml
│   ├── domain/
│   │   ├── index.yaml
│   │   ├── terminology.yaml
│   │   ├── workorder-types.yaml
│   │   ├── c-workorder-status-machine.yaml
│   │   ├── p-workorder-rules.yaml
│   │   ├── c-workorder-rules.yaml
│   │   ├── r-workorder-rules.yaml
│   │   ├── j-workorder-rules.yaml
│   │   ├── serialized-parts.yaml
│   │   ├── inventory-rules.yaml
│   │   ├── permission-separation.yaml
│   │   ├── audit-rules.yaml
│   │   └── compatibility-rules.yaml
│   ├── workflows/
│   │   ├── l1-lightweight.md
│   │   ├── l2-standard.md
│   │   ├── l3-high-risk.md
│   │   ├── database-migration.md
│   │   └── release-validation.md
│   ├── templates/
│   │   ├── implementation-handoff.yaml
│   │   ├── test-evidence.yaml
│   │   ├── review-findings.yaml
│   │   ├── human-approval.yaml
│   │   └── traceability.yaml
│   ├── checklists/
│   │   ├── code-review.md
│   │   ├── security-review.md
│   │   ├── railway-domain-review.md
│   │   └── compatibility-review.md
│   ├── scripts/
│   │   ├── create-task.mjs
│   │   ├── compile-prompt.mjs
│   │   ├── validate-task.mjs
│   │   ├── build-manifest.mjs
│   │   └── project-knowledge-graph.mjs
│   ├── tasks/
│   │   └── <TASK-ID>/
│   │       ├── task-intent.yaml
│   │       ├── classification.yaml
│   │       ├── blueprint.yaml
│   │       ├── compiled-prompts/
│   │       ├── implementation-plan.md
│   │       ├── implementation-handoff.yaml
│   │       ├── artifact-manifest.yaml
│   │       ├── test-evidence.yaml
│   │       ├── review-findings.yaml
│   │       ├── human-approval.yaml
│   │       ├── traceability.yaml
│   │       └── final-summary.md
│   ├── knowledge-lake/
│   │   ├── source-index/
│   │   ├── decision-index/
│   │   ├── artifact-index/
│   │   ├── evidence-index/
│   │   └── review-index/
│   └── knowledge-graph/
│       ├── ontology.yaml
│       ├── nodes/
│       ├── edges/
│       └── projections/
└── .agents/
    └── skills/
        ├── task-classification/
        ├── feature-development/
        ├── bug-fix/
        ├── database-migration/
        ├── test-evidence/
        ├── code-review/
        ├── security-review/
        ├── railway-domain-review/
        ├── compatibility-review/
        └── documentation-update/
```

大型 log、database dump、截圖、含個資來源檔與二進位證據不得放入 Git Knowledge Lake。Git 只保存 manifest、SHA256、受控 URI、產生者、時間與驗證狀態；實體證據應放在受存取控制的 CI artifact 或文件儲存區。

## 9. Blueprint 與 Rule 最小 Schema

### 9.1 Task Blueprint

```yaml
schema_version: 1
blueprint_id: BP-ERP-<TASK-ID>
task_id: ERP-000
intent:
  objective: ""
  business_reason: ""
scope:
  include: []
  exclude: []
acceptance_criteria: []
domain_objects: []
applicable_rules: []
risk:
  level: L1
  reasons: []
required_agents: []
execution:
  parallel_groups: []
  sequential_steps: []
evidence_required: []
human_approval:
  required: false
  approver_roles: []
stop_conditions: []
```

### 9.2 Meta／Domain Rule

```yaml
rule_id: WO-C-STATUS-007
version: 1
status: confirmed
statement: 缺料狀態不得等同完工、覆核或結案
applies_when: []
prohibited: []
verification:
  automated: []
  manual: []
enforcement:
  mechanism: []
  residual_risk: ""
source:
  file: ""
  section: ""
  owner: ""
  approved_at: null
open_questions: []
```

規則若 `status != confirmed`，Railway Domain Reviewer 不得自行補完，只能回 `NEEDS_HUMAN_DECISION`。

## 10. Task Prompt 編譯流程

```text
Human intent
  -> task-intent validation
  -> L1/L2/L3 classification
  -> Blueprint selection
  -> Meta Rule selection
  -> Domain Rule selection
  -> Agent role + allowed paths
  -> input artifact references
  -> required output schema
  -> compiled-task-prompt.md
  -> independent artifact validation
```

編譯器只組合已存在且已確認的規則，不得讓 LLM 自行產生新的正式 Rule ID 或偽造來源。LLM 負責語意判斷；Task ID、Artifact ID、schema defaults、hash、timestamp、status transition 與 trace link 由程式生成。

## 11. Artifact Builder、Knowledge Lake 與 Graph

### 11.1 Program Artifact Builder

MVP 指令：

- `create-task.mjs`：驗證 Task ID，建立固定工作區。
- `compile-prompt.mjs`：依 role、Blueprint 與規則組裝 prompt。
- `validate-task.mjs`：驗證必填工件、Reviewer 分離與 HITL gate。
- `build-manifest.mjs`：產生 artifact ID、檔案 hash、Rule／Test reference。
- `project-knowledge-graph.mjs`：由 traceability 投影 nodes／edges；不得反向修改正式工件。

### 11.2 Knowledge Lake

保存：Requirement、Blueprint、Rule version、Prompt hash、ADR、commit、test evidence、review finding、human approval、release reference。

禁止保存：secret、完整 `.env`、production connection string、未去識別資料、原始個資、database dump、無保存必要的完整 Agent 推理或大量 raw log。

### 11.3 Knowledge Graph

節點：`Requirement`、`Blueprint`、`Rule`、`Task`、`AgentRun`、`Artifact`、`File`、`API`、`Table`、`Migration`、`Test`、`Finding`、`PR`、`Approval`、`Release`。

關係：

- `Requirement DEFINES Blueprint`
- `Blueprint APPLIES Rule`
- `Task IMPLEMENTS Requirement`
- `AgentRun PRODUCES Artifact`
- `Task MODIFIES File`
- `Migration AFFECTS Table`
- `Test VERIFIES Rule`
- `Finding BLOCKS Task`
- `Approval APPROVES Task`
- `Release CONTAINS Artifact`

每條 edge 必須有 `source_artifact_id`、`created_at` 與 `evidence_hash`。沒有來源的推論不得成為 confirmed edge。

## 12. HITL Gate

下列任一成立即需人工決策：

- Domain Rule 缺失、衝突或來源未核准。
- L3 任務 scope 或 rollback 尚未核准。
- Reviewer 為 `BLOCKER` 或兩名 Reviewer 結論衝突。
- destructive migration、資料回填、批次 UPDATE／DELETE、DROP、TRUNCATE。
- 權限、session、audit、序號件歷程、庫存帳務、工單狀態機異動。
- 正式資料 clone 的來源、去識別化或保留政策無證據。
- 測試結果無法區分既有失敗與本次回歸。
- 正式部署、release、main merge 或 production credential 使用。

Reviewer 標示 `BLOCKER` 後，實作者可正式回覆一次，Reviewer可再審一次；仍有爭議即升級人工，禁止 Agent 間來回超過兩輪。

## 13. 禁止事項與技術機制矩陣

| 禁止／要求 | 現有機制 | Phase 1 補強 | 驗證 | 殘餘風險 |
| --- | --- | --- | --- | --- |
| 正式憑證不得進 Git | `.gitignore` 排除 `.env*`，example 例外 | secret scan + pre-commit／CI gate | `git ls-files` + scanner | 本機 `.env` 仍可被 workspace Agent 讀到 |
| Agent 不得取得正式 DB 連線 | rehearsal mode 有 localhost／DB name guard | 專用 `.env.agent`、Agent 啟動強制 safety mode、正式憑證移出 workspace | 啟動安全測試 | 未隔離前為 P0 風險 |
| 盤點不得啟動服務／migration／seed | 本次靠任務限制 | Hook／approval policy 阻擋命令；只讀 explorer | command audit | Hook 未建立前仍靠行為約定 |
| Reviewer 不得修改產品 | Custom Agent `read-only` | Parent Task 也選 read-only permission；CI token read-only | 嘗試寫檔應失敗 | 即時 parent override 可能蓋過 TOML |
| L3 不得自動合併 main | 尚未確認 | Branch protection、CODEOWNERS、required human review | GitHub settings audit | 遠端平台設定不在 repo 內 |
| Destructive SQL 不得本機直接跑 | rehearsal scripts + DB name guard | ephemeral DB、SQL policy check、limited DB role | 首跑／重跑／rollback／restore | SQL 語意掃描不能涵蓋所有動態 SQL |
| 正式 clone 必須去識別化 | 目前沒有來源證明 | clone manifest + owner approval + de-identification report | 抽樣與 hash 對帳 | 必須依賴資料擁有者 |
| 不得把 `.env` 複製到 worktree | 目前無 `.worktreeinclude` | 明文禁止 `.env*`，改由 setup script 產生安全 local config | worktree file audit | 使用者可手動複製 |
| 狀態／稽核歷史不得直接覆寫 | C workflow、event、audit、version lock | Domain Rule IDs + DB constraints + review checklist | unit／rehearsal／hash | 舊 generic routes 仍需持續稽核 |
| 沒有 Rule 不得自行補業務 | 尚無正式 rule index | `status: confirmed` gate + Domain Reviewer | schema validator | 人類規則維護品質仍是關鍵 |
| 每項結論必須有 Evidence | 既有 rehearsal reports | evidence schema + artifact manifest + CI artifact hash | `validate-task.mjs` | 人工證據仍可能不完整 |

## 14. DoD 兩階段

### 過渡期 DoD

- 新增／修改的產品行為必須附對應測試。
- 受影響流程需有可重現命令與輸出摘要。
- 既有測試失敗須標示「本次造成／既有問題／環境問題」，不得混寫。
- Backend 至少通過 `npm run check` 與相關 Node tests。
- Frontend 至少通過相關 Vitest；影響型別或 build 時執行 `npm run build`。
- Migration 只能在一次性 rehearsal DB 做 apply、verify、rerun、rollback／restore rehearsal。
- Domain Rule、操作文件與 task evidence 必須同步更新。
- Reviewer 無 `BLOCKER`；L3 人工核准完成。

### 目標期 DoD

- 受影響測試、lint、type check、build、API integration 與 browser E2E 全部通過。
- 建立 coverage baseline；新改動不得降低受影響區域 coverage，核心狀態機須有明確 gate。
- CI 自動驗證 schema、Rule reference、artifact manifest、secret 與 SQL policy。
- Migration apply、rerun、rollback／restore、資料 hash 與主要查詢相容性通過。
- Code、Security、Domain、Compatibility Review 依風險等級完成。
- 文件、SOP、rollback 與 release note 完整。
- L3 具人類簽核、PR、commit 與 release trace。

## 15. Domain Knowledge Base 建置順序

現有資料來源可由下列檔案開始整理，但正式 Rule 必須由業務 Owner 核准：

1. `terminology.yaml`：P／C／R／J、設備、坑位、周轉件、快照、事件。
2. `workorder-types.yaml`：由 `frontend/docs/00-system-blueprint.md`、`db-design/docs/02-work-order-design.md` 萃取。
3. `c-workorder-status-machine.yaml`：以 migration 320、`cWorkOrderWorkflow.js` 與相容性報告交叉驗證 11 狀態。
4. `permission-separation.yaml`：以 `rolePolicy.js`、role tests、角色矩陣文件為來源。
5. `audit-rules.yaml`：以 audit service、mutation middleware 與 migration 為來源。
6. `serialized-parts.yaml`：以 repair workflow、asset event、坑位歷程與唯一性風險為來源。
7. `inventory-rules.yaml`：以 immutable transaction、idempotency、balance reconciliation 為來源。
8. `p-workorder-rules.yaml`：排程、模板快照、量測、異常轉 C、Word PRE／POST。
9. `r-workorder-rules.yaml`：C 拆件、多 R、內外修、驗收、回庫、報廢。
10. `compatibility-rules.yaml`：migration manifest、before／after hash、LEGACY event、rollback／restore。
11. `j-workorder-rules.yaml`：目前需求不足，先標示待決策，不自行擴充。
12. 一至五級維修週期、安全互鎖與維修手冊條款：必須由人提供正式來源與條款編號後才可成為 confirmed rules。

## 16. 第一階段 MVP

確認後第一批只建立：

1. 產品根 `輕軌系統/AGENTS.md`。
2. `.codex/config.toml`，`max_threads = 4`、`max_depth = 1`。
3. 10 個 Custom Agent TOML 骨架。
4. `.agents/skills/task-classification/SKILL.md`。
5. 四個 Blueprint template 與 JSON Schema。
6. Global、Database、Review Independence、Evidence、Confidentiality Meta Rules。
7. Domain Rule index + terminology + workorder types + C status machine。
8. Task artifact templates。
9. `create-task.mjs`、`validate-task.mjs` 兩支 deterministic scripts。
10. 一個不改產品程式的示範 Task，以 Migration 320 相容性證據做 read-only dry run。

先不要建立完整 Knowledge Graph backend，也不要把全部歷史文件搬進 Knowledge Lake。MVP 只輸出 `traceability.yaml` 與可驗證的 nodes／edges 投影。

## 17. 需要人工確認的決策

1. 是否確定第一版只支援 Codex，不維護 Claude 雙平台；既有 `.claude/` 僅作參考、不刪除。
2. **已確認：**治理檔只放在 `ntmc.yaml/輕軌系統/`；其他舊系統不納入治理。Git 操作仍使用上一層 repository root。
3. 是否先整理／提交目前 dirty worktree，再建立治理框架獨立 commit；建議是。
4. 是否接受根 Task 作 Orchestrator、不建立 `orchestrator.toml`；建議接受。
5. 是否允許第一版 10 個專業 Agent，但每個任務按 L1／L2／L3 只啟用必要角色；建議接受。
6. Agent 專用 DB 環境如何隔離：建議新增安全 local／rehearsal profile，正式憑證移出 workspace。
7. GitHub／Git 平台是否可設定 branch protection、CODEOWNERS、required reviews 與 CI；目前未確認。
8. Domain Rule 的人工 Owner：維修、倉儲、資料庫、資安與文件各由誰核准。
9. Knowledge Lake 實體證據存放位置與保存年限；建議 Git 只放 manifest，binary／敏感證據放受控 artifact store。
10. Migration 320 是否作為第一個治理示範 Task；建議是，因現有證據完整且最能驗證 Compatibility／HITL gate。

## 18. Phase 0 停止點

本文件完成後停止，不建立 Agent TOML、Skill、AGENTS.md、Prompt Compiler 或 CI，也不改任何產品程式與 migration。待上述人工決策確認後，再進入 Phase 1 MVP 建置。
