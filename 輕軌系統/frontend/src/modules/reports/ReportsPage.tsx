import { useQuery } from "@tanstack/react-query";
import { format, startOfYear } from "date-fns";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { formatDate } from "../../shared/utils/date";
import { MetricStrip, PageHeader, Panel, StatusBadge } from "../../shared/ui";
import { getReport, type ReportKey } from "./api";

const reports: Array<{ key: ReportKey; label: string; description: string }> = [
  { key: "maintenance", label: "維修與逾期", description: "工單完成率、未結與逾期明細" },
  { key: "precheck", label: "預檢準時率", description: "24-36 天間隔與排程複核" },
  { key: "repeat-faults", label: "重複故障", description: "同車同組件重複故障" },
  { key: "materials", label: "工單用料", description: "領用與工單耗用趨勢" },
  { key: "turnaround", label: "周轉件效率", description: "送修天數、位置與回庫狀態" },
  { key: "inventory", label: "庫存水位", description: "安全庫存與補料建議" },
];

const pageSize = 50;

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const selected = reports.some((item) => item.key === params.get("report")) ? params.get("report") as ReportKey : "maintenance";
  const dateFrom = params.get("dateFrom") || format(startOfYear(new Date()), "yyyy-MM-dd");
  const dateTo = params.get("dateTo") || format(new Date(), "yyyy-MM-dd");
  const offset = Math.max(Number(params.get("offset")) || 0, 0);
  const active = reports.find((item) => item.key === selected)!;
  const query = useQuery({
    queryKey: ["reports", selected, dateFrom, dateTo, offset],
    queryFn: ({ signal }) => getReport(selected, { dateFrom, dateTo, limit: pageSize, offset }, signal),
  });

  function update(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setParams(next);
  }

  const total = query.data?.page.total || 0;
  const summary = Object.entries(query.data?.summary || {}).map(([key, value]) => ({ label: summaryLabel(key), value: String(value), hint: active.label }));

  return <div className="page-stack">
    <PageHeader title="管理報表" description="報表條件可回查工單、物料與周轉件來源清冊。" actions={<Link className="secondary-button" to="/"><BarChart3 size={16}/>返回主儀表板</Link>} />
    <div className="segmented-nav report-tabs" role="tablist" aria-label="報表類型">{reports.map((item)=><button key={item.key} type="button" role="tab" aria-selected={selected===item.key} onClick={()=>update({report:item.key,offset:undefined})}>{item.label}</button>)}</div>
    <Panel title={active.label} description={active.description}>
      <div className="toolbar report-toolbar"><label><span>起日</span><input type="date" value={dateFrom} onChange={(event)=>update({dateFrom:event.target.value,offset:undefined})}/></label><label><span>迄日</span><input type="date" value={dateTo} onChange={(event)=>update({dateTo:event.target.value,offset:undefined})}/></label><StatusBadge tone="info">{total} 筆</StatusBadge></div>
      {summary.length ? <MetricStrip items={summary}/> : null}
      {query.isPending ? <LoadingState label="讀取報表"/> : null}
      {query.isError ? <ErrorState error={query.error} onRetry={()=>void query.refetch()}/> : null}
      {query.data?.items.length ? <ReportTable report={selected} rows={query.data.items}/> : query.data ? <EmptyState title="查無報表資料" description="請調整日期範圍。"/> : null}
      {total > pageSize ? <div className="pagination"><button className="secondary-button" type="button" disabled={offset===0} onClick={()=>update({offset:String(Math.max(0,offset-pageSize))})}><ChevronLeft size={16}/>上一頁</button><span>{offset+1}-{Math.min(offset+pageSize,total)} / {total}</span><button className="secondary-button" type="button" disabled={offset+pageSize>=total} onClick={()=>update({offset:String(offset+pageSize)})}>下一頁<ChevronRight size={16}/></button></div> : null}
    </Panel>
  </div>;
}

function ReportTable({ report, rows }: { report: ReportKey; rows: Array<Record<string, unknown>> }) {
  const columns = columnConfig(report);
  return <div className="table-frame"><table><thead><tr>{columns.map((column)=><th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={String(row.work_order_no||row.part_no||`${row.train_no}-${row.component}`||index)}>{columns.map((column)=><td key={column.key}>{column.render ? column.render(row) : display(row[column.key])}</td>)}</tr>)}</tbody></table></div>;
}

