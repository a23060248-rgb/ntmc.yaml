import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileUp, Upload } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../shared/auth/AuthContext";
import { rolePolicies } from "../../shared/auth/rolePolicy";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { formatDate } from "../../shared/utils/date";
import { Panel, StatusBadge } from "../../shared/ui";
import { applyScheduleImport, listScheduleImports, previewScheduleImport, type NormalizedImportRow, type ScheduleTargetType } from "./api";

function parseCsv(text: string, defaultType: ScheduleTargetType): NormalizedImportRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  return lines.slice(1).map((line, index) => {
    const values = line.split(",").map((value) => value.trim());
    const record = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || ""]));
    const levels: Record<string, string> = {};
    for (let month = 1; month <= 12; month += 1) {
      const value = record[String(month)] || record[`${month}月`];
      if (value) levels[String(month)] = value;
    }
    return {
      rowNo: index + 2,
      targetKey: record.targetKey || record.車號 || record.設備代碼 || "",
      targetName: record.targetName || record.設備名稱 || record.車號 || "",
      targetType: (record.targetType as ScheduleTargetType) || defaultType,
      latestActualFinishDate: record.latestActualFinishDate || record.前次完工日 || undefined,
      deferToMonthEnd: ["true", "1", "是"].includes(record.deferToMonthEnd || record.可後排),
      levels,
    };
  });
}

const csvExample = `targetKey,targetName,targetType,latestActualFinishDate,1,2,3,4,5,6,7,8,9,10,11,12
101,101車,VEHICLE,2025-12-15,1M,1M,1M,6M,1M,1M,1M,3M,1M,5Y/1Y,1M,1M
WASH,自動洗車設備,DEPOT_EQUIPMENT,2025-12-01,,,3M,,,3M,,,1Y,,,3M`;

export function ImportView() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole(rolePolicies.scheduleWrite);
  const currentYear = new Date().getFullYear();
  const [sourceYear, setSourceYear] = useState(currentYear);
  const [targetType, setTargetType] = useState<ScheduleTargetType>("VEHICLE");
  const [sourceFile, setSourceFile] = useState("年度預排.csv");
  const [text, setText] = useState(csvExample);
  const [fileError, setFileError] = useState("");
  const importsQuery = useQuery({ queryKey: ["precheck-imports"], queryFn: ({ signal }) => listScheduleImports(signal) });
  const previewMutation = useMutation({ mutationFn: () => previewScheduleImport({ sourceFile, sourceYear, targetType, siteCode: "D", rows: parseCsv(text, targetType) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["precheck-imports"] }) });
  const applyMutation = useMutation({ mutationFn: (id: string) => applyScheduleImport(id), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["precheck-imports"] }), queryClient.invalidateQueries({ queryKey: ["precheck"] })]); } });

  async function readFile(file?: File) {
    if (!file) return;
    setSourceFile(file.name);
    if (/\.xlsx?$/i.test(file.name)) {
      setFileError("目前環境無法下載 Excel 解析 adapter；請先另存 CSV，資料表與 API 已保留同一匯入契約。");
      return;
    }
    setFileError("");
    setText(await file.text());
  }

  const preview = previewMutation.data;
  return <div className="page-stack">
    {canWrite ? <Panel title="年度預排匯入" description="先預覽與驗證，不直接覆寫排程；確認後才套用。">
      <div className="import-grid"><label><span>年度</span><input type="number" value={sourceYear} onChange={(event) => setSourceYear(Number(event.target.value))} /></label><label><span>資料類型</span><select value={targetType} onChange={(event) => setTargetType(event.target.value as ScheduleTargetType)}><option value="VEHICLE">車輛</option><option value="DEPOT_EQUIPMENT">機廠設備</option></select></label><label className="file-field"><span>CSV / Excel</span><input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => void readFile(event.target.files?.[0])} /></label></div>
      {fileError ? <div className="inline-notice is-warning">{fileError}</div> : null}
      <label className="import-editor"><span>標準化匯入內容</span><textarea rows={12} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} /></label>
      <div className="button-row"><button className="primary-button" type="button" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}><FileUp size={16} />預覽驗證</button><small className="muted-text">欄位：targetKey、targetName、targetType、latestActualFinishDate、1 至 12 月。</small></div>
      {previewMutation.isError ? <ErrorState title="匯入預覽失敗" error={previewMutation.error} /> : null}
    </Panel> : <Panel title="年度預排匯入" description="目前角色只能查看既有匯入批次。"><div className="inline-notice">唯讀人員不能建立、驗證或套用匯入批次。</div></Panel>}

    {preview ? <Panel title={`預覽：${preview.batch.batch_no}`} description="只有錯誤列為 0 才可套用。"><div className="metric-strip"><div className="metric-item"><span>總列數</span><strong>{preview.batch.total_rows}</strong><small>展開後月份工項</small></div><div className="metric-item"><span>有效</span><strong>{preview.batch.valid_rows}</strong><small>可建立排程</small></div><div className="metric-item"><span>錯誤</span><strong>{preview.batch.invalid_rows}</strong><small>需修正來源</small></div><div className="metric-item"><span>狀態</span><strong>{preview.batch.import_status}</strong><small>尚未套用</small></div></div>{preview.preview.errors.length ? <table><thead><tr><th>來源列</th><th>對象</th><th>月份</th><th>原因</th></tr></thead><tbody>{preview.preview.errors.map((error, index) => <tr key={`${error.rowNo}-${index}`}><td>{error.rowNo}</td><td>{error.targetKey || "—"}</td><td>{error.month || "—"}</td><td>{error.reasons.join("、")}</td></tr>)}</tbody></table> : <div className="import-ready"><CheckCircle2 size={20} /><span>驗證通過，可套用 {preview.preview.rows.length} 筆工項。</span><button className="primary-button" type="button" disabled={applyMutation.isPending} onClick={() => applyMutation.mutate(preview.batch.id)}><Upload size={16} />確認套用</button></div>}{applyMutation.isError ? <ErrorState title="套用失敗" error={applyMutation.error} /> : null}{applyMutation.data ? <div className="inline-notice">已套用 {applyMutation.data.applied} 筆，請到排班規劃產生日期。</div> : null}</Panel> : null}

    <Panel title="匯入批次" description="保留來源、驗證結果、套用時間與操作者。">
      {importsQuery.isPending ? <LoadingState /> : null}{importsQuery.isError ? <ErrorState error={importsQuery.error} /> : null}
      {importsQuery.data?.items.length ? <div className="table-frame"><table><thead><tr><th>批次號</th><th>來源</th><th>年度 / 類型</th><th>有效 / 錯誤</th><th>狀態</th><th>匯入時間</th></tr></thead><tbody>{importsQuery.data.items.map((item) => <tr key={item.id}><td>{item.batch_no}</td><td>{item.source_file || "標準化資料"}</td><td>{item.source_year} · {item.target_type === "VEHICLE" ? "車輛" : "機廠設備"}</td><td>{item.valid_rows} / {item.invalid_rows}</td><td><StatusBadge tone={item.import_status === "APPLIED" ? "success" : item.invalid_rows ? "danger" : "info"}>{item.import_status}</StatusBadge></td><td>{formatDate(item.imported_at, "yyyy/MM/dd HH:mm")}</td></tr>)}</tbody></table></div> : importsQuery.data ? <EmptyState title="尚無匯入批次" description="上傳第一份年度預排後會顯示。" /> : null}
    </Panel>
  </div>;
}
