import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileCheck2, Printer, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/auth/AuthContext";
import { rolePolicies } from "../../shared/auth/rolePolicy";
import { listMasterData } from "../master-data/api";
import { apiUrl } from "../../shared/api/config";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { formatDate } from "../../shared/utils/date";
import { Panel, StatusBadge } from "../../shared/ui";
import { createPrintJob, getPackage, listPackages, updatePackage, type WorkPackage } from "./api";

export function PackageView() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole(rolePolicies.packageWrite);
  const [params, setParams] = useSearchParams();
  const selectedNo = params.get("selected") || "";
  const [searchDraft, setSearchDraft] = useState(params.get("search") || "");
  const [draft, setDraft] = useState({ maintenanceType: "預防性維修", executionType: "正常預排", formTemplateId: "", copies: 1, conditions: { airFilterMode: "N/A" }, preparationNote: "" });
  const [instrumentIds, setInstrumentIds] = useState<string[]>([]);
  const [wiIds, setWiIds] = useState<string[]>([]);
  const [materialDrafts, setMaterialDrafts] = useState<Array<{ materialId: string; plannedQty: string; note: string }>>([]);

  const listQuery = useQuery({ queryKey: ["precheck-packages", params.get("search") || ""], queryFn: ({ signal }) => listPackages({ search: params.get("search") || "", limit: 100 }, signal) });
  const detailQuery = useQuery({ queryKey: ["precheck-package", selectedNo], queryFn: ({ signal }) => getPackage(selectedNo, signal), enabled: Boolean(selectedNo) });
  const instrumentsQuery = useQuery({ queryKey: ["master-data", "instruments", "package"], queryFn: ({ signal }) => listMasterData("instruments", { limit: 200 }, signal) });
  const wiQuery = useQuery({ queryKey: ["master-data", "wi-documents", "package"], queryFn: ({ signal }) => listMasterData("wi-documents", { limit: 200 }, signal) });

  useEffect(() => {
    if (!selectedNo && listQuery.data?.items[0]) {
      const next = new URLSearchParams(params); next.set("selected", listQuery.data.items[0].work_order_no); setParams(next, { replace: true });
    }
  }, [listQuery.data, params, selectedNo, setParams]);

  useEffect(() => {
    const item = detailQuery.data?.item;
    if (!item) return;
    setDraft({
      maintenanceType: item.maintenanceType || "預防性維修",
      executionType: item.executionType || "正常預排",
      formTemplateId: item.formTemplateId || item.formTemplates[0]?.id || "",
      copies: 1,
      conditions: { airFilterMode: String((item.formSnapshot.conditions as Record<string, unknown> | undefined)?.airFilterMode || "N/A") },
      preparationNote: String(item.formSnapshot.preparationNote || ""),
    });
    setInstrumentIds(item.instruments.map((instrument) => instrument.id));
    setWiIds(item.wiDocuments.map((wi) => wi.id));
    setMaterialDrafts(item.materials.map((material) => ({ materialId: material.material_id, plannedQty: material.planned_qty || "0", note: material.note || "" })));
  }, [detailQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => updatePackage(selectedNo, { ...draft, instrumentIds, wiDocumentIds: wiIds, materials: materialDrafts }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["precheck-package", selectedNo] }),
  });
  const printMutation = useMutation({
    mutationFn: async () => {
      await updatePackage(selectedNo, { ...draft, instrumentIds, wiDocumentIds: wiIds, materials: materialDrafts });
      return createPrintJob(selectedNo, { formTemplateId: draft.formTemplateId, copies: draft.copies });
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["precheck-package", selectedNo] }), queryClient.invalidateQueries({ queryKey: ["precheck-packages"] })]);
    },
  });

  const packageItem = detailQuery.data?.item;
  const calibrationDate = packageItem?.planStartDate || new Date().toISOString().slice(0, 10);
  const calibrationProblems = (instrumentsQuery.data?.items || []).filter((item) => instrumentIds.includes(String(item.id))).filter((item) => {
    const due = String(item.calibration_due_date || "");
    return String(item.status || "") !== "可使用" || !due || due.slice(0, 10) < calibrationDate;
  });
  const readiness = useMemo(() => [
    { label: "工作類別", ok: Boolean(draft.maintenanceType) },
    { label: "儀器與校驗", ok: instrumentIds.length > 0 && calibrationProblems.length === 0 },
    { label: "W.I.No", ok: wiIds.length > 0 },
    { label: "用料與條件", ok: materialDrafts.every((item) => Number(item.plannedQty) >= 0) },
    { label: "Word 範本版本", ok: Boolean(draft.formTemplateId) },
  ], [calibrationProblems.length, draft.formTemplateId, draft.maintenanceType, instrumentIds.length, materialDrafts, wiIds.length]);
  const ready = readiness.every((item) => item.ok);

  function selectNo(no: string) { const next = new URLSearchParams(params); next.set("selected", no); setParams(next); }
  function toggle(list: string[], id: string, setter: (value: string[]) => void) { setter(list.includes(id) ? list.filter((value) => value !== id) : [...list, id]); }

  return <Panel title="P 工單作業包" description="HTML 只核對資料；正式輸出維持原始 Word 版面。">
    <form className="toolbar" onSubmit={(event) => { event.preventDefault(); const next = new URLSearchParams(params); if (searchDraft.trim()) next.set("search", searchDraft.trim()); else next.delete("search"); next.delete("selected"); setParams(next); }}><label className="search-field"><Search size={17} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="P 工單、車號或設備" /></label><button className="secondary-button" type="submit">查詢</button><StatusBadge tone="info">{listQuery.data?.items.length || 0} 筆</StatusBadge></form>
    <div className="split-view package-split"><div className="table-frame">{listQuery.isPending ? <LoadingState /> : null}{listQuery.isError ? <ErrorState error={listQuery.error} /> : null}{listQuery.data?.items.length ? <table><thead><tr><th>P 工單</th><th>車號 / 設備</th><th>級別</th><th>預排日</th><th>列印</th></tr></thead><tbody>{listQuery.data.items.map((item) => <tr key={item.work_order_no} className={selectedNo === item.work_order_no ? "is-selected" : ""} onClick={() => selectNo(item.work_order_no)}><td><button className="table-action" type="button">{item.work_order_no}</button><small>{item.title}</small></td><td>{item.train_no || item.target_name || "—"}</td><td>{item.pm_level || item.pm_code}</td><td>{item.planned_start_date || "—"}</td><td><StatusBadge tone={item.has_print ? "success" : "warning"}>{item.has_print ? "已列印" : "待確認"}</StatusBadge></td></tr>)}</tbody></table> : <EmptyState title="尚無 P 工單草稿" description="在排班規劃選擇排程並建立 P 工單。" />}</div>
      <aside className="detail-pane package-detail">{detailQuery.isPending && selectedNo ? <LoadingState /> : null}{detailQuery.isError ? <ErrorState error={detailQuery.error} /> : null}{packageItem ? <PackageEditor item={packageItem} draft={draft} setDraft={setDraft} instrumentIds={instrumentIds} setInstrumentIds={setInstrumentIds} wiIds={wiIds} setWiIds={setWiIds} materialDrafts={materialDrafts} setMaterialDrafts={setMaterialDrafts} allInstruments={instrumentsQuery.data?.items || []} allWis={wiQuery.data?.items || []} readiness={readiness} save={() => saveMutation.mutate()} print={() => printMutation.mutate()} saving={saveMutation.isPending} printing={printMutation.isPending} error={saveMutation.error || printMutation.error} ready={ready} editable={canWrite} toggle={toggle} /> : <EmptyState title="請選擇作業包" description="核對列印前資料與範本版本。" />}</aside>
    </div>
  </Panel>;
}

