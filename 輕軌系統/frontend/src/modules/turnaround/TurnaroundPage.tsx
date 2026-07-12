import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, History, List, PlayCircle, Rows3, Search, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { useAuth } from "../../shared/auth/AuthContext";
import { formatDate } from "../../shared/utils/date";
import { PageHeader, Panel, StatusBadge } from "../../shared/ui";
import {
  getAsset,
  getAssetEvents,
  getPositionHistory,
  getRepairOrder,
  listAssets,
  listMatrix,
  listRepairOrders,
  runRepairAction,
  updateRepairOrder,
  type MatrixCell,
} from "./api";

type View = "orders" | "matrix" | "assets" | "history";

const views: Array<{ value: View; label: string; icon: typeof List }> = [
  { value: "orders", label: "R 單清冊", icon: List },
  { value: "matrix", label: "坑位矩陣", icon: Rows3 },
  { value: "assets", label: "設備名稱總覽", icon: Boxes },
  { value: "history", label: "正式履歷", icon: History },
];

function statusTone(status?: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (!status) return "neutral";
  if (/正常|可用|已回庫|合格/.test(status)) return "success";
  if (/報廢|異常|逾期/.test(status)) return "danger";
  if (/送修|維修|待修|待處理/.test(status)) return "warning";
  return "info";
}

