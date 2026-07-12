import { api } from "../../shared/api/client";

export interface UnifiedWorkOrder {
  id: string;
  workOrderNo: string;
  type: "P" | "C" | "R" | "J";
  workOrderDate: string;
  title: string;
  status: string;
  siteCode: string;
  targetCode: string;
  trainNo?: string;
  assignedTo?: string;
  plannedStartAt?: string;
  actualStartAt?: string;
  actualFinishAt?: string;
  closedAt?: string;
  remark?: string;
  createdAt: string;
  detail?: Record<string, unknown>;
}

export interface WorkOrderListResponse {
  items: UnifiedWorkOrder[];
  total: number;
  limit: number;
  offset: number;
}

export interface WorkOrderEvent {
  date: string;
  actor: string;
  act: string;
  note: string;
}

export interface CreateFaultInput {
  tsname: string;
  subsystem: string;
  category: string;
  phenomenon: string;
  fdesc: string;
  reporter: string;
}

export function listWorkOrders(
  input: { type?: string; status?: string; search?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
) {
  return api.get<WorkOrderListResponse>("work-orders/all", input, signal);
}

export function getWorkOrder(no: string, signal?: AbortSignal) {
  return api.get<UnifiedWorkOrder>(`work-orders/unified/${encodeURIComponent(no)}`, undefined, signal);
}

export function getWorkOrderEvents(no: string, signal?: AbortSignal) {
  return api.get<{ items: WorkOrderEvent[] }>(`work-orders/${encodeURIComponent(no)}/events`, undefined, signal);
}

export function createFaultWorkOrder(input: CreateFaultInput) {
  return api.post<{ ok: boolean; orderno: string }>("work-orders", input);
}

export function updateFaultWorkOrder(no: string, input: Record<string, unknown>) {
  return api.patch<{ ok: boolean }>(`work-orders/${encodeURIComponent(no)}`, input);
}

export function finishFaultWorkOrder(no: string, input: { report: string; removed_serial?: string; installed_serial?: string; actor?: string }) {
  return api.post<{ ok: boolean; repairWorkOrder?: { workOrderNo: string; existing: boolean } }>(`work-orders/${encodeURIComponent(no)}/finish`, input);
}