function PackageEditor({ item, draft, setDraft, instrumentIds, setInstrumentIds, wiIds, setWiIds, materialDrafts, setMaterialDrafts, allInstruments, allWis, readiness, save, print, saving, printing, error, ready, editable, toggle }: {
  item: WorkPackage;
  draft: { maintenanceType: string; executionType: string; formTemplateId: string; copies: number; conditions: { airFilterMode: string }; preparationNote: string };
  setDraft: React.Dispatch<React.SetStateAction<typeof draft>>;
  instrumentIds: string[]; setInstrumentIds(value: string[]): void; wiIds: string[]; setWiIds(value: string[]): void;
  materialDrafts: Array<{ materialId: string; plannedQty: string; note: string }>; setMaterialDrafts(value: Array<{ materialId: string; plannedQty: string; note: string }>): void;
  allInstruments: Array<Record<string, unknown>>; allWis: Array<Record<string, unknown>>;
  readiness: Array<{ label: string; ok: boolean }>; save(): void; print(): void; saving: boolean; printing: boolean; error: unknown; ready: boolean; editable: boolean;
  toggle(list: string[], id: string, setter: (value: string[]) => void): void;
}) {
  function applyAirFilterMode(mode: string) {
    setDraft((current) => ({ ...current, conditions: { ...current.conditions, airFilterMode: mode } }));
    setMaterialDrafts(materialDrafts.map((row) => {
      const material = item.materials.find((candidate) => candidate.material_id === row.materialId);
      if (!material?.condition_code || material.condition_code === "ALWAYS" || material.condition_code === "MANUAL_OPTION") return row;
      const matches = (material.condition_code === "AIR_FILTER_WASH" && mode === "WASH") || (material.condition_code === "AIR_FILTER_REPLACE" && mode === "REPLACE");
      return { ...row, plannedQty: matches ? String(material.template_default_qty || "0") : "0" };
    }));
  }

  return <div className="detail-stack"><header><div><small>{item.pmLabel || item.pmCode} · 模板 v{item.pmTemplateVersion || "—"}</small><h2>{item.workOrderNo}</h2></div><StatusBadge tone={item.status === "PRINTED" ? "success" : "info"}>{item.status}</StatusBadge></header>
    <dl className="detail-list"><div><dt>車號 / 設備</dt><dd>{item.trainNo || item.targetName || "—"}</dd></div><div><dt>預排日期</dt><dd>{item.planStartDate || "—"}</dd></div><div><dt>前次完工</dt><dd>{item.latestActualFinishDate || "—"}</dd></div><div><dt>模板快照</dt><dd>{item.pmCode} v{item.pmTemplateVersion || "—"} / 修訂 {item.pmTemplateRevision || "—"}</dd></div></dl>
    <section><h3>列印前確認</h3><div className="readiness-grid">{readiness.map((row) => <div key={row.label}><CheckCircle2 size={15} className={row.ok ? "is-ok" : "is-missing"} /><span>{row.label}</span><strong>{row.ok ? "完成" : "待確認"}</strong></div>)}</div></section>
    <section><h3>工作類別</h3><div className="segmented-nav"><button type="button" aria-pressed={draft.maintenanceType === "預防性維修"} onClick={() => setDraft((current) => ({ ...current, maintenanceType: "預防性維修" }))}>預防性維修</button><button type="button" aria-pressed={draft.maintenanceType === "大修"} onClick={() => setDraft((current) => ({ ...current, maintenanceType: "大修" }))}>大修</button></div></section>
    <section><h3>儀器與校驗效期</h3><div className="selection-list">{allInstruments.map((raw) => { const id = String(raw.id); const due = String(raw.calibration_due_date || ""); const expired = due && due < new Date().toISOString().slice(0,10); return <label key={id}><input type="checkbox" checked={instrumentIds.includes(id)} onChange={() => toggle(instrumentIds,id,setInstrumentIds)} /><span>{String(raw.instrument_no)} · {String(raw.instrument_name)}</span><StatusBadge tone={expired ? "danger" : "success"}>{due || String(raw.status || "未填效期")}</StatusBadge></label>; })}</div></section>
    <section><h3>工作說明書 W.I.No</h3><div className="selection-list">{allWis.map((raw) => { const id=String(raw.id); return <label key={id}><input type="checkbox" checked={wiIds.includes(id)} onChange={() => toggle(wiIds,id,setWiIds)} /><span>{String(raw.wi_no)} · {String(raw.wi_name || raw.title || "")}</span><small>{String(raw.version_no || "")}</small></label>; })}</div></section>
    <section><h3>表單預設用料</h3><div className="material-edit-list">{item.materials.map((material) => { const index=materialDrafts.findIndex((row)=>row.materialId===material.material_id); const value=materialDrafts[index]; return <div key={material.material_id}><span>{material.material_name}<small>{material.part_no}{material.condition_code && material.condition_code !== "ALWAYS" ? `｜${material.condition_code}` : ""}</small></span><input type="number" min="0" step="0.001" value={value?.plannedQty || "0"} onChange={(event)=>setMaterialDrafts(materialDrafts.map((row)=>row.materialId===material.material_id?{...row,plannedQty:event.target.value}:row))}/><em>{material.unit}</em></div>; })}</div><label className="condition-row"><span>空調濾網</span><select value={draft.conditions.airFilterMode} onChange={(event)=>applyAirFilterMode(event.target.value)}><option value="N/A">預設 N/A</option><option value="WASH">本次水洗</option><option value="REPLACE">本次更換</option></select></label></section>
    <section><h3>Word 範本</h3><label className="stack-field"><span>範本版本</span><select value={draft.formTemplateId} onChange={(event)=>setDraft((current)=>({...current,formTemplateId:event.target.value}))}><option value="">請選擇</option>{item.formTemplates.map((template)=><option key={template.id} value={template.id}>{template.template_name} · v{template.version_no}</option>)}</select></label><label className="stack-field"><span>份數</span><input type="number" min="1" max="20" value={draft.copies} onChange={(event)=>setDraft((current)=>({...current,copies:Number(event.target.value)}))}/></label></section>
    {error ? <ErrorState title="作業包操作失敗" error={error} /> : null}{editable ? <div className="button-row"><button className="secondary-button" type="button" onClick={save} disabled={saving}><Save size={16}/>儲存確認</button><button className="primary-button" type="button" onClick={print} disabled={!ready||printing}><Printer size={16}/>產生原始 Word</button></div> : <div className="inline-notice">唯讀人員只能核對作業包與列印紀錄。</div>}
    <section><h3>列印紀錄</h3>{item.printJobs.length?<ol className="timeline">{item.printJobs.map((job)=><li key={job.id}><strong>{job.print_stage === "PRE_WORK" ? "作業前" : "完工後"} · {job.template_name} v{job.version_no}</strong><span>{formatDate(job.requested_at,"yyyy/MM/dd HH:mm")} · {job.job_status}</span>{job.job_status === "READY"?<a className="text-link" href={apiUrl(`precheck/print-jobs/${job.id}/download`)}><Download size={14}/>下載 {job.output_file_name}</a>:<small>{job.error_message||"處理中"}</small>}</li>)}</ol>:<p className="muted-text">尚未產生 Word。</p>}</section>
  </div>;
}
