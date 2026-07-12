import { api } from "../../shared/api/client";
import type { PageMeta } from "../../shared/types/api";

export type ReportKey = "maintenance" | "precheck" | "repeat-faults" | "materials" | "turnaround" | "inventory";

export interface ReportResponse {
  items: Array<Record<string, unknown>>;
  page: PageMeta;
  summary?: Record<string, string | number>;
}

export function getReport(
  key: ReportKey,
  input: { dateFrom?: string; dateTo?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
) {
  return api.get<ReportResponse>(`reports/${key}`, input, signal);
}
