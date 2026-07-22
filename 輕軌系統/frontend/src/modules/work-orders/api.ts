import { api } from "../../shared/api/client";

export interface UnifiedWorkOrder {
  id: string;
  workOrderNo: string;
  type: "P" | "C" | "R" | "J";
  workOrderDate: string;
  title: string;
  status: string;
  statusLabel?: string;
  version: number;
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
  availableActions?: WorkOrderAction[];
  workflow?: CWorkOrderWorkflow;
}

export interface WorkOrderAction {
  code: string;
  label: string;
}

export interface AssignmentHistory {
  id: string;
  assignment_type: "DISPATCH" | "TRANSFER";
  from_system?: string;
  to_system?: string;
  from_unit?: string;
  to_unit?: string;
  from_user_name?: string;
  to_user_name?: string;
  from_shift?: string;
  to_shift?: string;
  reason: string;
  assigned_by_name?: string;
  created_at: string;
}

export interface ActiveShortage {
  id: string;
  item_code?: string;
  item_name: string;
  required_qty: string | number;
  unit?: string;
  expected_arrival_date?: string;
  supply_status: string;
  responsible_name?: string;
  is_blocking: boolean;
  reason: string;
  started_at: string;
}

export interface ActiveObservation {
  id: string;
  reason: string;
  observation_condition: string;
  responsible_name?: string;
  started_at: string;
  due_at: string;
}

export interface RelatedRepairOrder {
  work_order_no: string;
  status: string;
  removed_serial_no?: string;
  disassembled_at?: string;
}

export interface CWorkOrderWorkflow {
  assignments: AssignmentHistory[];
  activeShortage: ActiveShortage | null;
  activeObservation: ActiveObservation | null;
  repairOrders: RelatedRepairOrder[];
}

export interface WorkOrderActionOptions {
  users: Array<{ id: string; employeeNo?: string; displayName: string; department?: string; role: string }>;
  systems: string[];
  mergeCandidates: Array<{ workOrderNo: string; status: string; statusLabel: string; trainNo?: string; title: string }>;
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

export function listWorkOrderActionOptions(signal?: AbortSignal) {
  return api.get<WorkOrderActionOptions>("work-orders/action-options", undefined, signal);
}

export function performFaultWorkOrderAction(no: string, action: string, input: Record<string, unknown>) {
  return api.post<{
    ok: boolean;
    status: string;
    version: number;
    repairOrders: Array<{ workOrderNo: string; existing: boolean }>;
  }>(`work-orders/${encodeURIComponent(no)}/actions/${encodeURIComponent(action)}`, input);
}
