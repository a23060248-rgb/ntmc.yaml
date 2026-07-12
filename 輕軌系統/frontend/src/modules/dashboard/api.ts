import { api } from "../../shared/api/client";

export interface DashboardSummary {
  workOrders: { P: number; C: number; R: number; J: number; overdue: number };
  repair: { pending: number; repairing: number; total: number };
  assets: { attention: number; online: number };
  materials: { low_stock: number; total: number };
  today: Array<{
    workOrderNo: string;
    type: string;
    title: string;
    status: string;
    trainNo?: string;
    plannedStartAt?: string;
    workOrderDate: string;
  }>;
}

export function getDashboardSummary(signal?: AbortSignal) {
  return api.get<DashboardSummary>("dashboard/summary", undefined, signal);
}
