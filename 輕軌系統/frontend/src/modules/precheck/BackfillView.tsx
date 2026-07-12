import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileCheck2, Plus, Printer, Save, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/auth/AuthContext";
import { rolePolicies } from "../../shared/auth/rolePolicy";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { formatDate } from "../../shared/utils/date";
import { PageHeader, Panel, StatusBadge } from "../../shared/ui";
import { completeBackfill, createPrintJob, getBackfill, listBackfills, saveBackfill, type AttachmentResult, type CheckItemResult, type TemplateAttachment } from "./api";
import { listWarehouses } from "../inventory/api";

type AbnormalAction = "CREATE_C" | "UPDATE_C" | "RECORD_ONLY" | "";
type CheckDraft = { checkItemId: string; resultStatus: string; resultValue: string; remark: string; abnormalAction: AbnormalAction; linkedFaultWorkOrderId: string; abnormalReason: string };
type AttachmentDraft = { templateAttachmentId: string; itemKey: string; resultStatus: "正常" | "異常" | "N/A" | "未填"; resultValue: Record<string, unknown>; remark: string; abnormalAction: AbnormalAction; linkedFaultWorkOrderId: string; abnormalReason: string };

export function BackfillView() {
  const location = useLocation();
  const workOrderNo = decodeURIComponent(location.pathname.split("/").slice(3).join("/"));
  return workOrderNo ? <BackfillEditor workOrderNo={workOrderNo} /> : <BackfillList />;
}

function BackfillList() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole(rolePolicies.backfillWrite);
  const query = useQuery({ queryKey: ["precheck-backfills"], queryFn: ({ signal }) => listBackfills(signal) });
  return <Panel title="待回填清冊" description="只顯示已完成作業前 Word 列印、尚未完工的 P 工單。">{query.isPending ? <LoadingState /> : null}{query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}{query.data?.items.length ? <div className="table-frame"><table><thead><tr><th>P 工單</th><th>車號</th><th>等級</th><th>預排日期</th><th>已列印</th><th>異常</th><th>操作</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.work_order_no}><td>{item.work_order_no}<small>{item.title}</small></td><td>{item.train_no || "—"}</td><td>{item.pm_level || item.pm_code}</td><td>{item.planned_start_date || "—"}</td><td>{item.printed_days_ago ?? 0} 天前</td><td><StatusBadge tone={item.abnormal_count ? "danger" : "neutral"}>{item.abnormal_count}</StatusBadge></td><td><button className={canWrite ? "primary-button" : "secondary-button"} type="button" onClick={() => navigate(`/precheck/backfill/${encodeURIComponent(item.work_order_no)}`)}>{canWrite ? "開始回填" : "查看"}</button></td></tr>)}</tbody></table></div> : query.data ? <EmptyState title="目前沒有待回填工單" description="作業前 Word 列印完成後會進入此清冊。" /> : null}</Panel>;
}

