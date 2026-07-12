import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BarChart3, ClipboardList, Database, PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { getApiHealth, getDatabaseHealth } from "../../shared/api/health";
import { ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { MetricStrip, PageHeader, Panel, StatusBadge } from "../../shared/ui";
import { getDashboardSummary } from "./api";

export function DashboardPage() {
  const summary = useQuery({ queryKey: ["dashboard", "summary"], queryFn: ({ signal }) => getDashboardSummary(signal) });
  const apiHealth = useQuery({ queryKey: ["health", "api"], queryFn: ({ signal }) => getApiHealth(signal), refetchInterval: 60_000 });
  const databaseHealth = useQuery({ queryKey: ["health", "database"], queryFn: ({ signal }) => getDatabaseHealth(signal), refetchInterval: 60_000 });

  return (
    <div className="page-stack">
      <PageHeader
        title="主儀表板"
        description="維修、預檢、周轉件與物料的統一待辦入口。"
        actions={<div className="button-row"><Link className="secondary-button" to="/reports"><BarChart3 size={16}/>管理報表</Link><StatusBadge tone={apiHealth.data?.ok && databaseHealth.data?.ok ? "success" : "warning"}>{apiHealth.data?.ok && databaseHealth.data?.ok ? "API / DB 正常" : "資料服務待確認"}</StatusBadge></div>}
      />

      {summary.isPending ? <LoadingState label="讀取維修摘要" /> : null}
      {summary.isError ? <ErrorState error={summary.error} onRetry={() => void summary.refetch()} /> : null}
      {summary.data ? (
        <>
          <MetricStrip items={[
            { label: "未結 C 工單", value: String(summary.data.workOrders.C), hint: `逾期 ${summary.data.workOrders.overdue} 筆` },
            { label: "未結 P 工單", value: String(summary.data.workOrders.P), hint: "預檢管理" },
            { label: "R 維修中", value: String(summary.data.repair.repairing), hint: `待處理 ${summary.data.repair.pending} 筆` },
            { label: "物料警示", value: String(summary.data.materials.low_stock), hint: `共 ${summary.data.materials.total} 項` },
          ]} />

          <div className="dashboard-grid">
            <Panel title="今日工作列" description={`今日共 ${summary.data.today.length} 筆`}>
              <div className="summary-list">
                {summary.data.today.length ? summary.data.today.map((item) => (
                  <Link key={item.workOrderNo} to={`/work-orders?selected=${encodeURIComponent(item.workOrderNo)}`}>
                    <ClipboardList size={18} /><span><strong>{item.workOrderNo}</strong><small>{item.trainNo || "—"} · {item.title}</small></span><StatusBadge tone="info">{item.status}</StatusBadge>
                  </Link>
                )) : <div><Activity size={18} /><span>今日沒有已排定工單</span><StatusBadge>0</StatusBadge></div>}
              </div>
            </Panel>
            <Panel title="跨模組警示" description="可直接前往處理">
              <div className="summary-list">
                <Link to="/work-orders?status=overdue"><AlertTriangle size={18} /><span>逾期工單</span><StatusBadge tone="danger">{summary.data.workOrders.overdue}</StatusBadge></Link>
                <Link to="/turnaround"><PackageOpen size={18} /><span>周轉件需注意</span><StatusBadge tone="warning">{summary.data.assets.attention}</StatusBadge></Link>
                <Link to="/inventory?stock=low"><Database size={18} /><span>低於請購點</span><StatusBadge tone="warning">{summary.data.materials.low_stock}</StatusBadge></Link>
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
