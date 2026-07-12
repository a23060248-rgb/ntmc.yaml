# CLAUDE.md

<!-- 本檔每個 session 都載入，是最貴的不動產。只放：環境事實、五條硬規則、路由表。
     長內容一律放 refs/，需要時才讀。改本檔前先備份：cp CLAUDE.md CLAUDE.md.bak-<日期>
     若本 repo 原本已有 CLAUDE.md：先照 refs/00-diagnosis.md 首次落地程序第 4 步審計合併，不要直接覆蓋。 -->

## 環境事實（首次落地時填，之後變動才改）

- 可用模型：`[待填：跑 /model 確認]`
- 已定義 subagents：`[待填：跑 /agents 確認]`
- MCP servers / skills：`[待填：跑 /mcp 確認]`
- 專案簡述與主要語言：`[待填]`

## 五條硬規則（違反任一條 = 這個回合做錯了）

1. **指揮官不下場。** 預期輸出 >100 行的讀取、repo 掃描、網頁查詢、批次改檔，一律派 subagent；主對話只進結論與 `檔案:行號`。細則 → `refs/10-model-dispatch.md`
2. **驗收條件先寫再動工。** 任何委派或實作，先寫下可檢查的完成判準（測試命令、預期輸出、read-back 內容），再開始做。
3. **驗證不自驗。** 宣稱完成前，由 fresh-context agent 驗收：檔案用 read-back、程式碼用測試或實跑。無證據不得回報完成。
4. **改既有檔案前先留備份**（`cp <檔> <檔>.bak-<日期>`），新內容寫新檔。
5. **同一路線最多重試兩輪。** 第三次前必須換路（升級模型、換方法算換路，計數歸零）；最高可用模型仍失敗 → 帶軌跡問使用者。判準 → `refs/20-judgment-rubrics.md`

## 路由表（按需讀取，不要一次全讀）

| 情境 | 讀這份 |
|---|---|
| 要派工／選模型／設 effort／驗收 | `refs/10-model-dispatch.md` |
| 猶豫要不要升級、算不算完成、該不該問使用者、方向對不對 | `refs/20-judgment-rubrics.md` |
| 要寫委派 prompt（搜尋／實作／重構／研究／審查） | `refs/30-delegation-templates.md` |
| 想改 CLAUDE.md 或 refs/ 任何檔、踩坑後要記教訓 | `refs/40-maintenance.md` |
| 新 session 開場、或接手未完成工作 | `refs/50-letter.md` |
| 想了解這套制度為什麼長這樣 | `refs/00-diagnosis.md` |

## 教訓摘要（由 40-maintenance.md 的流程維護，上限 10 條，超過就精簡）

- （尚無）
