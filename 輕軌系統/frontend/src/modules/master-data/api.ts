import { api } from "../../shared/api/client";

export type MasterDataRecord = Record<string, unknown> & { id: string };

export interface MasterDataListResponse {
  items: MasterDataRecord[];
  total: number;
  limit: number;
  offset: number;
}

export function listMasterData(
  resource: string,
  input: { search?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
) {
  return api.get<MasterDataListResponse>(`master-data/${resource}`, input, signal);
}

export function createMasterData(resource: string, values: Record<string, unknown>) {
  return api.post<MasterDataRecord>(`master-data/${resource}`, values);
}

export function updateMasterData(
  resource: string,
  id: string,
  values: Record<string, unknown>,
) {
  return api.patch<MasterDataRecord>(`master-data/${resource}/${id}`, values);
}

export interface WorkflowOption {
  group: string;
  code: string;
  label: string;
  sortOrder: number;
  isTerminal: boolean;
  isActive: boolean;
  description: string;
  uiTone: "neutral" | "info" | "success" | "warning" | "danger";
  backgroundColor?: string;
  textColor?: string;
}

export function listWorkflowOptions(signal?: AbortSignal) {
  return api.get<{ groups: Record<string, WorkflowOption[]> }>("reference-options", undefined, signal);
}

export function createWorkflowOption(input: WorkflowOption) {
  return api.post<{ item: WorkflowOption }>("reference-options", input);
}

export function updateWorkflowOption(group: string, code: string, input: Partial<WorkflowOption>) {
  return api.patch<{ item: WorkflowOption }>(`reference-options/${encodeURIComponent(group)}/${encodeURIComponent(code)}`, input);
}

export interface EquipmentAlias {
  id: string;
  sourceSystem: string;
  aliasName: string;
  targetKind: "GROUP" | "MATERIAL";
  targetCode: string;
  canonicalName: string;
  isActive: boolean;
}

export function listEquipmentAliases(input: { search?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return api.get<{ items: EquipmentAlias[]; total: number; limit: number; offset: number }>("equipment-aliases", input, signal);
}

export function saveEquipmentAlias(input: Omit<EquipmentAlias, "id" | "canonicalName" | "isActive">) {
  return api.post<{ ok: boolean }>("equipment-aliases", input);
}

export function setEquipmentAliasActive(id: string, isActive: boolean) {
  return api.patch<{ item: { id: string; isActive: boolean } }>(`equipment-aliases/${encodeURIComponent(id)}`, { isActive });
}
