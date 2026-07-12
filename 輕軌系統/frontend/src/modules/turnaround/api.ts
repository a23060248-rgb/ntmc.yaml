import { api } from "../../shared/api/client";
import type { PagedResult } from "../../shared/types/api";

export interface RepairOrder {
  id: string;
  workOrderNo: string;
  sourceFaultWorkOrderNo?: string;
  title: string;
  status: string;
  repairMethod: string;
  currentPlace: string;
  outsourcingStatus: string;
  acceptanceResult: string;
  nextAction?: string;
  riskTags: string[];
  removedAssetId?: string;
  removedSerialNo?: string;
  installedSerialNo?: string;
  partNo?: string;
  materialName?: string;
  groupName?: string;
  originalPositionCode?: string;
  originalLocationText?: string;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string;
}

export interface RepairEvent {
  action_code: string;
  actor_text?: string;
  actor_name?: string;
  note?: string;
  created_at: string;
}

export interface MatrixCell {
  position_id: string;
  position_code: string;
  position_name: string;
  module_no?: string;
  position_status: string;
  last_replace_at?: string;
  train_no?: string;
  group_code?: string;
  group_name?: string;
  system_name?: string;
  asset_id?: string;
  serial_no?: string;
  current_status?: string;
  part_no?: string;
  material_name?: string;
  warehouse_name?: string;
  vendor_name?: string;
  source_work_order_no?: string;
  open_r_work_order_no?: string;
  open_c_work_order_no?: string;
}

export interface AssetListItem {
  asset_id: string;
  serial_no: string;
  current_status: string;
  updated_at: string;
  part_no: string;
  material_name: string;
  group_code?: string;
  group_name?: string;
  system_name?: string;
  train_no?: string;
  position_code?: string;
  warehouse_name?: string;
  vendor_name?: string;
}

export interface AssetEvent {
  id: string;
  event_type: string;
  from_status?: string;
  to_status?: string;
  work_order_no?: string;
  event_at: string;
  handled_by_name?: string;
  note?: string;
  serial_no?: string;
  part_no?: string;
}

export interface AssetDetailResponse {
  item: Record<string, unknown> & { id: string; serial_no: string; current_status: string; part_no: string; material_name: string };
  sameGroupSpares: Array<{ asset_id: string; serial_no: string; current_status: string; warehouse_name?: string }>;
  openOrders: Array<{ work_order_no: string; work_order_type: string; status: string; title: string; created_at: string }>;
}

export function listRepairOrders(input: { search?: string; status?: string; openOnly?: boolean; limit?: number; offset?: number }, signal?: AbortSignal) {
  return api.get<PagedResult<RepairOrder>>("turnaround/r-orders", input, signal);
}

export function getRepairOrder(no: string, signal?: AbortSignal) {
  return api.get<{ item: RepairOrder; events: RepairEvent[] }>(`turnaround/r-orders/${encodeURIComponent(no)}`, undefined, signal);
}

export function updateRepairOrder(no: string, input: Record<string, unknown>) {
  return api.patch<{ item: RepairOrder }>(`turnaround/r-orders/${encodeURIComponent(no)}`, input);
}

export function runRepairAction(no: string, input: Record<string, unknown>) {
  return api.post<{ item: RepairOrder }>(`turnaround/r-orders/${encodeURIComponent(no)}/actions`, input);
}

export function listMatrix(input: { trainNo?: string; moduleNo?: string; groupCode?: string }, signal?: AbortSignal) {
  return api.get<{ items: MatrixCell[] }>("turnaround/matrix", input, signal);
}

export function listAssets(input: { search?: string; status?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return api.get<PagedResult<AssetListItem>>("turnaround/assets", input, signal);
}

export function getAsset(id: string, signal?: AbortSignal) {
  return api.get<AssetDetailResponse>(`turnaround/assets/${encodeURIComponent(id)}`, undefined, signal);
}

export function getAssetEvents(id: string, signal?: AbortSignal) {
  return api.get<{ items: AssetEvent[] }>(`assets/${encodeURIComponent(id)}/events`, undefined, signal);
}

export function getPositionHistory(id: string, signal?: AbortSignal) {
  return api.get<{ items: AssetEvent[] }>(`turnaround/positions/${encodeURIComponent(id)}/history`, undefined, signal);
}
