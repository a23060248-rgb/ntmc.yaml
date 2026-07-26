# GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-02

本 Task 建立 existing-HEAD exact-manifest attestation 的修正候選。所有 producer 工件均為 `NON_AUTHORITATIVE_CANDIDATE_EVIDENCE`，不得用來替代 production validator、Work 唯讀驗收或 Human 採用。

- Trust Anchor model: `EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION`
- Anchor object: existing commit `22baa18784a081dd8c0d8a3ce177ba00363251de` and tree `c6f30a81ff45273aca851126160f2588937d2550`
- Branch: `codex/precheck-template-maintenance`
- Exact paths: 147 (106 + 41)
- New commit: false
- Empty commit: false
- New tree delta: false
- Assurance: `INTERNAL_CONSISTENCY_ONLY`
- Candidate status: `PROPOSED_NOT_ADOPTED`
- Current producer verdict: `BLOCKER_PENDING_FAIL_CLOSED_PRODUCTION_OBSERVATION`
- Git mutation: NO

只有無參數的 production validator 路徑可以產生完整候選判定；任何測試 fixture 或 discovery/bypass 形式都不能產生 PASS/READY。Task manifest 將在 HANDOFF 凍結後最後產生，並維持自排除與 JCS omit-field 契約。

下一 Gate：Work 唯讀驗收後，才可進行 Human Exact Trust Anchor Adoption Decision。