function BackfillEditor({ workOrderNo }: { workOrderNo: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole(rolePolicies.backfillWrite);
  const query = useQuery({ queryKey: ["precheck-backfill", workOrderNo], queryFn: ({ signal }) => getBackfill(workOrderNo, signal) });
  const [cover, setCover] = useState({ actualWorkDate: "", actualStartAt: "", actualFinishAt: "", workforceCount: "", workforceHours: "", externalServiceNa: true, externalServiceDetail: "", maintenanceResult: "", actualMaterialNote: "", accumulatedMileage: "", materialWarehouseCode: "", materialStockStatus: "ISSUED" });
  const [dangerPeriods, setDangerPeriods] = useState<Array<{ startAt: string; endAt: string; note: string }>>([]);
  const [checks, setChecks] = useState<CheckDraft[]>([]);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [normalSections, setNormalSections] = useState<Record<string, boolean>>({});
  const [materialActual, setMaterialActual] = useState<Array<{ materialId: string; actualQty: string; note: string }>>([]);
  const [completion, setCompletion] = useState<{ abnormalCount: number; linkedFaultOrders: Array<{ id: string; workOrderNo: string }>; consumptionCount: number } | null>(null);
  const warehousesQuery = useQuery({ queryKey: ["warehouses", "backfill-consume"], queryFn: ({ signal }) => listWarehouses(signal) });

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    const wo = data.workOrder;
    const snapshot = (wo.backfill_snapshot as Record<string, unknown> | undefined) || {};
    setCover({
      actualWorkDate: String(wo.actual_work_date || ""),
      actualStartAt: String(wo.actual_start_at || "").slice(0, 16),
      actualFinishAt: String(wo.actual_finish_at || "").slice(0, 16),
      workforceCount: String(wo.workforce_count || ""), workforceHours: String(wo.workforce_hours || ""),
      externalServiceNa: wo.external_service_na !== false, externalServiceDetail: String(wo.external_service_detail || ""),
      maintenanceResult: String(wo.maintenance_result || ""), actualMaterialNote: String(wo.actual_material_note || ""), accumulatedMileage: String(snapshot.accumulatedMileage || ""),
      materialWarehouseCode: String(snapshot.materialWarehouseCode || ""), materialStockStatus: String(snapshot.materialStockStatus || "ISSUED"),
    });
    setDangerPeriods(data.dangerPeriods.map((period) => ({ startAt: String(period.start_at).slice(0, 16), endAt: String(period.end_at).slice(0, 16), note: period.note || "" })));
    setChecks(data.checks.map((item) => {
      const storedStatus = item.result_status || item.default_status || "未填";
      return { checkItemId: item.id, resultStatus: item.check_type !== "value" && storedStatus === "未填" ? "正常" : storedStatus, resultValue: item.result_value || "", remark: item.result_remark || "", abnormalAction: item.abnormal_action || "", linkedFaultWorkOrderId: item.linked_fault_work_order_id || item.open_fault_work_order_id || "", abnormalReason: item.abnormal_reason || "" };
    }));
    const sections: Record<string, boolean> = {};
    data.checks.filter((item) => item.check_type !== "value").forEach((item) => { sections[item.section] = sections[item.section] !== false && (item.result_status || item.default_status) !== "異常"; });
    setNormalSections(sections);
    setAttachments(buildAttachmentDrafts(data.attachments, data.attachmentResults));
    setMaterialActual(data.item.materials.map((material) => ({ materialId: material.material_id, actualQty: material.actual_qty || material.planned_qty || "0", note: material.note || "" })));
  }, [query.data]);

  const saveMutation = useMutation({ mutationFn: () => saveBackfill(workOrderNo, payload()), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["precheck-backfill", workOrderNo] }) });
  const completeMutation = useMutation({ mutationFn: () => completeBackfill(workOrderNo, payload()), onSuccess: async (result) => { setCompletion(result); await Promise.all([queryClient.invalidateQueries({ queryKey: ["precheck-backfills"] }), queryClient.invalidateQueries({ queryKey: ["precheck-backfill", workOrderNo] })]); } });
  const printMutation = useMutation({ mutationFn: () => createPrintJob(workOrderNo, { formTemplateId: query.data?.item.formTemplateId || query.data?.item.formTemplates[0]?.id || "", copies: 1 }, "POST_COMPLETION"), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["precheck-backfill", workOrderNo] }) });

  function payload() {
    return {
      ...cover,
      workforceCount: cover.workforceCount ? Number(cover.workforceCount) : null,
      workforceHours: cover.workforceHours ? Number(cover.workforceHours) : null,
      dangerPeriods,
      materials: materialActual,
      checkResults: checks,
      attachmentResults: attachments,
      materialWarehouseCode: cover.materialWarehouseCode,
      materialStockStatus: cover.materialStockStatus,
      snapshot: { accumulatedMileage: cover.accumulatedMileage, materialWarehouseCode: cover.materialWarehouseCode, materialStockStatus: cover.materialStockStatus },
    };
  }

  function updateCheck(id: string, changes: Partial<CheckDraft>) { setChecks((current) => current.map((item) => item.checkItemId === id ? { ...item, ...changes } : item)); }
  function setSectionNormal(section: string, normal: boolean) {
    setNormalSections((current) => ({ ...current, [section]: normal }));
    if (normal) setChecks((current) => current.map((item) => query.data?.checks.find((source) => source.id === item.checkItemId)?.section === section && query.data?.checks.find((source) => source.id === item.checkItemId)?.check_type !== "value" ? { ...item, resultStatus: "正常", abnormalAction: "", abnormalReason: "" } : item));
  }
  function updateAttachment(key: string, changes: Partial<AttachmentDraft>) { setAttachments((current) => current.map((item) => `${item.templateAttachmentId}:${item.itemKey}` === key ? { ...item, ...changes } : item)); }

  const completionIssues = useMemo(() => {
    const issues: string[] = [];
    if (!cover.actualWorkDate || !cover.actualStartAt || !cover.actualFinishAt) issues.push("實際施工日、開始與完工時間尚未完成");
    if (cover.actualStartAt && cover.actualFinishAt && new Date(cover.actualFinishAt) < new Date(cover.actualStartAt)) issues.push("完工時間早於開始時間");
    if (!cover.maintenanceResult.trim()) issues.push("維修處理情形尚未填寫");
    if (!cover.externalServiceNa && !cover.externalServiceDetail.trim()) issues.push("外包協力說明尚未填寫");
    if (query.data?.item.targetType === "VEHICLE" && !cover.accumulatedMileage) issues.push("累積里程尚未填寫");
    const sourceChecks = new Map((query.data?.checks || []).map((item) => [item.id, item]));
    for (const draft of checks) {
      const source = sourceChecks.get(draft.checkItemId);
      if (!source) continue;
      if (source.check_type === "checkbox" && draft.resultStatus === "未填") issues.push(`${source.item_no} 尚未判定`);
      if ((source.is_required || source.requires_value) && (draft.resultStatus === "未填" || (source.requires_value && !draft.resultValue))) issues.push(`${source.item_no} 必填量測尚未完成`);
      if (draft.resultStatus === "異常" && (!draft.abnormalAction || !draft.abnormalReason.trim())) issues.push(`${source.item_no} 異常尚未完成報修處理`);
    }
    for (const draft of attachments) {
      if (draft.resultStatus === "未填") issues.push(`${draft.itemKey} 附件尚未回填`);
      if (draft.resultStatus === "異常" && (!draft.abnormalAction || !draft.abnormalReason.trim())) issues.push(`${draft.itemKey} 異常尚未完成報修處理`);
      if ("airGapMm" in draft.resultValue) {
        for (const key of ["airGapMm", "wearDistanceMm", "surfaceStatus"]) if (!String(draft.resultValue[key] ?? "").trim()) issues.push(`${draft.itemKey} 缺少 ${key}`);
      }
    }
    if (dangerPeriods.some((period) => !period.startAt || !period.endAt || new Date(period.endAt) <= new Date(period.startAt))) issues.push("危險工時有未完成或無效時段");
    const actualQty = materialActual.reduce((sum, item) => sum + Math.max(0, Number(item.actualQty) || 0), 0);
    if (materialActual.some((item) => Number(item.actualQty) < 0)) issues.push("實際用料不可小於零");
    if (actualQty > 0 && !cover.materialWarehouseCode) issues.push("有實際用料時必須選擇耗用來源位置");
    return [...new Set(issues)];
  }, [attachments, checks, cover, dangerPeriods, materialActual, query.data]);

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  const data = query.data;
  if (!canWrite) {
    return <div className="page-stack">
      <PageHeader title={`${data.item.pmLabel || data.item.pmCode} 回填檢視`} description={`${workOrderNo} · 唯讀模式`} actions={<button className="secondary-button" type="button" onClick={() => navigate("/precheck/backfill")}>返回待回填</button>} />
      <Panel title="工單回填摘要" description="唯讀人員可查詢目前狀態，但不能修改、完工或輸出文件。">
        <dl className="detail-list"><div><dt>車號 / 設備</dt><dd>{data.item.trainNo || data.item.targetName || "—"}</dd></div><div><dt>預排日期</dt><dd>{data.item.planStartDate || "—"}</dd></div><div><dt>檢查項目</dt><dd>{data.checks.length} 項</dd></div><div><dt>附件</dt><dd>{data.attachments.length} 份</dd></div></dl>
      </Panel>
    </div>;
  }
  const grouped = new Map<string, CheckItemResult[]>();
  data.checks.filter((item) => item.check_type !== "value").forEach((item) => grouped.set(item.section, [...(grouped.get(item.section) || []), item]));
  const measurementItems = data.checks.filter((item) => item.check_type === "value");
  const abnormalCount = checks.filter((item) => item.resultStatus === "異常").length + attachments.filter((item) => item.resultStatus === "異常").length;

  return <div className="page-stack"><PageHeader title={`${data.item.pmLabel || data.item.pmCode} 完工回填`} description={`${workOrderNo} · ${data.item.trainNo || data.item.targetName || "機廠設備"}`} actions={<button className="secondary-button" type="button" onClick={() => navigate("/precheck/backfill")}>返回待回填</button>} />
    <Panel title="Part 1：封面完工資料" description="作業前不再修改；此處保存實際施工與完工追蹤資料。"><div className="backfill-form-grid"><Field label="實際施工日期"><input type="date" value={cover.actualWorkDate} onChange={(event) => setCover((current) => ({ ...current, actualWorkDate: event.target.value }))} /></Field><Field label="實際開始時間"><input type="datetime-local" value={cover.actualStartAt} onChange={(event) => setCover((current) => ({ ...current, actualStartAt: event.target.value }))} /></Field><Field label="實際完工時間"><input type="datetime-local" value={cover.actualFinishAt} onChange={(event) => setCover((current) => ({ ...current, actualFinishAt: event.target.value }))} /></Field><Field label="自有人力人數"><input type="number" min="0" value={cover.workforceCount} onChange={(event) => setCover((current) => ({ ...current, workforceCount: event.target.value }))} /></Field><Field label="自有人力工時"><input type="number" min="0" step="0.1" value={cover.workforceHours} onChange={(event) => setCover((current) => ({ ...current, workforceHours: event.target.value }))} /></Field><Field label="外包協力"><label className="toggle-field"><input type="checkbox" checked={cover.externalServiceNa} onChange={(event) => setCover((current) => ({ ...current, externalServiceNa: event.target.checked }))} /><span>本項 N/A</span></label></Field>{!cover.externalServiceNa ? <Field label="外包協力說明"><input value={cover.externalServiceDetail} onChange={(event) => setCover((current) => ({ ...current, externalServiceDetail: event.target.value }))} /></Field> : null}<Field label="維修處理情形" wide><textarea rows={4} value={cover.maintenanceResult} onChange={(event) => setCover((current) => ({ ...current, maintenanceResult: event.target.value }))} /></Field></div>
      <div className="danger-periods"><header><h3>危險工時</h3><button className="secondary-button" type="button" onClick={() => setDangerPeriods((current) => [...current, { startAt: "", endAt: "", note: "" }])}><Plus size={15} />新增時段</button></header>{dangerPeriods.map((period, index) => <div key={index}><input type="datetime-local" value={period.startAt} onChange={(event) => setDangerPeriods(dangerPeriods.map((row, rowIndex) => rowIndex === index ? { ...row, startAt: event.target.value } : row))} /><span>至</span><input type="datetime-local" value={period.endAt} onChange={(event) => setDangerPeriods(dangerPeriods.map((row, rowIndex) => rowIndex === index ? { ...row, endAt: event.target.value } : row))} /><input placeholder="說明" value={period.note} onChange={(event) => setDangerPeriods(dangerPeriods.map((row, rowIndex) => rowIndex === index ? { ...row, note: event.target.value } : row))} /><button className="icon-button" type="button" aria-label="移除時段" onClick={() => setDangerPeriods(dangerPeriods.filter((_, rowIndex) => rowIndex !== index))}><XCircle size={16} /></button></div>)}</div>
    </Panel>
    <Panel title="Part 2：檢查表回填" description={`依 ${data.item.pmCode} 模板顯示；異常細項直接連動 C 工單。`}><div className="check-section-grid">{[...grouped.entries()].map(([section, items]) => <section key={section} className="check-section"><header><div><h3>{section}</h3><small>{normalSections[section] ? "本區段全部正常" : "逐項回填"}</small></div><label className="toggle-field"><input type="checkbox" checked={normalSections[section] ?? true} onChange={(event) => setSectionNormal(section, event.target.checked)} /><span>全部正常</span></label></header>{!normalSections[section] ? <div className="check-items">{items.map((item) => { const draft=checks.find((row)=>row.checkItemId===item.id)!; return <CheckRow key={item.id} item={item} draft={draft} update={(changes)=>updateCheck(item.id,changes)} />; })}</div> : null}</section>)}</div></Panel>
    <Panel title="量測型項目" description="累積里程與模板量測值永遠顯示；超出上下限自動判定異常。"><div className="measurement-grid"><Field label="累積里程 km"><input type="number" min="0" value={cover.accumulatedMileage} onChange={(event)=>setCover((current)=>({...current,accumulatedMileage:event.target.value}))}/></Field>{measurementItems.map((item)=>{const draft=checks.find((row)=>row.checkItemId===item.id)!;return <MeasurementField key={item.id} item={item} draft={draft} update={(changes)=>updateCheck(item.id,changes)}/>;})}</div></Panel>
    {data.attachments.length ? <Panel title="Part 4：附件回填" description="附件仍由原始 Word 列印；HTML 保存可追蹤的 X 標記與量測資料。"><div className="attachment-stack">{data.attachments.map((attachment)=>attachment.attachment_type==="SEAT_MAP"?<SeatAttachment key={attachment.id} attachment={attachment} drafts={attachments.filter((item)=>item.templateAttachmentId===attachment.id)} update={updateAttachment}/>:attachment.attachment_type==="MEASUREMENT_TABLE"?<BrakeAttachment key={attachment.id} attachment={attachment} drafts={attachments.filter((item)=>item.templateAttachmentId===attachment.id)} update={updateAttachment}/>:null)}</div></Panel> : null}
    <Panel title="實際用料與異常彙整" description="完工後保存實際耗用；異常必須逐項選擇建立/更新 C 工單或主管授權僅記錄。"><div className="backfill-material-source"><Field label="耗用來源位置"><select value={cover.materialWarehouseCode} onChange={(event)=>setCover((current)=>({...current,materialWarehouseCode:event.target.value}))}><option value="">請選擇分存站 / 現場</option>{warehousesQuery.data?.items.filter((warehouse)=>warehouse.location_type!=="CENTER_WAREHOUSE").map((warehouse)=><option key={warehouse.id} value={warehouse.warehouse_code}>{warehouse.warehouse_code}｜{warehouse.warehouse_name}</option>)}</select></Field><Field label="庫存狀態"><select value={cover.materialStockStatus} onChange={(event)=>setCover((current)=>({...current,materialStockStatus:event.target.value}))}><option value="ISSUED">已領料</option><option value="IN_USE">使用中</option></select></Field></div><div className="material-edit-list">{data.item.materials.map((material)=>{const draft=materialActual.find((row)=>row.materialId===material.material_id);return <div key={material.material_id}><span>{material.material_name}<small>{material.part_no}</small></span><input type="number" min="0" step="0.001" value={draft?.actualQty||"0"} onChange={(event)=>setMaterialActual(materialActual.map((row)=>row.materialId===material.material_id?{...row,actualQty:event.target.value}:row))}/><em>{material.unit}</em></div>;})}</div><Field label="實際用料 / 領料備註" wide><textarea rows={4} value={cover.actualMaterialNote} onChange={(event)=>setCover((current)=>({...current,actualMaterialNote:event.target.value}))}/></Field><div className="abnormal-summary"><AlertTriangle size={18}/><strong>本次異常 {abnormalCount} 筆</strong><span>{abnormalCount ? "請確認每一筆都已選擇報修處理。" : "目前全部正常。"}</span></div>{completionIssues.length?<div className="completion-issues"><strong>尚有 {completionIssues.length} 項不能完工</strong><ul>{completionIssues.slice(0,8).map((issue)=><li key={issue}>{issue}</li>)}</ul></div>:null}
      {(saveMutation.isError||completeMutation.isError||printMutation.isError)?<ErrorState title="回填操作失敗" error={saveMutation.error||completeMutation.error||printMutation.error}/>:null}
      {completion?<div className="completion-result"><FileCheck2 size={20}/><div><strong>完工成功，已連動 {completion.linkedFaultOrders.length} 張 C 工單</strong><span>已過帳 {completion.consumptionCount} 筆實際用料，可再次輸出封面與附件供蓋章。</span></div><button className="primary-button" type="button" onClick={()=>printMutation.mutate()} disabled={printMutation.isPending||!data.item.formTemplateId}><Printer size={16}/>輸出完工 Word</button></div>:<div className="button-row"><button className="secondary-button" type="button" onClick={()=>saveMutation.mutate()} disabled={saveMutation.isPending}><Save size={16}/>暫存草稿</button><button className="primary-button" type="button" onClick={()=>completeMutation.mutate()} disabled={completeMutation.isPending||completionIssues.length>0}><CheckCircle2 size={16}/>確認完工</button></div>}
    </Panel>
  </div>;
}

