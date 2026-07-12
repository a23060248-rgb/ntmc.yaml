import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { CalendarOff, Check, Play, Save, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/auth/AuthContext";
import { rolePolicies } from "../../shared/auth/rolePolicy";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { Panel, StatusBadge } from "../../shared/ui";
import {
  generateSchedules,
  createWorkOrderFromSchedule,
  listCalendarExceptions,
  listSchedules,
  publishSchedules,
  replanSchedules,
  saveCalendarException,
  updateSchedule,
  type ScheduleItem,
  type ScheduleTargetType,
} from "./api";

const reviewLabels: Record<string, string> = {
  INTERVAL_OUT_OF_RANGE: "間隔超出 24-36 天",
  CAPACITY_FORCED: "每日容量已滿，強制排入",
  LATHE_NOT_SCHEDULED: "鏇削未排",
  LATHE_AFTER_MAINTENANCE: "鏇削排在高階檢修後",
  LATHE_CAPACITY_FORCED: "鏇削容量衝突，強制排入",
  EQUIPMENT_CYCLE_OUT_OF_RANGE: "機廠設備超出固定週期上限",
  MANUAL_NON_WORKDAY: "人工排入假日",
};

function reviewText(item: ScheduleItem) {
  return item.reviewReasons.map((reason) => reviewLabels[reason] || reason).join("、");
}

function dateRange(year: number, month: number) {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const start = addDays(monthStart, -5);
  const end = endOfMonth(monthStart);
  const days = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) days.push(cursor);
  return days;
}

