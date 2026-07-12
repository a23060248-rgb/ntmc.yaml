import { useQuery } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, endOfMonth, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { Panel, StatusBadge } from "../../shared/ui";
import { listSchedules, type ScheduleItem } from "./api";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function calendarTone(item: ScheduleItem) {
  if (item.plannedStartDate && item.plannedStartDate < "2026-05-01") return "legacy";
  if (item.scheduleStatus === "COMPLETED") return "complete";
  if (item.needsReview) return "review";
  if (!item.plannedStartDate) return "review";
  const delay = differenceInCalendarDays(new Date(), parseISO(item.plannedStartDate));
  if (delay >= 2) return "review";
  if (delay >= 0) return "pending";
  return "planned";
}

export function CalendarView() {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const query = useQuery({
    queryKey: ["precheck-calendar", year, month],
    queryFn: ({ signal }) => listSchedules({ year, month, limit: 500 }, signal),
  });
  const first = startOfMonth(new Date(year, month - 1, 1));
  const last = endOfMonth(first);
  const gridStart = startOfWeek(first, { weekStartsOn: 0 });
  const dates = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const byDate = new Map<string, ScheduleItem[]>();
  query.data?.items.forEach((item) => {
    if (!item.plannedStartDate) return;
    const datesForItem = [item.plannedStartDate];
    if (item.plannedEndDate && item.plannedEndDate !== item.plannedStartDate) datesForItem.push(item.plannedEndDate);
    datesForItem.forEach((date) => byDate.set(date, [...(byDate.get(date) || []), item]));
  });

  return <Panel title={`${year} 年 ${month} 月預檢月曆`} description="點工項可進入排班規劃；待回填 D/D+1 橘色、D+2 起紅色。">
    <div className="calendar-toolbar precheck-calendar-controls">
      <span>西元年</span><input type="number" min="2020" max="2200" value={year} onChange={(event) => setYear(Number(event.target.value))} />
      <span>月份</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} 月</option>)}</select>
      <StatusBadge tone={query.data?.items.some((item) => item.needsReview) ? "danger" : "info"}>{query.data ? `${query.data.page.total} 項` : "讀取中"}</StatusBadge>
    </div>
    {query.isPending ? <LoadingState /> : null}
    {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
    {query.data ? <div className="precheck-calendar-scroll">
      <div className="precheck-calendar-grid">
        {weekdayLabels.map((label) => <b key={label}>{label}</b>)}
        {dates.map((date) => {
          const key = format(date, "yyyy-MM-dd");
          const items = byDate.get(key) || [];
          return <div key={key} className={!isSameMonth(date, first) || date > last ? "is-outside" : ""}><header><strong>{format(date, "d")}</strong>{items.length ? <span>{items.length} 項</span> : null}</header><div className="calendar-day-items">{items.map((item) => <button key={`${item.id}-${key}`} type="button" className={`calendar-work is-${calendarTone(item)}`} title={item.reviewReasons.join("、") || `${item.pmLevel} ${item.scheduleStatus}`} onClick={() => navigate(`/precheck/planning?year=${year}&month=${month}&selected=${item.id}`)}><strong>{item.targetName}</strong><span>{item.pmLevel}{item.targetType === "DEPOT_EQUIPMENT" ? " · 機廠" : ""}</span>{item.plannedStartDate && item.plannedStartDate < "2026-05-01" ? <small>既有 / 不驗證</small> : item.needsReview ? <small>複核</small> : null}</button>)}</div></div>;
        })}
      </div>
    </div> : null}
    {query.data && !query.data.items.length ? <EmptyState title="本月尚無排程" description="先匯入年度預排，再到排班規劃產生日程。" /> : null}
  </Panel>;
}