export function TurnaroundPage() {
  const { hasRole } = useAuth();
  const canEditRepair = hasRole(["system_admin", "maintenance_supervisor", "technician", "warehouse_staff"]);
  const canSuperviseRepair = hasRole(["system_admin", "maintenance_supervisor"]);
  const canReturnStock = hasRole(["system_admin", "maintenance_supervisor", "warehouse_staff"]);
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "orders";
  const selected = params.get("selected") || "";
  const selectedPosition = params.get("position") || "";
  const [searchDraft, setSearchDraft] = useState(params.get("search") || "");
  const [matrixFilters, setMatrixFilters] = useState({ trainNo: "", moduleNo: "", groupCode: "" });
  const [editDraft, setEditDraft] = useState({ repairMethod: "", currentPlace: "", outsourcingStatus: "", acceptanceResult: "", nextAction: "" });
  const [actionDraft, setActionDraft] = useState({ action: "", vendorCode: "", warehouseCode: "", expectedReturnDate: "", note: "" });

  const orderListQuery = useQuery({
    queryKey: ["repair-orders", params.get("search") || ""],
    queryFn: ({ signal }) => listRepairOrders({ search: params.get("search") || "", limit: 50 }, signal),
    enabled: view === "orders",
  });
  const orderQuery = useQuery({
    queryKey: ["repair-order", selected],
    queryFn: ({ signal }) => getRepairOrder(selected, signal),
    enabled: Boolean(view === "orders" && selected),
  });
  const matrixQuery = useQuery({
    queryKey: ["turnaround-matrix", matrixFilters],
    queryFn: ({ signal }) => listMatrix(matrixFilters, signal),
    enabled: view === "matrix" || (view === "history" && Boolean(selectedPosition)),
  });
  const assetsQuery = useQuery({
    queryKey: ["turnaround-assets", params.get("search") || ""],
    queryFn: ({ signal }) => listAssets({ search: params.get("search") || "", limit: 100 }, signal),
    enabled: view === "assets" || (view === "history" && !selectedPosition),
  });
  const assetQuery = useQuery({
    queryKey: ["turnaround-asset", selected],
    queryFn: ({ signal }) => getAsset(selected, signal),
    enabled: Boolean((view === "assets" || view === "history") && selected),
  });
  const assetHistoryQuery = useQuery({
    queryKey: ["turnaround-asset-events", selected],
    queryFn: ({ signal }) => getAssetEvents(selected, signal),
    enabled: Boolean(view === "history" && selected && !selectedPosition),
  });
  const positionHistoryQuery = useQuery({
    queryKey: ["turnaround-position-events", selectedPosition],
    queryFn: ({ signal }) => getPositionHistory(selectedPosition, signal),
    enabled: Boolean(view === "history" && selectedPosition),
  });

  useEffect(() => {
    const item = orderQuery.data?.item;
    if (item) setEditDraft({ repairMethod: item.repairMethod || "", currentPlace: item.currentPlace || "", outsourcingStatus: item.outsourcingStatus || "", acceptanceResult: item.acceptanceResult || "", nextAction: item.nextAction || "" });
  }, [orderQuery.data]);

  useEffect(() => {
    const first = view === "orders" ? orderListQuery.data?.items[0]?.workOrderNo : view === "assets" ? assetsQuery.data?.items[0]?.asset_id : undefined;
    if (!selected && first) updateParams({ selected: first });
  }, [assetsQuery.data, orderListQuery.data, selected, view]);

  const updateMutation = useMutation({
    mutationFn: () => updateRepairOrder(selected, editDraft),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ["repair-orders"] }), queryClient.invalidateQueries({ queryKey: ["repair-order", selected] })]),
  });
  const actionMutation = useMutation({
    mutationFn: () => runRepairAction(selected, actionDraft),
    onSuccess: async () => {
      setActionDraft({ action: "", vendorCode: "", warehouseCode: "", expectedReturnDate: "", note: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["repair-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["repair-order", selected] }),
        queryClient.invalidateQueries({ queryKey: ["turnaround-matrix"] }),
        queryClient.invalidateQueries({ queryKey: ["turnaround-assets"] }),
      ]);
    },
  });

  function updateParams(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setParams(next);
  }

  function changeView(nextView: View) {
    setSearchDraft("");
    const next = new URLSearchParams();
    next.set("view", nextView);
    setParams(next);
  }

  function submitSearch() {
    updateParams({ search: searchDraft.trim() || undefined, selected: undefined });
  }

  function openAssetHistory(assetId: string) {
    const next = new URLSearchParams();
    next.set("view", "history");
    next.set("selected", assetId);
    setParams(next);
  }

  function openPositionHistory(cell: MatrixCell) {
    const next = new URLSearchParams();
    next.set("view", "history");
    next.set("position", cell.position_id);
    if (cell.asset_id) next.set("selected", cell.asset_id);
    setParams(next);
  }

  const selectedCell = matrixQuery.data?.items.find((item) => item.position_id === selectedPosition || item.position_id === selected);
  const matrixGroups = useMemo(() => {
    const rows = matrixQuery.data?.items || [];
    const groups = new Map<string, MatrixCell[]>();
    rows.forEach((row) => {
      const key = row.train_no || "未配置";
      groups.set(key, [...(groups.get(key) || []), row]);
    });
    return [...groups.entries()];
  }, [matrixQuery.data]);

  return (
    <div className="page-stack">
      <PageHeader title="周轉件管理" description="R 單是正式作業入口；坑位矩陣只呈現設備現況與判斷資訊。" />
      <div className="segmented-nav" role="tablist" aria-label="周轉件功能">
        {views.map((item) => <button key={item.value} type="button" role="tab" aria-selected={view === item.value} onClick={() => changeView(item.value)}><item.icon size={16} />{item.label}</button>)}
      </div>

      {view === "orders" ? <Panel title="R 單清冊" description="集中處理內修、外修、驗收、回庫與報廢。">
        <form className="toolbar" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}><label className="search-field"><Search size={17} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="R 單、C 單、序號、料號" /></label><button className="secondary-button" type="submit">查詢</button><StatusBadge tone="info">{orderListQuery.data ? `${orderListQuery.data.page.total} 筆` : "讀取中"}</StatusBadge></form>
        <div className="split-view turnaround-split">
          <div className="table-frame">
            {orderListQuery.isPending ? <LoadingState /> : null}{orderListQuery.isError ? <ErrorState error={orderListQuery.error} onRetry={() => void orderListQuery.refetch()} /> : null}
            {orderListQuery.data && !orderListQuery.data.items.length ? <EmptyState title="沒有 R 工單" description="由 C 工單拆下周轉件後建立 R 工單。" /> : null}
            {orderListQuery.data?.items.length ? <table><thead><tr><th>R 工單 / 來源 C 單</th><th>拆下件</th><th>處理方式</th><th>目前位置</th><th>狀態</th></tr></thead><tbody>{orderListQuery.data.items.map((row) => <tr key={row.workOrderNo} className={selected === row.workOrderNo ? "is-selected" : ""} onClick={() => updateParams({ selected: row.workOrderNo })}><td><button className="table-action" type="button">{row.workOrderNo}</button><small>{row.sourceFaultWorkOrderNo || "無來源 C 單"}</small></td><td>{row.removedSerialNo || "未綁定"}<small>{row.materialName || row.partNo || "—"}</small></td><td>{row.repairMethod}</td><td>{row.currentPlace}</td><td><StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge></td></tr>)}</tbody></table> : null}
          </div>
          <aside className="detail-pane turnaround-detail">
            {!selected ? <EmptyState title="請選擇 R 工單" description="正式操作集中在此詳情。" /> : null}
            {orderQuery.isPending && selected ? <LoadingState /> : null}{orderQuery.isError ? <ErrorState error={orderQuery.error} onRetry={() => void orderQuery.refetch()} /> : null}
            {orderQuery.data ? <div className="detail-stack"><header><div><small>{orderQuery.data.item.sourceFaultWorkOrderNo || "R 工單"}</small><h2>{orderQuery.data.item.workOrderNo}</h2></div><StatusBadge tone={statusTone(orderQuery.data.item.status)}>{orderQuery.data.item.status}</StatusBadge></header>
              <dl className="detail-list"><div><dt>拆下件序號</dt><dd>{orderQuery.data.item.removedSerialNo || "未綁定"}</dd></div><div><dt>原坑位</dt><dd>{orderQuery.data.item.originalPositionCode || orderQuery.data.item.originalLocationText || "—"}</dd></div><div><dt>目前位置</dt><dd>{orderQuery.data.item.currentPlace}</dd></div></dl>
              {canEditRepair ? <><div className="form-grid compact-form">{([['repairMethod','處理方式'],['currentPlace','目前位置'],['outsourcingStatus','外修狀態'],['acceptanceResult','驗收結果'],['nextAction','下一步']] as const).map(([key,label]) => <label key={key}><span>{label}</span><input value={editDraft[key]} onChange={(event) => setEditDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
              <button className="secondary-button" type="button" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}><Save size={16} />儲存處理資料</button>
              <section className="action-box"><h3>正式處理動作</h3><select value={actionDraft.action} onChange={(event) => setActionDraft((current) => ({ ...current, action: event.target.value }))}><option value="">選擇動作</option><option value="START_INTERNAL">開始內修</option>{canSuperviseRepair ? <><option value="SEND_EXTERNAL">送外修</option><option value="ACCEPT">驗收合格</option><option value="SCRAP">報廢結案</option></> : null}{canReturnStock ? <option value="RETURN_STOCK">修回入庫</option> : null}</select>{actionDraft.action === "SEND_EXTERNAL" ? <><input placeholder="廠商代碼" value={actionDraft.vendorCode} onChange={(event) => setActionDraft((current) => ({ ...current, vendorCode: event.target.value }))} /><input type="date" value={actionDraft.expectedReturnDate} onChange={(event) => setActionDraft((current) => ({ ...current, expectedReturnDate: event.target.value }))} /></> : null}<textarea rows={3} placeholder="處理說明" value={actionDraft.note} onChange={(event) => setActionDraft((current) => ({ ...current, note: event.target.value }))} /><button className="primary-button" type="button" disabled={!actionDraft.action || actionMutation.isPending} onClick={() => actionMutation.mutate()}><PlayCircle size={16} />執行動作</button></section></> : <p className="muted-text">目前角色為唯讀，只能查看 R 工單與設備履歷。</p>}
              {(updateMutation.isError || actionMutation.isError) ? <ErrorState title="R 工單更新失敗" error={updateMutation.error || actionMutation.error} /> : null}
              <section><h3>R 工單歷程</h3>{orderQuery.data.events.length ? <ol className="timeline">{orderQuery.data.events.map((event, index) => <li key={`${event.created_at}-${index}`}><strong>{event.action_code}</strong><span>{formatDate(event.created_at, "yyyy/MM/dd HH:mm")} · {event.actor_name || event.actor_text || "系統"}</span><small>{event.note || "—"}</small></li>)}</ol> : <p className="muted-text">尚無處理歷程。</p>}</section>
            </div> : null}
          </aside>
        </div>
      </Panel> : null}

      {view === "matrix" ? <Panel title="周轉件坑位矩陣" description="右側只顯示現況；正式操作請回 R 單清冊。">
        <div className="toolbar toolbar-wide"><input aria-label="車號" placeholder="車號" value={matrixFilters.trainNo} onChange={(event) => setMatrixFilters((current) => ({ ...current, trainNo: event.target.value }))} /><input aria-label="模組" placeholder="M1-M5" value={matrixFilters.moduleNo} onChange={(event) => setMatrixFilters((current) => ({ ...current, moduleNo: event.target.value }))} /><input aria-label="設備群組" placeholder="設備群組代碼" value={matrixFilters.groupCode} onChange={(event) => setMatrixFilters((current) => ({ ...current, groupCode: event.target.value }))} /><StatusBadge tone="info">{matrixQuery.data?.items.length || 0} 坑位</StatusBadge></div>
        {matrixQuery.isPending ? <LoadingState /> : null}{matrixQuery.isError ? <ErrorState error={matrixQuery.error} onRetry={() => void matrixQuery.refetch()} /> : null}
        {matrixQuery.data ? <div className="matrix-workspace"><div className="turnaround-matrix-table">{matrixGroups.map(([trainNo, cells]) => <section key={trainNo}><h3>{trainNo} 車</h3><div>{cells.map((cell) => <button key={cell.position_id} type="button" className={`matrix-cell is-${statusTone(cell.current_status)}`} aria-pressed={selected === cell.position_id} onClick={() => updateParams({ selected: cell.position_id, position: undefined })}><strong>{cell.group_code || cell.position_name}</strong><span>{cell.serial_no || "空坑"}</span><small>{cell.current_status || cell.position_status}</small></button>)}</div></section>)}</div><aside className="detail-pane matrix-current-pane">{(() => { const cell = matrixQuery.data.items.find((item) => item.position_id === selected); return cell ? <div className="detail-stack"><header><div><small>{cell.train_no} · {cell.module_no}</small><h2>{cell.serial_no || "空坑"}</h2></div><StatusBadge tone={statusTone(cell.current_status)}>{cell.current_status || cell.position_status}</StatusBadge></header><dl className="detail-list"><div><dt>坑位代碼</dt><dd>{cell.position_code}</dd></div><div><dt>設備名稱</dt><dd>{cell.group_name || cell.material_name || "—"}</dd></div><div><dt>系統</dt><dd>{cell.system_name || "—"}</dd></div><div><dt>設備序號</dt><dd>{cell.serial_no || "—"}</dd></div><div><dt>物料序號</dt><dd>{cell.part_no || "—"}</dd></div><div><dt>來源工單</dt><dd>{cell.source_work_order_no || "—"}</dd></div><div><dt>同型備品 / 庫房</dt><dd>{cell.warehouse_name || "請由設備總覽查詢"}</dd></div><div><dt>C / R 摘要</dt><dd>{[cell.open_c_work_order_no, cell.open_r_work_order_no].filter(Boolean).join(" / ") || "無未結工單"}</dd></div></dl><button className="secondary-button" type="button" onClick={() => openPositionHistory(cell)}><History size={16} />查看坑位履歷</button>{cell.asset_id ? <button className="secondary-button" type="button" onClick={() => openAssetHistory(cell.asset_id!)}><History size={16} />查看設備履歷</button> : null}</div> : <EmptyState title="請選擇坑位" description="右側只呈現目前狀態。" />; })()}</aside></div> : null}
      </Panel> : null}

      {view === "assets" ? <Panel title="設備名稱總覽" description="依序號查詢設備目前位置、同型備品與未結工單。">
        <form className="toolbar" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}><label className="search-field"><Search size={17} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="序號、料號、設備名稱" /></label><button className="secondary-button" type="submit">查詢</button><StatusBadge tone="info">{assetsQuery.data ? `${assetsQuery.data.page.total} 筆` : "讀取中"}</StatusBadge></form>
        <div className="split-view turnaround-split"><div className="table-frame">{assetsQuery.isPending ? <LoadingState /> : null}{assetsQuery.isError ? <ErrorState error={assetsQuery.error} /> : null}{assetsQuery.data?.items.length ? <table><thead><tr><th>設備序號</th><th>設備名稱</th><th>狀態</th><th>目前位置</th></tr></thead><tbody>{assetsQuery.data.items.map((row) => <tr key={row.asset_id} className={selected === row.asset_id ? "is-selected" : ""} onClick={() => updateParams({ selected: row.asset_id })}><td><button className="table-action" type="button">{row.serial_no}</button><small>{row.part_no}</small></td><td>{row.group_name || row.material_name}</td><td><StatusBadge tone={statusTone(row.current_status)}>{row.current_status}</StatusBadge></td><td>{row.train_no ? `${row.train_no} / ${row.position_code}` : row.warehouse_name || row.vendor_name || "未指定"}</td></tr>)}</tbody></table> : <EmptyState title="尚無設備序號" description="完成序號主檔匯入後會顯示。" />}</div><aside className="detail-pane turnaround-detail">{assetQuery.isPending && selected ? <LoadingState /> : null}{assetQuery.data ? <div className="detail-stack"><header><div><small>{String(assetQuery.data.item.part_no)}</small><h2>{String(assetQuery.data.item.serial_no)}</h2></div><StatusBadge tone={statusTone(String(assetQuery.data.item.current_status))}>{String(assetQuery.data.item.current_status)}</StatusBadge></header><dl className="detail-list"><div><dt>設備名稱</dt><dd>{String(assetQuery.data.item.material_name)}</dd></div><div><dt>車號 / 坑位</dt><dd>{String(assetQuery.data.item.train_no || "—")} / {String(assetQuery.data.item.position_code || "—")}</dd></div><div><dt>庫房 / 廠商</dt><dd>{String(assetQuery.data.item.warehouse_name || assetQuery.data.item.vendor_name || "—")}</dd></div></dl><section><h3>同型備品</h3>{assetQuery.data.sameGroupSpares.length ? <ul className="plain-list">{assetQuery.data.sameGroupSpares.map((spare) => <li key={spare.asset_id}>{spare.serial_no}<StatusBadge tone={statusTone(spare.current_status)}>{spare.current_status}</StatusBadge></li>)}</ul> : <p className="muted-text">目前沒有同型庫房備品。</p>}</section><section><h3>未結 C / R 工單</h3>{assetQuery.data.openOrders.length ? <ul className="plain-list">{assetQuery.data.openOrders.map((order) => <li key={order.work_order_no}>{order.work_order_no}<span>{order.status}</span></li>)}</ul> : <p className="muted-text">沒有未結工單。</p>}</section><button className="secondary-button" type="button" onClick={() => openAssetHistory(String(assetQuery.data.item.id))}><History size={16} />查看設備履歷</button></div> : <EmptyState title="請選擇設備" description="點選序號查看現況。" />}</aside></div>
      </Panel> : null}

      {view === "history" ? <Panel title={selectedPosition ? "坑位履歷" : "設備序號履歷"} description="履歷獨立於矩陣現況，事件不可直接刪除。">
        {selectedPosition ? <>{positionHistoryQuery.isPending ? <LoadingState /> : null}{positionHistoryQuery.isError ? <ErrorState error={positionHistoryQuery.error} /> : null}{positionHistoryQuery.data?.items.length ? <HistoryTable items={positionHistoryQuery.data.items} /> : <EmptyState title="此坑位尚無事件" description="設備拆裝後會產生履歷。" />}</> : <div className="split-view turnaround-split"><div className="table-frame">{assetsQuery.data?.items.length ? <table><thead><tr><th>設備序號</th><th>設備名稱</th><th>目前狀態</th></tr></thead><tbody>{assetsQuery.data.items.map((row) => <tr key={row.asset_id} className={selected === row.asset_id ? "is-selected" : ""} onClick={() => updateParams({ selected: row.asset_id })}><td><button className="table-action" type="button">{row.serial_no}</button></td><td>{row.group_name || row.material_name}</td><td>{row.current_status}</td></tr>)}</tbody></table> : <EmptyState title="請先建立設備序號" description="設備履歷依 asset 追蹤。" />}</div><aside className="detail-pane turnaround-detail">{assetHistoryQuery.isPending && selected ? <LoadingState /> : null}{assetHistoryQuery.data?.items.length ? <HistoryTable items={assetHistoryQuery.data.items} /> : <EmptyState title="請選擇設備" description="查看完整設備事件。" />}</aside></div>}
      </Panel> : null}
    </div>
  );
}

function HistoryTable({ items }: { items: Array<{ id: string; event_type: string; from_status?: string; to_status?: string; work_order_no?: string; event_at: string; handled_by_name?: string; note?: string; serial_no?: string }> }) {
  return <div className="table-frame"><table><thead><tr><th>時間</th><th>事件</th><th>設備序號</th><th>狀態變化</th><th>工單 / 經手</th><th>備註</th></tr></thead><tbody>{items.map((row) => <tr key={row.id}><td>{formatDate(row.event_at, "yyyy/MM/dd HH:mm")}</td><td>{row.event_type}</td><td>{row.serial_no || "—"}</td><td>{row.from_status || "—"} → {row.to_status || "—"}</td><td>{row.work_order_no || row.handled_by_name || "—"}</td><td>{row.note || "—"}</td></tr>)}</tbody></table></div>;
}
