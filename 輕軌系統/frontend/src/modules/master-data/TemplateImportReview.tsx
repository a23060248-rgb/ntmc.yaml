import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileUp, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { StatusBadge } from "../../shared/ui";
import {
  applyTemplateImportBatch,
  approveAllTemplateImportRows,
  approveTemplateImportBatch,
  getTemplateImportBatch,
  listTemplateImportBatches,
  reviewTemplateImportRow,
  type ImportBatchStatus,
  type ImportRowStatus,
} from "./templateApi";

function tone(status: string) {
  if (["APPROVED", "APPLIED"].includes(status)) return "success" as const;
  if (["REJECTED", "INVALID"].includes(status)) return "danger" as const;
  return "warning" as const;
}

function label(status: ImportBatchStatus | ImportRowStatus) {
  const labels: Record<string, string> = {
    DRAFT: "草稿", VALIDATED: "待審核", VALID: "待審核", PENDING: "待驗證",
    INVALID: "需修正", APPROVED: "已核准", APPLIED: "已套用", REJECTED: "不匯入",
  };
  return labels[status] || status;
}

function shortDate(value?: string) {
  return value ? new Date(value).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" }) : "-";
}

export function TemplateImportReview({ pmCode, onApplied }: { pmCode: string; onApplied(templateId: string): void }) {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const batches = useQuery({
    queryKey: ["template-import-batches", pmCode],
    queryFn: ({ signal }) => listTemplateImportBatches({ pmCode, limit: 30 }, signal),
  });
  useEffect(() => {
    if (!selectedId && batches.data?.items[0]) setSelectedId(batches.data.items[0].id);
  }, [batches.data, selectedId]);
  const detail = useQuery({
    queryKey: ["template-import-batch", selectedId],
    queryFn: ({ signal }) => getTemplateImportBatch(selectedId, signal),
    enabled: Boolean(selectedId),
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["template-import-batches", pmCode] });
    await client.invalidateQueries({ queryKey: ["template-import-batch", selectedId] });
  };
  const approveAll = useMutation({ mutationFn: () => approveAllTemplateImportRows(selectedId), onSuccess: refresh });
  const approveBatch = useMutation({ mutationFn: () => approveTemplateImportBatch(selectedId), onSuccess: refresh });
  const applyBatch = useMutation({
    mutationFn: () => applyTemplateImportBatch(selectedId, window.prompt("新草稿版本號", "") || undefined),
    onSuccess: async ({ item }) => {
      await refresh();
      onApplied(item.id);
    },
  });
  const reviewRow = useMutation({
    mutationFn: ({ rowId, validationStatus }: { rowId: string; validationStatus: "APPROVED" | "REJECTED" }) =>
      reviewTemplateImportRow(selectedId, rowId, { validationStatus }),
    onSuccess: refresh,
  });

  const batch = detail.data?.item;
  const rows = detail.data?.rows || [];
  const pendingReviewCount = (batch?.summary?.VALID || 0) + (batch?.summary?.PENDING || 0) + (batch?.summary?.INVALID || 0);
  return <div className="template-import-review">
    <section className="template-import-sidebar">
      <div className="studio-action-row"><div><h3>Word 項目匯入批次</h3><p>來源資料只會進入草稿版本，已發布模板不受影響。</p></div><button className="icon-button" type="button" title="重新讀取" onClick={() => void batches.refetch()}><RefreshCw size={15} /></button></div>
      {batches.isPending ? <LoadingState /> : null}
      {batches.isError ? <ErrorState error={batches.error} onRetry={() => void batches.refetch()} /> : null}
      <div className="template-import-batch-list">
        {batches.data?.items.map((item) => <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}>
          <span><strong>{item.source_file_name}</strong><small>{item.row_count || item.total_rows} 項 · {shortDate(item.created_at)}</small></span>
          <StatusBadge tone={tone(item.import_status)}>{label(item.import_status)}</StatusBadge>
        </button>)}
      </div>
      {!batches.isPending && !batches.data?.items.length ? <EmptyState title="尚無匯入批次" description="先由 Word 盤點腳本建立待審核資料。" /> : null}
    </section>

    <section className="template-import-detail">
      {detail.isPending ? <LoadingState /> : null}
      {detail.isError ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : null}
      {batch ? <>
        <header className="template-import-header"><div><span>{pmCode} · 檢查項目盤點</span><h3>{batch.source_file_name}</h3><p>共 {batch.total_rows} 項；已核准 {batch.summary?.APPROVED || 0}、不匯入 {batch.summary?.REJECTED || 0}、待審核 {pendingReviewCount}。</p></div><div className="button-row"><StatusBadge tone={tone(batch.import_status)}>{label(batch.import_status)}</StatusBadge>{batch.import_status === "VALIDATED" ? <button className="secondary-button" type="button" disabled={approveAll.isPending} onClick={() => approveAll.mutate()}><CheckCircle2 size={15} />核准全部有效項目</button> : null}{batch.import_status === "VALIDATED" && !pendingReviewCount ? <button className="primary-button" type="button" disabled={approveBatch.isPending} onClick={() => approveBatch.mutate()}><CheckCircle2 size={15} />確認批次</button> : null}{batch.import_status === "APPROVED" ? <button className="primary-button" type="button" disabled={applyBatch.isPending} onClick={() => applyBatch.mutate()}><FileUp size={15} />套用為新草稿</button> : null}</div></header>
        <div className="inline-notice">核准或退回會保留來源頁碼與原始資料。套用後只建立新的 {pmCode} 草稿，不會發布，也不會改到既有工單。</div>
        <div className="table-frame template-import-table"><table><thead><tr><th>頁</th><th>區段</th><th>編號</th><th>檢查項目</th><th>型態／標準</th><th>狀態</th><th>審核</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
          <td>{row.source_page_no || "-"}</td><td>{row.section_name}</td><td>{row.item_no}</td><td>{row.item_description}</td><td>{row.check_type}{row.standard_value ? ` · ${row.standard_value}` : ""}{row.unit ? ` ${row.unit}` : ""}</td><td><StatusBadge tone={tone(row.validation_status)}>{label(row.validation_status)}</StatusBadge></td><td><div className="table-action-buttons">{batch.import_status === "VALIDATED" && row.validation_status !== "APPROVED" && row.validation_status !== "REJECTED" ? <><button className="icon-button" type="button" title="核准" disabled={reviewRow.isPending} onClick={() => reviewRow.mutate({ rowId: row.id, validationStatus: "APPROVED" })}><CheckCircle2 size={15} /></button><button className="icon-button danger" type="button" title="不匯入" disabled={reviewRow.isPending} onClick={() => reviewRow.mutate({ rowId: row.id, validationStatus: "REJECTED" })}><XCircle size={15} /></button></> : <span>-</span>}</div></td>
        </tr>)}</tbody></table></div>
      </> : !detail.isPending ? <EmptyState title="選擇一個匯入批次" description="從左側查看來源、審核狀態與檢查項目。" /> : null}
    </section>
  </div>;
}