export function PlanningView() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole(rolePolicies.scheduleWrite);
  const [params, setParams] = useSearchParams();
  const now = new Date();
  const year = Number(params.get("year") || now.getFullYear());
  const month = Number(params.get("month") || now.getMonth() + 1);
  const selectedId = canWrite ? (params.get("selected") || "") : "";
  const [type, setType] = useState<ScheduleTargetType>("VEHICLE");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [holiday, setHoliday] = useState({ date: "", name: "", dayType: "HOLIDAY" as "HOLIDAY" | "WORKDAY" });
  const [edit, setEdit] = useState({ plannedStartDate: "", plannedEndDate: "", reason: "" });
  const days = useMemo(() => dateRange(year, month), [year, month]);

  const query = useQuery({
    queryKey: ["precheck-planning", year, month, type],
    queryFn: ({ signal }) => listSchedules({ year, month, targetType: type, limit: 500 }, signal),
  });
  const exceptionsQuery = useQuery({ queryKey: ["precheck-calendar-exceptions", year], queryFn: ({ signal }) => listCalendarExceptions(year, signal) });

  const generateMutation = useMutation({
    mutationFn: () => generateSchedules({ startDate: `${year}-${String(month).padStart(2, "0")}-01`, reason: "排班規劃手動執行 24 個月產生" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["precheck"] }),
  });
  const holidayMutation = useMutation({
    mutationFn: async () => {
      await saveCalendarException({ ...holiday, siteCode: "D" });
      return replanSchedules({ startDate: holiday.date, reason: `${holiday.name}：新增行事曆例外後整段重排` });
    },
    onSuccess: async () => {
      setHoliday({ date: "", name: "", dayType: "HOLIDAY" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["precheck"] }),
        queryClient.invalidateQueries({ queryKey: ["precheck-calendar-exceptions"] }),
      ]);
    },
  });
  const publishMutation = useMutation({
    mutationFn: () => publishSchedules(selectedIds, "排班規劃確認發布"),
    onSuccess: async () => { setSelectedIds([]); await queryClient.invalidateQueries({ queryKey: ["precheck"] }); },
  });
  const editMutation = useMutation({
    mutationFn: () => updateSchedule(selectedId, edit),
    onSuccess: async () => {
      const next = new URLSearchParams(params); next.delete("selected"); setParams(next);
      await queryClient.invalidateQueries({ queryKey: ["precheck"] });
    },
  });
  const workOrderMutation = useMutation({
    mutationFn: () => createWorkOrderFromSchedule(selectedId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["precheck"] }); },
  });

  const selected = query.data?.items.find((item) => item.id === selectedId);
  useEffect(() => {
    if (selected?.plannedStartDate) {
      setEdit({ plannedStartDate: selected.plannedStartDate, plannedEndDate: selected.plannedEndDate || selected.plannedStartDate, reason: "" });
    } else if (!selectedId) {
      setEdit({ plannedStartDate: "", plannedEndDate: "", reason: "" });
    }
  }, [selected, selectedId]);

  function updateMonth(key: "year" | "month", value: number) {
    const next = new URLSearchParams(params); next.set(key, String(value)); next.delete("selected"); setParams(next);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return <div className="page-stack">
    <Panel title="排班規劃" description="先排 3M/6M/1Y，再排 1M 與鏇削；人工假日會觸發後續整段重排。">
      <div className="planning-command-bar">
        <label>年度<input type="number" value={year} onChange={(event) => updateMonth("year", Number(event.target.value))} /></label>
        <label>月份<select value={month} onChange={(event) => updateMonth("month", Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} 月</option>)}</select></label>
        <div className="segmented-nav"><button type="button" aria-pressed={type === "VEHICLE"} onClick={() => setType("VEHICLE")}>車輛</button><button type="button" aria-pressed={type === "DEPOT_EQUIPMENT"} onClick={() => setType("DEPOT_EQUIPMENT")}>機廠設備</button></div>
        {canWrite ? <><button className="secondary-button" type="button" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}><Play size={16} />產生 24 個月</button>
        <button className="primary-button" type="button" onClick={() => publishMutation.mutate()} disabled={!selectedIds.length || publishMutation.isPending}><Send size={16} />發布 {selectedIds.length || ""}</button></> : <small className="muted-text">唯讀檢視</small>}
      </div>
      {(generateMutation.isError || publishMutation.isError) ? <ErrorState title="排程操作失敗" error={generateMutation.error || publishMutation.error} /> : null}
      {generateMutation.data ? <div className="inline-notice">已產生 {generateMutation.data.generated} 筆，{generateMutation.data.reviewCount} 筆需複核；範圍至 {generateMutation.data.endDate}。</div> : null}
    </Panel>

    <Panel title="臨時假日與補班" description="新增後立即從該日開始重排，容量已滿會繼續往後找。">
      {canWrite ? <form className="holiday-form" onSubmit={(event) => { event.preventDefault(); holidayMutation.mutate(); }}>
        <input type="date" required value={holiday.date} onChange={(event) => setHoliday((current) => ({ ...current, date: event.target.value }))} />
        <select value={holiday.dayType} onChange={(event) => setHoliday((current) => ({ ...current, dayType: event.target.value as "HOLIDAY" | "WORKDAY" }))}><option value="HOLIDAY">假日</option><option value="WORKDAY">補班工作日</option></select>
        <input required placeholder="名稱，例如颱風假" value={holiday.name} onChange={(event) => setHoliday((current) => ({ ...current, name: event.target.value }))} />
        <button className="secondary-button" type="submit" disabled={holidayMutation.isPending}><CalendarOff size={16} />儲存並重排</button>
      </form> : <div className="inline-notice">目前角色只能查看行事曆例外，不能新增假日或觸發重排。</div>}
      {holidayMutation.isError ? <ErrorState title="行事曆重排失敗" error={holidayMutation.error} /> : null}
      {exceptionsQuery.data?.items.length ? <div className="chip-row">{exceptionsQuery.data.items.map((item) => <StatusBadge key={item.calendar_date} tone={item.day_type === "HOLIDAY" ? "warning" : "success"}>{item.calendar_date.slice(0, 10)} {item.name}</StatusBadge>)}</div> : null}
    </Panel>

    <Panel title={`${year} 年 ${month} 月日矩陣`} description="前置五天用於顯示跨月鏇削；點格子或日期可人工改期。">
      {query.isPending ? <LoadingState /> : null}{query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.data?.items.length ? <div className="planning-matrix-frame"><table className="planning-matrix"><thead><tr><th className="sticky-col">選</th><th className="sticky-col second">車號 / 設備</th><th>前次完工</th><th>級別</th><th>檢修日</th><th>間隔</th>{days.map((date) => <th key={format(date, "yyyy-MM-dd")} className={date.getMonth() + 1 !== month ? "is-overflow" : ""}>{format(date, "M/d")}<small>{"日一二三四五六"[date.getDay()]}</small></th>)}</tr></thead><tbody>{query.data.items.map((item) => { const interval = item.latestActualFinishDate && item.plannedStartDate ? differenceInCalendarDays(parseISO(item.plannedStartDate), parseISO(item.latestActualFinishDate)) : null; return <tr key={item.id} className={item.needsReview ? "is-review" : ""}><td className="sticky-col"><input aria-label={`選取 ${item.targetName}`} type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} /></td><th className="sticky-col second"><button className="table-action" type="button" onClick={() => { const next = new URLSearchParams(params); next.set("selected", item.id); setParams(next); }}>{item.targetName}</button><small>{item.targetType === "VEHICLE" ? "車輛" : `固定 ${item.fixedCycleMonths || "—"}M`}</small></th><td>{item.latestActualFinishDate || "—"}</td><td><StatusBadge tone={item.pmLevel === "1M" ? "info" : "warning"}>{item.pmLevel}</StatusBadge></td><td>{item.plannedStartDate || "未排"}<small>{item.plannedEndDate !== item.plannedStartDate ? item.plannedEndDate : ""}</small></td><td><span title={reviewText(item)} className={item.needsReview ? "review-text" : ""}>{interval === null ? "—" : `${interval} 天`}{item.needsReview ? " · 複核" : ""}</span></td>{days.map((date) => { const key = format(date, "yyyy-MM-dd"); const isLathe = item.latheStartDate && key >= item.latheStartDate && key <= (item.latheEndDate || item.latheStartDate); const isWork = item.plannedStartDate && key >= item.plannedStartDate && key <= (item.plannedEndDate || item.plannedStartDate); return <td key={key} className={date.getMonth() + 1 !== month ? "is-overflow" : ""}>{isWork ? <button type="button" className={`matrix-job ${item.needsReview ? "is-review" : ""}`} title={reviewText(item) || item.pmLevel} onClick={() => { const next = new URLSearchParams(params); next.set("selected", item.id); setParams(next); }}>{item.pmLevel}<small>{item.scheduleStatus}</small></button> : isLathe ? <span className="matrix-job is-lathe">鏇<small>{item.needsReview ? "複核" : ""}</small></span> : null}</td>; })}</tr>; })}</tbody></table></div> : query.data ? <EmptyState title="本月尚無排程項目" description="先到預排匯入建立年度級別，再產生日期。" /> : null}
    </Panel>

    {selectedId ? <aside className="edit-drawer" aria-label="人工改期"><header><div><small>人工覆寫會保留 change log</small><h2>{selected?.targetName || "排程改期"}</h2></div><button className="icon-button" type="button" aria-label="關閉" onClick={() => { const next = new URLSearchParams(params); next.delete("selected"); setParams(next); }}><X size={18} /></button></header><form onSubmit={(event) => { event.preventDefault(); editMutation.mutate(); }}><label><span>開始日期 *</span><input type="date" required value={edit.plannedStartDate} onChange={(event) => setEdit((current) => ({ ...current, plannedStartDate: event.target.value }))} /></label><label><span>結束日期</span><input type="date" value={edit.plannedEndDate} onChange={(event) => setEdit((current) => ({ ...current, plannedEndDate: event.target.value }))} /></label><label><span>改期原因 *</span><textarea rows={4} required value={edit.reason} onChange={(event) => setEdit((current) => ({ ...current, reason: event.target.value }))} /></label>{(editMutation.isError || workOrderMutation.isError) ? <ErrorState title="排程操作失敗" error={editMutation.error || workOrderMutation.error} /> : null}<button className="secondary-button" type="submit" disabled={editMutation.isPending}><Save size={16} />儲存改期</button><button className="primary-button" type="button" disabled={!selected?.isPublished || Boolean(selected?.generatedWorkOrderId) || workOrderMutation.isPending} onClick={() => workOrderMutation.mutate()}><Check size={16} />{selected?.generatedWorkOrderId ? "已建立 P 工單" : selected?.isPublished ? "建立 P 工單草稿" : "發布後才可產單"}</button></form></aside> : null}
  </div>;
}
