import { format, isValid, parseISO } from "date-fns";

export function formatDate(value?: string | Date | null, pattern = "yyyy/MM/dd") {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? format(date, pattern) : "—";
}

export function toRocYear(year: number) {
  return year - 1911;
}

export function formatRocDate(value?: string | Date | null) {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (!isValid(date)) return "—";
  return `${toRocYear(date.getFullYear())}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function differenceInCalendarDaysSafe(later?: string, earlier?: string) {
  if (!later || !earlier) return null;
  const end = parseISO(later);
  const start = parseISO(earlier);
  if (!isValid(end) || !isValid(start)) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
