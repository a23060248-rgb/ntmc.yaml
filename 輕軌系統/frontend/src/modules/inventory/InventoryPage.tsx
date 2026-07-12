import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, PackageCheck, RotateCcw, Search, ShoppingCart, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { useAuth } from "../../shared/auth/AuthContext";
import { formatDate } from "../../shared/utils/date";
import { PageHeader, Panel, StatusBadge } from "../../shared/ui";
import {
  getMaterial,
  getMaterialTransactions,
  getMaterialUsage,
  listMaterials,
  listWarehouses,
  postInventoryMovement,
  type InventoryMovementInput,
} from "./api";

const movementLabels: Record<InventoryMovementInput["movementType"], string> = {
  ISSUE: "領料",
  RETURN: "退料",
  TRANSFER: "調撥",
  CONSUME: "工單耗用",
};

function number(value: string | number | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function InventoryPage() {
  const { hasRole } = useAuth();
  const canPostMovement = hasRole(["system_admin", "maintenance_supervisor", "warehouse_staff"]);
  const canConsume = hasRole(["system_admin", "maintenance_supervisor", "warehouse_staff", "technician"]);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPartNo = searchParams.get("selected") || "";
  const [searchDraft, setSearchDraft] = useState(searchParams.get("search") || "");
  const [detailTab, setDetailTab] = useState<"locations" | "transactions" | "usage">("locations");
  const [movementType, setMovementType] = useState<InventoryMovementInput["movementType"] | null>(null);
  const [movement, setMovement] = useState<InventoryMovementInput>({ movementType: "ISSUE", partNo: "", qty: 1, siteCode: "D" });

  const listQuery = useQuery({
    queryKey: ["materials", searchParams.get("search") || ""],
    queryFn: ({ signal }) => listMaterials({ search: searchParams.get("search") || "", limit: 50 }, signal),
  });
  const detailQuery = useQuery({
    queryKey: ["material", selectedPartNo],
    queryFn: ({ signal }) => getMaterial(selectedPartNo, signal),
    enabled: Boolean(selectedPartNo),
  });
  const transactionsQuery = useQuery({
    queryKey: ["material-transactions", selectedPartNo],
    queryFn: ({ signal }) => getMaterialTransactions(selectedPartNo, signal),
    enabled: Boolean(selectedPartNo && detailTab === "transactions"),
  });
  const usageQuery = useQuery({
    queryKey: ["material-usage", selectedPartNo],
    queryFn: ({ signal }) => getMaterialUsage(selectedPartNo, signal),
    enabled: Boolean(selectedPartNo && detailTab === "usage"),
  });
  const warehousesQuery = useQuery({ queryKey: ["warehouses"], queryFn: ({ signal }) => listWarehouses(signal) });

  useEffect(() => {
    if (!selectedPartNo && listQuery.data?.items[0]) {
      const next = new URLSearchParams(searchParams);
      next.set("selected", listQuery.data.items[0].partNo);
      setSearchParams(next, { replace: true });
    }
  }, [listQuery.data, searchParams, selectedPartNo, setSearchParams]);

  const movementMutation = useMutation({
    mutationFn: () => postInventoryMovement(movement),
    onSuccess: async () => {
      setMovementType(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["materials"] }),
        queryClient.invalidateQueries({ queryKey: ["material", selectedPartNo] }),
        queryClient.invalidateQueries({ queryKey: ["material-transactions", selectedPartNo] }),
      ]);
    },
  });

  const usageRows = useMemo(() => Object.entries(usageQuery.data?.byYear || {}), [usageQuery.data]);

  function selectPart(partNo: string) {
    const next = new URLSearchParams(searchParams);
    next.set("selected", partNo);
    setSearchParams(next);
  }

  function submitSearch() {
    const next = new URLSearchParams(searchParams);
    if (searchDraft.trim()) next.set("search", searchDraft.trim()); else next.delete("search");
    next.delete("selected");
    setSearchParams(next);
  }

  function openMovement(type: InventoryMovementInput["movementType"]) {
    const warehouses = warehousesQuery.data?.items || [];
    const central = warehouses.find((item) => item.location_type === "CENTER_WAREHOUSE");
    const destination = warehouses.find((item) => item.is_issue_destination);
    setMovementType(type);
    setMovement({
      movementType: type,
      idempotencyKey: crypto.randomUUID(),
      partNo: selectedPartNo,
      qty: 1,
      siteCode: "D",
      sourceWarehouseCode: central?.warehouse_code,
      destinationWarehouseCode: destination?.warehouse_code,
      warehouseCode: type === "CONSUME" ? destination?.warehouse_code : undefined,
      sourceStockStatus: type === "RETURN" ? "ISSUED" : "AVAILABLE",
      destinationStockStatus: type === "RETURN" ? "AVAILABLE" : "ISSUED",
    });
  }

  const selected = detailQuery.data?.item;
  const locations = detailQuery.data?.locations || [];
  const stockTone = selected && number(selected.stock.availableQty) <= number(selected.reorderPoint) ? "danger" : "success";

  return (
    <div className="page-stack">
      <PageHeader
        title="物料庫存"
        description="查詢物料位置、交易與用量；所有領退調撥均由 API 過帳。"
        actions={selectedPartNo && (canPostMovement || canConsume) ? <div className="button-row">
          {canPostMovement ? <><button className="secondary-button" type="button" onClick={() => openMovement("ISSUE")}><ShoppingCart size={16} />領料</button>
          <button className="secondary-button" type="button" onClick={() => openMovement("RETURN")}><RotateCcw size={16} />退料</button>
          <button className="secondary-button" type="button" onClick={() => openMovement("TRANSFER")}><ArrowLeftRight size={16} />調撥</button></> : null}
          {canConsume ? <button className="primary-button" type="button" onClick={() => openMovement("CONSUME")}><PackageCheck size={16} />工單耗用</button> : null}
        </div> : null}
      />

      <Panel title="物料清單" description="伺服器端查詢，一次顯示 50 筆。">
        <form className="toolbar" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
          <label className="search-field"><Search size={17} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="料號、名稱、規格" /></label>
          <button className="secondary-button" type="submit">查詢</button>
          <StatusBadge tone="info">{listQuery.data ? `${listQuery.data.page.total} 筆` : "讀取中"}</StatusBadge>
        </form>
        <div className="split-view inventory-split">
          <div className="table-frame">
            {listQuery.isPending ? <LoadingState /> : null}
            {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} /> : null}
            {listQuery.data && !listQuery.data.items.length ? <EmptyState title="沒有符合的物料" description="請調整搜尋條件。" /> : null}
            {listQuery.data?.items.length ? <table>
              <thead><tr><th>料號</th><th>名稱 / 規格</th><th>可用</th><th>已領</th><th>安全水位</th><th>建議</th></tr></thead>
              <tbody>{listQuery.data.items.map((item) => {
                const low = number(item.stock.availableQty) <= number(item.reorderPoint);
                return <tr key={item.partNo} className={selectedPartNo === item.partNo ? "is-selected" : ""} onClick={() => selectPart(item.partNo)}>
                  <td><button className="table-action" type="button">{item.partNo}</button></td>
                  <td>{item.materialName}<small>{item.spec || "無規格"}</small></td>
                  <td>{item.stock.availableQty} {item.unit}</td><td>{item.stock.issuedQty}</td><td>{item.reorderPoint}</td>
                  <td><StatusBadge tone={low ? "danger" : "success"}>{low ? "需補料" : "足量"}</StatusBadge></td>
                </tr>;
              })}</tbody>
            </table> : null}
          </div>

          <aside className="detail-pane inventory-detail">
            {!selectedPartNo ? <EmptyState title="請選擇物料" description="點選清單查看庫存詳情。" /> : null}
            {detailQuery.isPending && selectedPartNo ? <LoadingState /> : null}
            {detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /> : null}
            {selected ? <div className="detail-stack">
              <header><div><small>{selected.partNo}</small><h2>{selected.materialName}</h2></div><StatusBadge tone={stockTone}>{stockTone === "danger" ? "低於安全庫存" : "庫存正常"}</StatusBadge></header>
              <dl className="detail-list">
                <div><dt>規格</dt><dd>{selected.spec || "—"}</dd></div><div><dt>系統</dt><dd>{selected.systemName || "—"}</dd></div>
                <div><dt>可用 / 已領</dt><dd>{selected.stock.availableQty} / {selected.stock.issuedQty} {selected.unit}</dd></div>
                <div><dt>請購點</dt><dd>{selected.reorderPoint} {selected.unit}</dd></div>
              </dl>
              <div className="segmented-nav" aria-label="物料詳情">
                {([['locations','位置'],['transactions','交易'],['usage','用量趨勢']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={detailTab === value} onClick={() => setDetailTab(value)}>{label}</button>)}
              </div>
              {detailTab === "locations" ? locations.length ? <table><thead><tr><th>倉庫 / 儲位</th><th>狀態</th><th>數量</th></tr></thead><tbody>{locations.map((row, index) => <tr key={`${row.warehouse_code}-${row.bin_code}-${index}`}><td>{row.warehouse_name}<small>{row.bin_code || row.warehouse_code}</small></td><td>{row.stock_status}</td><td>{row.qty}</td></tr>)}</tbody></table> : <EmptyState title="尚無位置餘額" description="完成入庫後會顯示位置。" /> : null}
              {detailTab === "transactions" ? transactionsQuery.isPending ? <LoadingState /> : transactionsQuery.data?.items.length ? <ol className="timeline">{transactionsQuery.data.items.map((row, index) => <li key={`${row.transaction_at}-${index}`}><strong>{row.transaction_type} · {row.qty_change}</strong><span>{formatDate(row.transaction_at, "yyyy/MM/dd HH:mm")} · {row.warehouse_code || "—"}</span><small>{row.work_order_no || row.custodian_name || row.stock_status}</small></li>)}</ol> : <EmptyState title="尚無交易" description="過帳後會保留不可刪除的交易紀錄。" /> : null}
              {detailTab === "usage" ? usageQuery.isPending ? <LoadingState /> : usageRows.length ? <table><thead><tr><th>年度</th><th>領用</th><th>故障用量</th><th>預檢標準</th></tr></thead><tbody>{usageRows.map(([year, values]) => <tr key={year}><td>{year}</td><td>{values.issue || 0}</td><td>{values.fault || 0}</td><td>{values.pmStandard || 0}</td></tr>)}</tbody></table> : <EmptyState title="尚無用量歷史" description="工單耗用過帳後會累積趨勢。" /> : null}
            </div> : null}
          </aside>
        </div>
      </Panel>

      {movementType ? <aside className="edit-drawer" aria-label={`${movementLabels[movementType]}過帳`}>
        <header><div><small>庫存異動</small><h2>{movementLabels[movementType]}</h2></div><button className="icon-button" type="button" aria-label="關閉" onClick={() => setMovementType(null)}><X size={18} /></button></header>
        <form onSubmit={(event) => { event.preventDefault(); movementMutation.mutate(); }}>
          <label><span>料號</span><input value={movement.partNo} readOnly /></label>
          <label><span>數量 *</span><input type="number" min="0.001" step="0.001" required value={movement.qty} onChange={(event) => setMovement((current) => ({ ...current, qty: Number(event.target.value) }))} /></label>
          {movementType === "CONSUME" ? <label><span>耗用位置 *</span><select required value={movement.warehouseCode || ""} onChange={(event) => setMovement((current) => ({ ...current, warehouseCode: event.target.value }))}><option value="">請選擇</option>{warehousesQuery.data?.items.filter((item) => item.location_type !== "CENTER_WAREHOUSE").map((item) => <option key={item.id} value={item.warehouse_code}>{item.warehouse_name}</option>)}</select></label> : <>
            <label><span>來源倉庫 *</span><select required value={movement.sourceWarehouseCode || ""} onChange={(event) => setMovement((current) => ({ ...current, sourceWarehouseCode: event.target.value }))}><option value="">請選擇</option>{warehousesQuery.data?.items.map((item) => <option key={item.id} value={item.warehouse_code}>{item.warehouse_name}</option>)}</select></label>
            <label><span>目的倉庫 *</span><select required value={movement.destinationWarehouseCode || ""} onChange={(event) => setMovement((current) => ({ ...current, destinationWarehouseCode: event.target.value }))}><option value="">請選擇</option>{warehousesQuery.data?.items.map((item) => <option key={item.id} value={item.warehouse_code}>{item.warehouse_name}</option>)}</select></label>
          </>}
          <label><span>關聯工單</span><input value={movement.workOrderNo || ""} onChange={(event) => setMovement((current) => ({ ...current, workOrderNo: event.target.value }))} placeholder="P/C/R/J 工單號" /></label>
          <label><span>經手 / 保管人</span><input value={movement.custodianName || ""} onChange={(event) => setMovement((current) => ({ ...current, custodianName: event.target.value }))} /></label>
          <label><span>備註</span><textarea rows={4} value={movement.note || ""} onChange={(event) => setMovement((current) => ({ ...current, note: event.target.value }))} /></label>
          {movementMutation.isError ? <ErrorState title="過帳失敗" error={movementMutation.error} /> : null}
          <button className="primary-button" type="submit" disabled={movementMutation.isPending}>確認過帳</button>
        </form>
      </aside> : null}
    </div>
  );
}
