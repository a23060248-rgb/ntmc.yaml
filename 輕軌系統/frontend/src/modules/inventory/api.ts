import { api } from "../../shared/api/client";
import type { PagedResult } from "../../shared/types/api";

export interface MaterialStock {
  availableQty: string;
  issuedQty: string;
  inUseQty: string;
  unavailableQty: string;
  totalTrackedQty: string;
  stockAdvice?: string | null;
}

export interface MaterialItem {
  id: string;
  partNo: string;
  materialName: string;
  spec?: string;
  unit?: string;
  systemName?: string;
  materialType?: string;
  materialProperty?: string;
  repairable: boolean;
  isSerialized: boolean;
  safetyLevel?: string;
  reorderPoint: string | number;
  leadTimeDays?: number;
  stock: MaterialStock;
}

export interface MaterialLocation {
  warehouse_code: string;
  warehouse_name: string;
  location_type: string;
  bin_code?: string;
  stock_status: string;
  qty: string;
}

export interface MaterialTransaction {
  transaction_at: string;
  transaction_type: string;
  warehouse_code?: string;
  stock_status: string;
  qty_change: string;
  work_order_no?: string;
  custodian_name?: string;
}

export interface MaterialUsage {
  partNo: string;
  byYear: Record<string, Record<string, number>>;
  monthly: Array<Record<string, string | number>>;
  fault1y?: number;
  hasData: boolean;
}

export interface Warehouse {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
  location_type: string;
  default_stock_status: string;
  is_issue_destination: boolean;
}

export interface InventoryMovementInput {
  movementType: "ISSUE" | "RETURN" | "TRANSFER" | "CONSUME";
  partNo: string;
  qty: number;
  idempotencyKey?: string;
  sourceWarehouseCode?: string;
  destinationWarehouseCode?: string;
  warehouseCode?: string;
  sourceStockStatus?: string;
  destinationStockStatus?: string;
  workOrderNo?: string;
  custodianName?: string;
  note?: string;
  siteCode?: string;
}

export function listMaterials(input: { search?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return api.get<PagedResult<MaterialItem>>("materials", input, signal);
}

export function getMaterial(partNo: string, signal?: AbortSignal) {
  return api.get<{ item: MaterialItem; locations: MaterialLocation[] }>(`materials/${encodeURIComponent(partNo)}`, undefined, signal);
}

export function getMaterialTransactions(partNo: string, signal?: AbortSignal) {
  return api.get<{ items: MaterialTransaction[] }>(`materials/${encodeURIComponent(partNo)}/transactions`, undefined, signal);
}

export function getMaterialUsage(partNo: string, signal?: AbortSignal) {
  return api.get<MaterialUsage>(`materials/${encodeURIComponent(partNo)}/usage`, undefined, signal);
}

export function listWarehouses(signal?: AbortSignal) {
  return api.get<{ items: Warehouse[] }>("warehouses", undefined, signal);
}

export function postInventoryMovement(input: InventoryMovementInput) {
  const path = input.movementType === "CONSUME" ? "inventory/consume" : `inventory/${input.movementType.toLowerCase()}`;
  return api.post<{ movement?: unknown; consumption?: unknown }>(path, input, {
    headers: { "Idempotency-Key": input.idempotencyKey || "" },
  });
}
