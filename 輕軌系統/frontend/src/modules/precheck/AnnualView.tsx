import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { Panel, StatusBadge } from "../../shared/ui";
import { listSchedules, type ScheduleItem, type ScheduleTargetType } from "./api";

const monthLabels = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

function compactDate(value?: string) {
  return value ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : "未排";
}

function interval(item: ScheduleItem) {
  return item.latestActualFinishDate && item.plannedStartDate ? differenceInCalendarDays(parseISO(item.plannedStartDate), parseISO(item.latestActualFinishDate)) : null;
}

export function AnnualView() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [type, setType] = useState<ScheduleTargetType>("VEHICLE");
  const query = useQuery({ queryKey: ["precheck-annual", year, type], queryFn: ({ signal }) => listSchedules({ year, targetType: type, limit: 500 }, signal) });
  const targets = new Map<string, ScheduleItem[]>();
  query.data?.items.forEach((item) => targets.set(item.targetKey, [...(targets.get(item.targetKey) || []), item]));

  return <Panel title="簡易排程驗證" description="車輛與機廠設備分開；每格顯示日期、與前次間隔及鏇削。">
    <div className="annual-toolbar"><div className="segmented-nav">{[currentYear, currentYear + 1].map((value) => <button key={value} type="button" aria-pressed={year === value} onClick={() => setYear(value)}>{value}</button>)}</div><div className="segmented-nav"><button type="button" aria-pressed={type === "VEHICLE"} onClick={() => setType("VEHICLE")}>車輛</button><button type="button" aria-pressed={type === "DEPOT_EQUIPMENT"} onClick={() => setType("DEPOT_EQUIPMENT")}>機廠設備</button></div><StatusBadge tone="info">{targets.size} 筆</StatusBadge></div>
    {query.isPending ? <LoadingState /> : null}{query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
    {targets.size ? <div className="annual-table-frame"><table className="annual-validation-table"><thead><tr><th>{type === "VEHICLE" ? "車號" : "設備名稱"}</th>{monthLabels.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{[...targets.entries()].map(([targetKey, items]) => <tr key={targetKey}><th>{items[0]?.targetName || targetKey}</th>{Array.from({ length: 12 }, (_, monthIndex) => { const item = items.find((row) => row.scheduleMonth === monthIndex + 1); if (!item) return <td key={monthIndex} className="is-empty">—</td>; const gap = interval(item); const legacy = item.plannedStartDate && item.plannedStartDate < "2026-05-01"; const review = !legacy && item.needsReview; const title = review ? item.reviewReasons.join("、") : legacy ? "2026/5 以前既有資料不驗證" : "排程驗證正常"; return <td key={monthIndex} className={legacy ? "is-legacy" : review ? "is-review" : ""} title={title}><strong>{item.pmLevel}</strong><span>{compactDate(item.plannedStartDate)}{item.plannedEndDate !== item.plannedStartDate ? `-${compactDate(item.plannedEndDate)}` : ""}</span><span>{gap === null ? "差 —" : `差 ${gap} 天`}</span>{item.latheStartDate ? <small>鏇 {compactDate(item.latheStartDate)}-{compactDate(item.latheEndDate)}</small> : null}{legacy ? <em>既有</em> : review ? <em>複核</em> : null}</td>; })}</tr>)}</tbody></table></div> : query.data ? <EmptyState title="本年度沒有資料" description="請先匯入年度預排。" /> : null}
  </Panel>;
}