type Column = { key: string; label: string; render?: (row: Record<string, unknown>) => React.ReactNode };

function columnConfig(report: ReportKey): Column[] {
  if (report === "maintenance") return [sourceWorkOrder(),{key:"work_order_type",label:"類型"},{key:"train_no",label:"車號"},{key:"status",label:"狀態"},{key:"work_order_date",label:"工單日",render:(r)=>formatDate(String(r.work_order_date))},{key:"is_overdue",label:"逾期",render:(r)=><StatusBadge tone={r.is_overdue?"danger":"success"}>{r.is_overdue?"逾期":"正常"}</StatusBadge>}];
  if (report === "precheck") return [sourceWorkOrder(),{key:"train_no",label:"車號/設備",render:(r)=>display(r.train_no||r.target_name)},{key:"pm_level",label:"級別"},{key:"planned_start_date",label:"預排日",render:(r)=>formatDate(String(r.planned_start_date))},{key:"actual_finish_date",label:"完工日",render:(r)=>formatDate(r.actual_finish_date?String(r.actual_finish_date):undefined)},{key:"interval_days",label:"間隔"},{key:"on_time",label:"判定",render:(r)=><StatusBadge tone={r.on_time===false||r.needs_review?"danger":r.on_time===true?"success":"neutral"}>{r.needs_review?"複核":r.on_time===true?"符合":"待完工"}</StatusBadge>}];
  if (report === "repeat-faults") return [{key:"train_no",label:"車號",render:(r)=><Link to={`/work-orders?type=C&search=${encodeURIComponent(String(r.train_no))}`}>{display(r.train_no)}</Link>},{key:"main_system",label:"系統"},{key:"component",label:"組件"},{key:"fault_count",label:"故障次數"},{key:"open_count",label:"未結"},{key:"latest_date",label:"最近發生",render:(r)=>formatDate(String(r.latest_date))}];
  if (report === "materials") return [sourceMaterial(),{key:"material_name",label:"物料"},{key:"used_qty",label:"用量"},{key:"unit",label:"單位"},{key:"work_order_count",label:"工單數"},{key:"latest_transaction_at",label:"最近異動",render:(r)=>formatDate(String(r.latest_transaction_at),"yyyy/MM/dd HH:mm")}];
  if (report === "turnaround") return [{key:"work_order_no",label:"R 工單",render:(r)=><Link to={`/turnaround?view=orders&selected=${encodeURIComponent(String(r.work_order_no))}`}>{display(r.work_order_no)}</Link>},{key:"source_c_work_order_no",label:"來源 C 單"},{key:"serial_no",label:"設備序號"},{key:"status",label:"狀態"},{key:"current_place",label:"位置"},{key:"elapsed_days",label:"處理天數"}];
  return [sourceMaterial(),{key:"material_name",label:"物料"},{key:"available_qty",label:"可用"},{key:"issued_qty",label:"已領"},{key:"reorder_point",label:"安全水位"},{key:"stock_advice",label:"建議",render:(r)=><StatusBadge tone={String(r.stock_advice).includes("請購")?"danger":"success"}>{display(r.stock_advice)}</StatusBadge>}];
}

function sourceWorkOrder(): Column { return { key:"work_order_no",label:"工單號",render:(row)=><Link to={`/work-orders?selected=${encodeURIComponent(String(row.work_order_no))}`}>{display(row.work_order_no)}</Link>}; }
function sourceMaterial(): Column { return { key:"part_no",label:"料號",render:(row)=><Link to={`/inventory?selected=${encodeURIComponent(String(row.part_no))}`}>{display(row.part_no)}</Link>}; }
function display(value: unknown) { if(value===null||value===undefined||value==="") return "—"; if(Array.isArray(value)) return value.join("、"); return String(value); }
function summaryLabel(key: string) { return ({total:"總筆數",completed:"已完成",open:"未結",review_count:"需複核",interval_violations:"間隔違規",replenish_count:"需補料",material_count:"物料總數"} as Record<string,string>)[key]||key; }
