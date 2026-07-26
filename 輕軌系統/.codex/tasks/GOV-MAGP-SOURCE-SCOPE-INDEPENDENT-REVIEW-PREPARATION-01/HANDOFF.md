# HANDOFF — GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01

## Current goal

已完成 MASTER BATCH 3A-1：凍結 MAGP Source Scope Lock、重新驗證 11 份來源，並準備四份獨立 Reviewer package、共同回傳／傳輸契約、Aggregator R1 與 deterministic QA；停在人工啟動 Reviewer 之前。

## What changed

- 建立 20-artifact frozen review-target manifest、canonical record 與完整性驗證。
- 重新驗證 11/11 top-level source filename、size、SHA-256、magic/media type 與 Source ID。
- 維持 SOURCE-MAGP-03 Human-approved exact stem：`使用Codex去開發MAGP平台前置設計與策剠規劃`，`剠=U+5260`。
- 建立四份 collision-free Reviewer package，全部使用 exact absolute path allowlist。
- 建立一份共同 RFC 8785 JCS two-field Reviewer return schema。
- 建立且僅建立一份 manual Reviewer transport attestation schema。
- 建立 Aggregator R1 package、fail-closed import contract、fresh QA manifest 與 deterministic canonical writer。
- 完成 30/30 preparation QA 與 5/5 launch envelope bijection verification。

## Files touched

只新增或更新：

`C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01/**`

未修改來源目錄、Source Scope Lock Task、Candidate、產品、治理 baseline、歷史 Task 或 Git 狀態。

## Commands or tests run

- Node syntax check：package builder、preparation validator、Aggregator canonical writer，全部 PASS。
- Package builder：4 Reviewer packages + 1 Aggregator package，PASS。
- `validate-preparation.mjs --mode preparation`：`30/30 PASS`。
- Aggregator canonical writer positive self-test：PASS。
- Aggregator canonical writer negative self-test：PASS。
- Reviewer launch envelopes：`4/4 PASS`。
- Aggregator launch envelope：`1/1 PASS`。
- 一次最終唯讀彙總 one-liner 因 PowerShell 預先展開 JavaScript template literal 而語法失敗；未寫入任何檔案。已改用不含 template literal 的同等唯讀檢查重跑並 PASS。

## Known risks and gates

- Source Scope Lock Review Gate 尚未計算。
- Reviewer 0/4 尚未啟動，Aggregator 尚未啟動。
- Source Authority 仍為 proposed / not adopted。
- Chat transport 不是正式證據；Reviewer 回傳必須是 canonical two-field wrapper，且須由 Human transport attestation 綁定原始 payload SHA-256。
- 任一 Reviewer BLOCKER、任何無效 transport、任何非 canonical payload、任何 forbidden/out-of-scope read 或 fresh QA failure，Aggregator 必須判定 NO-GO。

## Suggested next step

由 Human 逐一建立四個全新頂層 Codex Task，分別貼入：

1. `review-packages/source-integrity-review/standalone-top-level-reviewer-prompt.md`
2. `review-packages/source-authority-review/standalone-top-level-reviewer-prompt.md`
3. `review-packages/scope-contamination-review/standalone-top-level-reviewer-prompt.md`
4. `review-packages/compatibility-review/standalone-top-level-reviewer-prompt.md`

完成四份 canonical Reviewer payload 與四份 Human transport attestation 後，才可使用 `review-packages/source-scope-aggregation-r1/standalone-top-level-aggregator-prompt.md` 啟動 Aggregator R1。不要提前啟動 Architecture Reconciliation。
