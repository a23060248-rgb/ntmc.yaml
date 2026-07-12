import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Save, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { useAuth } from "../../shared/auth/AuthContext";
import { formatDate } from "../../shared/utils/date";
import { PageHeader, Panel, StatusBadge } from "../../shared/ui";
import {
  createFaultWorkOrder,
  finishFaultWorkOrder,
  getWorkOrder,
  getWorkOrderEvents,
  listWorkOrders,
  updateFaultWorkOrder,
  type CreateFaultInput,
} from "./api";

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
  const canEdit = hasRole(["system_admin", "maintenance_supervisor", "technician"]);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = searchParams.get("type") || "";
  const selectedNo = searchParams.get("selected") || "";
  const [searchDraft, setSearchDraft] = useState(searchParams.get("search") || "");
  const [showCreate, setShowCreate] = useState(false);
  const [faultDraft, setFaultDraft] = useState<CreateFaultInput>(emptyFault);
  const [finishDraft, setFinishDraft] = useState({ report: "", hasRemoval: false, removedSerial: "", installedSerial: "" });

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
  const statusMutation = useMutation({
    mutationFn: (status: string) => updateFaultWorkOrder(selectedNo, { status }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["work-order", selectedNo] }),
        queryClient.invalidateQueries({ queryKey: ["work-order-events", selectedNo] }),
      ]);
    },
  });
  const finishMutation = useMutation({
    mutationFn: () => finishFaultWorkOrder(selectedNo, {
      report: finishDraft.report,
      removed_serial: finishDraft.hasRemoval ? finishDraft.removedSerial : undefined,
      installed_serial: finishDraft.hasRemoval && finishDraft.installedSerial ? finishDraft.installedSerial : undefined,
    }),
    onSuccess: async () => {
      setFinishDraft({ report: "", hasRemoval: false, removedSerial: "", installedSerial: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["work-order", selectedNo] }),
        queryClient.invalidateQueries({ queryKey: ["work-order-events", selectedNo] }),
      ]);
    },
  });

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
        actions={canEdit ? <button className="primary-button" type="button" onClick={() => setShowCreate(true)}><Plus size={17} />新增 C 工單</button> : undefined}
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
                    <td>{item.trainNo || item.targetCode || "—"}</td><td>{item.status}</td><td>{item.assignedTo || "未派工"}</td><td>{formatDate(item.workOrderDate)}</td>
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
                <header><div><small>{detailQuery.data.type} 工單</small><h2>{detailQuery.data.workOrderNo}</h2></div><StatusBadge tone="info">{detailQuery.data.status}</StatusBadge></header>
                <dl className="detail-list">
                  <div><dt>標題</dt><dd>{detailQuery.data.title}</dd></div>
                  <div><dt>車號 / 對象</dt><dd>{detailQuery.data.trainNo || detailQuery.data.targetCode || "—"}</dd></div>
                  <div><dt>負責人</dt><dd>{detailQuery.data.assignedTo || "未派工"}</dd></div>
                  <div><dt>建立日期</dt><dd>{formatDate(detailQuery.data.createdAt, "yyyy/MM/dd HH:mm")}</dd></div>
                </dl>
                {detailQuery.data.type === "C" ? (
                  <>
                     {canEdit ? <>
                       <label>狀態<select value={detailQuery.data.status} onChange={(event) => statusMutation.mutate(event.target.value)} disabled={statusMutation.isPending}>{[["0","新建立"],["1","待確認"],["2","已派工"],["3","已完工"],["4","已覆核"],["5","已結案"],["10","觀察中"]].map(([value,label]) => <option key={value} value={value} disabled={value === "3"}>{label}</option>)}</select></label>
                       <label>完工報告<textarea value={finishDraft.report} onChange={(event) => setFinishDraft((current) => ({ ...current, report: event.target.value }))} rows={4} placeholder="填寫維修結果後確認完工" /></label>
                       <label className="toggle-field"><input type="checkbox" checked={finishDraft.hasRemoval} onChange={(event) => setFinishDraft((current) => ({ ...current, hasRemoval: event.target.checked, removedSerial: event.target.checked ? current.removedSerial : "", installedSerial: event.target.checked ? current.installedSerial : "" }))} /><span>本次有拆下周轉件，建立 R 工單</span></label>
                       {finishDraft.hasRemoval ? <div className="repair-link-fields"><label>拆下件序號 *<input required value={finishDraft.removedSerial} onChange={(event) => setFinishDraft((current) => ({ ...current, removedSerial: event.target.value }))} placeholder="例如 DCU-L-003" /></label><label>裝上件序號<input value={finishDraft.installedSerial} onChange={(event) => setFinishDraft((current) => ({ ...current, installedSerial: event.target.value }))} placeholder="未補件可留空" /></label></div> : null}
                       {(statusMutation.isError || finishMutation.isError) ? <ErrorState title="工單操作失敗" error={statusMutation.error || finishMutation.error} /> : null}
                       {finishMutation.data?.repairWorkOrder ? <p className="success-note">已建立 R 工單 {finishMutation.data.repairWorkOrder.workOrderNo}，可至周轉件管理接續處理。</p> : null}
                       <button className="primary-button" type="button" disabled={!finishDraft.report.trim() || (finishDraft.hasRemoval && !finishDraft.removedSerial.trim()) || finishMutation.isPending} onClick={() => finishMutation.mutate()}><CheckCircle2 size={16} />確認完工</button>
                     </> : <p className="muted-text">目前角色為唯讀，只能查看工單與歷程。</p>}
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
