import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { useAuth } from "../../shared/auth/AuthContext";
import { formatDate } from "../../shared/utils/date";
import { PageHeader, Panel, StatusBadge } from "../../shared/ui";
import {
  createFaultWorkOrder,
  getWorkOrder,
  getWorkOrderEvents,
  listWorkOrderActionOptions,
  listWorkOrders,
  type CreateFaultInput,
  type UnifiedWorkOrder,
} from "./api";
import { CWorkOrderActions } from "./CWorkOrderActions";

const workOrderTabs = [
  { value: "", label: "全部" },
  { value: "C", label: "C 故檢" },
  { value: "R", label: "R 維修" },
  { value: "J", label: "J 專案" },
  { value: "P", label: "P 預檢" },
];

const emptyFault: CreateFaultInput = { tsname: "", subsystem: "", category: "", phenomenon: "", fdesc: "", reporter: "" };

export function WorkOrdersPage() {
  const { hasRole } = useAuth();
  const canCreate = hasRole(["system_admin", "maintenance_supervisor", "technician"]);
  const canAct = hasRole(["system_admin", "maintenance_supervisor", "technician", "warehouse_staff"]);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = searchParams.get("type") || "";
  const selectedNo = searchParams.get("selected") || "";
  const [searchDraft, setSearchDraft] = useState(searchParams.get("search") || "");
  const [showCreate, setShowCreate] = useState(false);
  const [faultDraft, setFaultDraft] = useState<CreateFaultInput>(emptyFault);

  const listQuery = useQuery({
    queryKey: ["work-orders", type, searchParams.get("search") || ""],
    queryFn: ({ signal }) => listWorkOrders({ type, search: searchParams.get("search") || "", limit: 50 }, signal),
  });
  const detailQuery = useQuery({
    queryKey: ["work-order", selectedNo],
    queryFn: ({ signal }) => getWorkOrder(selectedNo, signal),
    enabled: Boolean(selectedNo),
  });
  const eventsQuery = useQuery({
    queryKey: ["work-order-events", selectedNo],
    queryFn: ({ signal }) => getWorkOrderEvents(selectedNo, signal),
    enabled: Boolean(selectedNo && detailQuery.data?.type === "C"),
  });
  const actionOptionsQuery = useQuery({
    queryKey: ["work-order-action-options"],
    queryFn: ({ signal }) => listWorkOrderActionOptions(signal),
    enabled: Boolean(selectedNo && detailQuery.data?.type === "C" && canAct),
  });

  useEffect(() => {
    if (!selectedNo && listQuery.data?.items[0]) {
      const next = new URLSearchParams(searchParams);
      next.set("selected", listQuery.data.items[0].workOrderNo);
      setSearchParams(next, { replace: true });
    }
  }, [listQuery.data, searchParams, selectedNo, setSearchParams]);

  const createMutation = useMutation({
    mutationFn: () => createFaultWorkOrder(faultDraft),
    onSuccess: async (result) => {
      setShowCreate(false);
      setFaultDraft(emptyFault);
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      const next = new URLSearchParams(searchParams);
      next.set("type", "C");
      next.set("selected", result.orderno);
      setSearchParams(next);
    },
  });

  async function refreshSelectedWorkOrder() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["work-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["work-order", selectedNo] }),
      queryClient.invalidateQueries({ queryKey: ["work-order-events", selectedNo] }),
      queryClient.invalidateQueries({ queryKey: ["turnaround"] }),
    ]);
  }

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "selected") next.delete("selected");
    setSearchParams(next);
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="工單管理"
        description="C 故檢、R 維修、J 專案與 P 工單統一查詢。"
        actions={canCreate ? <button className="primary-button" type="button" onClick={() => setShowCreate(true)}><Plus size={17} />新增 C 工單</button> : undefined}
      />

      <div className="segmented-nav" aria-label="工單類型">
        {workOrderTabs.map((tab) => <button key={tab.value || "all"} type="button" aria-pressed={type === tab.value} onClick={() => updateParam("type", tab.value)}>{tab.label}</button>)}
      </div>

      <Panel title="工單清冊" description="伺服器端篩選；一次最多顯示 50 筆。">
        <form className="toolbar" onSubmit={(event) => { event.preventDefault(); updateParam("search", searchDraft.trim()); }}>
          <label className="search-field"><Search size={17} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="工單號、車號或說明" /></label>
          <button className="secondary-button" type="submit">查詢</button>
          <StatusBadge tone="info">{listQuery.data ? `${listQuery.data.total} 筆` : "讀取中"}</StatusBadge>
        </form>

        <div className="split-view work-order-split">
          <div className="table-frame">
            {listQuery.isPending ? <LoadingState /> : null}
            {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} /> : null}
            {listQuery.data && !listQuery.data.items.length ? <EmptyState title="沒有符合的工單" description="請調整工單類型或搜尋條件。" /> : null}
            {listQuery.data?.items.length ? (
              <table>
                <thead><tr><th>工單號</th><th>類型</th><th>車號/設備</th><th>狀態</th><th>負責人</th><th>日期</th></tr></thead>
                <tbody>{listQuery.data.items.map((item) => (
                  <tr key={item.workOrderNo} className={selectedNo === item.workOrderNo ? "is-selected" : ""} onClick={() => updateParam("selected", item.workOrderNo)}>
                    <td><button className="table-action" type="button">{item.workOrderNo}</button><small>{item.title}</small></td>
                    <td><StatusBadge tone={item.type === "C" ? "danger" : item.type === "R" ? "warning" : "info"}>{item.type}</StatusBadge></td>
                    <td>{item.trainNo || item.targetCode || "—"}</td><td>{item.statusLabel || item.status}</td><td>{item.assignedTo || "未派工"}</td><td>{formatDate(item.workOrderDate)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : null}
          </div>

          <aside className="detail-pane work-order-detail">
            {!selectedNo ? <EmptyState title="請選擇工單" description="點選左側清冊查看詳情。" /> : null}
            {detailQuery.isPending && selectedNo ? <LoadingState /> : null}
            {detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /> : null}
            {detailQuery.data ? (
              <div className="detail-stack">
                <header><div><small>{detailQuery.data.type} 工單</small><h2>{detailQuery.data.workOrderNo}</h2></div><StatusBadge tone="info">{detailQuery.data.statusLabel || detailQuery.data.status}</StatusBadge></header>
                <dl className="detail-list">
                  <div><dt>標題</dt><dd>{detailQuery.data.title}</dd></div>
                  <div><dt>車號 / 對象</dt><dd>{detailQuery.data.trainNo || detailQuery.data.targetCode || "—"}</dd></div>
                  <div><dt>負責人</dt><dd>{detailQuery.data.assignedTo || "未派工"}</dd></div>
                  <div><dt>建立日期</dt><dd>{formatDate(detailQuery.data.createdAt, "yyyy/MM/dd HH:mm")}</dd></div>
                </dl>
                {detailQuery.data.type === "C" ? (
                  <>
                    <section className="original-report"><h3>原始報修</h3><p>{String(detailQuery.data.detail?.faultDescription || detailQuery.data.title)}</p><dl className="detail-list"><div><dt>報修系統</dt><dd>{String(detailQuery.data.detail?.mainSystem || "未分類")}</dd></div><div><dt>報修人</dt><dd>{String(detailQuery.data.detail?.reporter || "未填")}</dd></div><div><dt>LEVEL</dt><dd>{String(detailQuery.data.detail?.severityLevel || "未設定")}</dd></div></dl></section>
                    <CWorkflowSummary order={detailQuery.data} />
                    {canAct ? <CWorkOrderActions order={detailQuery.data} options={actionOptionsQuery.data} onCompleted={refreshSelectedWorkOrder} /> : <p className="muted-text">目前角色為唯讀，只能查看工單與歷程。</p>}
                    <section><h3>操作歷程</h3>{eventsQuery.data?.items.length ? <ol className="timeline">{eventsQuery.data.items.map((event, index) => <li key={`${event.date}-${index}`}><strong>{event.act}</strong><span>{event.date} · {event.actor}</span><small>{event.note}</small></li>)}</ol> : <p className="muted-text">尚無歷程。</p>}</section>
                  </>
                ) : <pre className="detail-json">{JSON.stringify(detailQuery.data.detail, null, 2)}</pre>}
              </div>
            ) : null}
          </aside>
        </div>
      </Panel>

      {showCreate ? (
        <aside className="edit-drawer" aria-label="新增 C 工單">
          <header><div><small>故障通報</small><h2>新增 C 工單</h2></div><button className="icon-button" type="button" aria-label="關閉新增工單" onClick={() => setShowCreate(false)}><X size={18} /></button></header>
          <form onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
            {([['tsname','車號'],['subsystem','子系統'],['category','故障類別'],['phenomenon','故障現象'],['reporter','報修人']] as const).map(([key,label]) => <label key={key}><span>{label} *</span><input required value={faultDraft[key]} onChange={(event) => setFaultDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
            <label><span>故障描述 *</span><textarea required rows={5} value={faultDraft.fdesc} onChange={(event) => setFaultDraft((current) => ({ ...current, fdesc: event.target.value }))} /></label>
            {createMutation.isError ? <ErrorState title="建單失敗" error={createMutation.error} /> : null}
            <button className="primary-button" type="submit" disabled={createMutation.isPending}><Save size={16} />建立 C 工單</button>
          </form>
        </aside>
      ) : null}
    </div>
  );
}

function CWorkflowSummary({ order }: { order: UnifiedWorkOrder }) {
  const workflow = order.workflow;
  if (!workflow) return null;
  return (
    <section className="c-workflow-summary">
      <h3>維修處理現況</h3>
      {workflow.activeShortage ? <article className="workflow-alert is-warning"><strong>缺料：{workflow.activeShortage.item_name}</strong><span>需求 {workflow.activeShortage.required_qty} {workflow.activeShortage.unit || ""} · {workflow.activeShortage.supply_status}</span><small>{workflow.activeShortage.expected_arrival_date ? `預計 ${formatDate(workflow.activeShortage.expected_arrival_date)} 到料 · ` : ""}{workflow.activeShortage.reason}</small></article> : null}
      {workflow.activeObservation ? <article className="workflow-alert is-info"><strong>觀察至 {formatDate(workflow.activeObservation.due_at, "yyyy/MM/dd HH:mm")}</strong><span>{workflow.activeObservation.observation_condition}</span><small>{workflow.activeObservation.responsible_name || "未指定負責人"} · {workflow.activeObservation.reason}</small></article> : null}
      {workflow.repairOrders.length ? <div><h4>關聯 R 工單</h4><ul className="workflow-list">{workflow.repairOrders.map((repair) => <li key={repair.work_order_no}><strong>{repair.work_order_no}</strong><span>{repair.removed_serial_no || "未綁定序號"}</span><small>{repair.disassembled_at ? formatDate(repair.disassembled_at, "yyyy/MM/dd HH:mm") : "尚無拆件時間"}</small></li>)}</ul></div> : null}
      {workflow.assignments.length ? <div><h4>派工 / 轉單歷程</h4><ol className="timeline">{workflow.assignments.map((assignment) => <li key={assignment.id}><strong>{assignment.assignment_type === "TRANSFER" ? "轉單" : "派工"}：{assignment.to_user_name || assignment.to_system || assignment.to_unit || "未指定"}</strong><span>{formatDate(assignment.created_at, "yyyy/MM/dd HH:mm")} · {assignment.assigned_by_name || "系統"}</span><small>{assignment.reason}</small></li>)}</ol></div> : <p className="muted-text">尚無派工或轉單紀錄。</p>}
    </section>
  );
}
