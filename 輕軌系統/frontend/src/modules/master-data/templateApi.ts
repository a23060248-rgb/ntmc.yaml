import { api } from "../../shared/api/client";

export type TemplateLifecycle = "DRAFT" | "PUBLISHED" | "RETIRED";

export interface PmTemplateVersion {
  id: string;
  pm_code: string;
  pm_label: string;
  version_no: string;
  revision_no: number;
  lifecycle_status: TemplateLifecycle;
  maintenance_period?: string;
  latest_offset_days: number;
  job_description?: string;
  default_corrective_action?: string;
  effective_from?: string;
  effective_to?: string;
  published_at?: string;
  published_by_name?: string;
  is_active: boolean;
  check_count?: number;
  material_count?: number;
  instrument_count?: number;
  wi_count?: number;
}

export interface TemplateCheckItem {
  id?: string;
  section: string;
  item_no: string;
  item_description: string;
  check_type: "checkbox" | "value" | "text";
  standard_value?: string;
  unit?: string;
  default_status: "正常" | "異常" | "N/A" | "未填";
  requires_value: boolean;
  is_required: boolean;
  min_value?: string | number;
  max_value?: string | number;
  validation_rule?: string;
  section_sort_order: number;
  sort_order: number;
  is_active: boolean;
}

export interface TemplateMaterial {
  material_id: string;
  part_no: string;
  material_name: string;
  spec?: string;
  base_unit?: string;
  default_qty?: string | number;
  default_unit?: string;
  display_note?: string;
  sort_order: number;
  condition_code: string;
  condition_options: Array<Record<string, unknown>>;
  is_required: boolean;
  is_active: boolean;
}

export interface TemplateInstrument {
  instrument_id: string;
  instrument_no: string;
  instrument_name: string;
  instrument_type?: string;
  calibration_due_date?: string;
  status?: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
}

export interface TemplateWi {
  wi_document_id: string;
  wi_no: string;
  wi_name: string;
  version_no?: string;
  status?: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
}

export interface WordTemplateVersion {
  id: string;
  template_code: string;
  template_name: string;
  version_no: string;
  source_file_name: string;
  storage_path: string;
  file_hash?: string;
  file_format: "DOC" | "DOCX";
  effective_from?: string;
  effective_to?: string;
  is_active: boolean;
  lifecycle_status: TemplateLifecycle;
  mapping_count: number;
}

export interface WordFieldMapping {
  id?: string;
  field_key: string;
  source_path: string;
  word_target_type: "PLACEHOLDER" | "BOOKMARK";
  word_target: string;
  transform_code?: string;
  default_value?: string;
  is_required: boolean;
  sort_order: number;
}

export interface TemplateDetail {
  item: PmTemplateVersion;
  checks: TemplateCheckItem[];
  materials: TemplateMaterial[];
  instruments: TemplateInstrument[];
  wiDocuments: TemplateWi[];
  attachments: Array<Record<string, unknown>>;
  formTemplates: WordTemplateVersion[];
}

export function listTemplateVersions(input: { search?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return api.get<{ items: PmTemplateVersion[]; total: number; limit: number; offset: number }>("master-data/pm-template-studio", input, signal);
}

export function getTemplateVersion(id: string, signal?: AbortSignal) {
  return api.get<TemplateDetail>(`master-data/pm-template-studio/${encodeURIComponent(id)}`, undefined, signal);
}

export function createTemplateVersion(input: Record<string, unknown>) {
  return api.post<{ item: PmTemplateVersion }>("master-data/pm-template-studio", input);
}

export function createTemplateRevision(id: string, versionNo: string) {
  return api.post<{ item: PmTemplateVersion }>(`master-data/pm-template-studio/${encodeURIComponent(id)}/revisions`, { versionNo });
}

export function updateTemplateVersion(id: string, input: Record<string, unknown>) {
  return api.patch<{ item: PmTemplateVersion }>(`master-data/pm-template-studio/${encodeURIComponent(id)}`, input);
}

export function saveTemplateChecks(id: string, items: Array<Record<string, unknown>>) {
  return api.put<TemplateDetail>(`master-data/pm-template-studio/${encodeURIComponent(id)}/check-items`, { items });
}

export function saveTemplateMaterials(id: string, items: Array<Record<string, unknown>>) {
  return api.put<TemplateDetail>(`master-data/pm-template-studio/${encodeURIComponent(id)}/materials`, { items });
}

export function saveTemplateInstruments(id: string, items: Array<Record<string, unknown>>) {
  return api.put<TemplateDetail>(`master-data/pm-template-studio/${encodeURIComponent(id)}/instruments`, { items });
}

export function saveTemplateWis(id: string, items: Array<Record<string, unknown>>) {
  return api.put<TemplateDetail>(`master-data/pm-template-studio/${encodeURIComponent(id)}/wi-documents`, { items });
}

export function publishTemplateVersion(id: string, effectiveFrom?: string) {
  return api.post<{ item: PmTemplateVersion }>(`master-data/pm-template-studio/${encodeURIComponent(id)}/publish`, { effectiveFrom });
}

export function createWordTemplate(input: Record<string, unknown>) {
  return api.post<{ item: WordTemplateVersion }>("precheck/form-templates", input);
}

export function getWordMappings(id: string, signal?: AbortSignal) {
  return api.get<{ items: WordFieldMapping[] }>(`precheck/form-templates/${encodeURIComponent(id)}/mappings`, undefined, signal);
}

export function saveWordMappings(id: string, mappings: WordFieldMapping[]) {
  return api.put<{ items: WordFieldMapping[] }>(`precheck/form-templates/${encodeURIComponent(id)}/mappings`, { mappings });
}

export function publishWordTemplate(id: string, effectiveFrom?: string) {
  return api.post<{ item: WordTemplateVersion }>(`precheck/form-templates/${encodeURIComponent(id)}/publish`, { effectiveFrom });
}