function Field({ label, wide=false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={`stack-field ${wide?"is-wide":""}`}><span>{label}</span>{children}</label>; }

function CheckRow({ item, draft, update }: { item: CheckItemResult; draft: CheckDraft; update(changes: Partial<CheckDraft>): void }) { return <div className={`check-row ${draft.resultStatus==="異常"?"is-abnormal":""}`}><div><strong>{item.item_no} {item.item_description}</strong>{item.open_fault_work_order_no?<small>既有未結 C 工單：{item.open_fault_work_order_no} · {item.open_fault_status}</small>:null}</div><select value={draft.resultStatus} onChange={(event)=>update({resultStatus:event.target.value,abnormalAction:event.target.value==="異常"?draft.abnormalAction:""})}><option>正常</option><option>異常</option><option>N/A</option><option>未填</option></select>{draft.resultStatus==="異常"?<AbnormalActionEditor action={draft.abnormalAction} reason={draft.abnormalReason} existingId={draft.linkedFaultWorkOrderId||item.open_fault_work_order_id||""} existingNo={item.open_fault_work_order_no||item.linked_fault_work_order_no} update={update}/>:null}</div>; }

function MeasurementField({ item, draft, update }: { item: CheckItemResult; draft: CheckDraft; update(changes: Partial<CheckDraft>): void }) { function change(value:string){const numeric=Number(value);const abnormal=value!==""&&((item.min_value!==undefined&&numeric<Number(item.min_value))||(item.max_value!==undefined&&numeric>Number(item.max_value)));update({resultValue:value,resultStatus:abnormal?"異常":value?"正常":"未填"});}return <div className={`measurement-field ${draft.resultStatus==="異常"?"is-abnormal":""}`}><label><span>{item.item_no} {item.item_description}</span><small>{item.standard_value||[item.min_value&&`≥ ${item.min_value}`,item.max_value&&`≤ ${item.max_value}`].filter(Boolean).join("、")} {item.unit||""}</small><input type="number" step="any" value={draft.resultValue} onChange={(event)=>change(event.target.value)} required={item.is_required||item.requires_value}/></label>{draft.resultStatus==="異常"?<AbnormalActionEditor action={draft.abnormalAction} reason={draft.abnormalReason} existingId={draft.linkedFaultWorkOrderId||item.open_fault_work_order_id||""} existingNo={item.open_fault_work_order_no||item.linked_fault_work_order_no} update={update}/>:<StatusBadge tone={draft.resultStatus==="正常"?"success":"neutral"}>{draft.resultStatus}</StatusBadge>}</div>; }

function AbnormalActionEditor({ action, reason, existingId, existingNo, update }: { action: AbnormalAction; reason:string; existingId:string; existingNo?:string; update(changes: Record<string,string>):void }) { return <div className="abnormal-action"><select value={action} onChange={(event)=>update({abnormalAction:event.target.value,linkedFaultWorkOrderId:event.target.value==="UPDATE_C"?existingId:""})}><option value="">選擇報修處理</option><option value="CREATE_C">建立新 C 工單</option>{existingId?<option value="UPDATE_C">更新既有 C 工單{existingNo?` ${existingNo}`:""}</option>:null}<option value="RECORD_ONLY">僅記錄（主管）</option></select><input placeholder="異常說明 / 僅記錄原因" value={reason} onChange={(event)=>update({abnormalReason:event.target.value})}/></div>; }

function buildAttachmentDrafts(templates: TemplateAttachment[], results: AttachmentResult[]): AttachmentDraft[] { const output:AttachmentDraft[]=[]; for(const template of templates){const existing=results.filter((item)=>item.template_attachment_id===template.id);if(existing.length){output.push(...existing.map((item)=>({templateAttachmentId:template.id,itemKey:item.item_key,resultStatus:item.result_status,resultValue:item.result_value||{},remark:item.remark||"",abnormalAction:(item.abnormal_action||"") as AbnormalAction,linkedFaultWorkOrderId:item.linked_fault_work_order_id||"",abnormalReason:item.abnormal_reason||""})));continue;}if(template.attachment_type==="SEAT_MAP"){const modules=(template.schema_json.modules||[]) as Array<{code:string;rows:Array<Array<string|null>>}>;modules.forEach((module)=>module.rows.forEach((row,rowIndex)=>row.forEach((seat,columnIndex)=>{if(seat)output.push({templateAttachmentId:template.id,itemKey:`${module.code}-R${rowIndex+1}-C${columnIndex+1}`,resultStatus:"正常",resultValue:{seatType:seat},remark:"",abnormalAction:"",linkedFaultWorkOrderId:"",abnormalReason:""});})));}if(template.attachment_type==="MEASUREMENT_TABLE"){const points=(template.schema_json.points||[]) as Array<{key:string}>;points.forEach((point)=>output.push({templateAttachmentId:template.id,itemKey:point.key,resultStatus:"未填",resultValue:{airGapMm:"",wearDistanceMm:"",surfaceStatus:""},remark:"",abnormalAction:"",linkedFaultWorkOrderId:"",abnormalReason:""}));}}return output; }

function SeatAttachment({ attachment,drafts,update }: { attachment:TemplateAttachment;drafts:AttachmentDraft[];update(key:string,changes:Partial<AttachmentDraft>):void }) { const modules=(attachment.schema_json.modules||[]) as Array<{code:string;rows:Array<Array<string|null>>}>;return <article className="attachment-card"><header><div><h3>{attachment.attachment_name}</h3><p>點座椅標 X；每個 X 都必須選擇報修處理。</p></div><StatusBadge tone={drafts.some((item)=>item.resultStatus==="異常")?"danger":"success"}>{drafts.filter((item)=>item.resultStatus==="異常").length} 個 X</StatusBadge></header><div className="seat-map">{modules.map((module)=><section key={module.code}><h4>{module.code}</h4><div style={{gridTemplateColumns:`repeat(${Math.max(...module.rows.map((row)=>row.length))}, 28px)`}}>{module.rows.flatMap((row,rowIndex)=>row.map((seat,columnIndex)=>{if(!seat)return <span key={`${rowIndex}-${columnIndex}`} className="seat-space"/>;const itemKey=`${module.code}-R${rowIndex+1}-C${columnIndex+1}`;const draft=drafts.find((item)=>item.itemKey===itemKey)!;const key=`${attachment.id}:${itemKey}`;return <button key={itemKey} type="button" className={`seat is-${String(draft?.resultValue.seatType||seat).toLowerCase()} ${draft?.resultStatus==="異常"?"is-x":""}`} aria-label={`${itemKey} ${draft?.resultStatus}`} onClick={()=>update(key,{resultStatus:draft.resultStatus==="異常"?"正常":"異常",abnormalAction:"",abnormalReason:""})}>{draft?.resultStatus==="異常"?"X":seat==="P"?"P":""}</button>;}))}</div></section>)}</div><div className="attachment-abnormal-list">{drafts.filter((item)=>item.resultStatus==="異常").map((draft)=>{const key=`${attachment.id}:${draft.itemKey}`;return <div key={draft.itemKey}><strong>{draft.itemKey}</strong><AbnormalActionEditor action={draft.abnormalAction} reason={draft.abnormalReason} existingId={draft.linkedFaultWorkOrderId} update={(changes)=>update(key,changes)}/></div>;})}</div></article>; }

function BrakeAttachment({ attachment,drafts,update }: { attachment:TemplateAttachment;drafts:AttachmentDraft[];update(key:string,changes:Partial<AttachmentDraft>):void }) { const points=(attachment.schema_json.points||[]) as Array<{key:string;label:string}>;function change(draft:AttachmentDraft,field:string,value:string){const next={...draft.resultValue,[field]:value};const gap=Number(next.airGapMm);const abnormal=(next.airGapMm!==""&&(gap<6||gap>9))||next.surfaceStatus==="異常";update(`${attachment.id}:${draft.itemKey}`,{resultValue:next,resultStatus:abnormal?"異常":next.airGapMm&&next.wearDistanceMm&&next.surfaceStatus?"正常":"未填"});}return <article className="attachment-card"><header><div><h3>{attachment.attachment_name}</h3><p>六測點皆必填，空氣隙標準 6-9 mm。</p></div><StatusBadge tone={drafts.some((item)=>item.resultStatus==="異常")?"danger":"info"}>6 測點</StatusBadge></header><div className="brake-table"><div className="brake-head"><span>測點</span><span>空氣隙 mm</span><span>厚度至動面距離 mm</span><span>磁鐵表面</span><span>判定</span></div>{points.map((point)=>{const draft=drafts.find((item)=>item.itemKey===point.key)!;return <div key={point.key}><strong>{point.label}</strong><input type="number" step="0.1" value={String(draft?.resultValue.airGapMm||"")} onChange={(event)=>change(draft,"airGapMm",event.target.value)}/><input type="number" step="0.1" value={String(draft?.resultValue.wearDistanceMm||"")} onChange={(event)=>change(draft,"wearDistanceMm",event.target.value)}/><select value={String(draft?.resultValue.surfaceStatus||"")} onChange={(event)=>change(draft,"surfaceStatus",event.target.value)}><option value="">未填</option><option>正常</option><option>異常</option></select><StatusBadge tone={draft?.resultStatus==="異常"?"danger":draft?.resultStatus==="正常"?"success":"neutral"}>{draft?.resultStatus||"未填"}</StatusBadge>{draft?.resultStatus==="異常"?<div className="brake-abnormal"><AbnormalActionEditor action={draft.abnormalAction} reason={draft.abnormalReason} existingId={draft.linkedFaultWorkOrderId} update={(changes)=>update(`${attachment.id}:${draft.itemKey}`,changes)}/></div>:null}</div>;})}</div></article>; }
