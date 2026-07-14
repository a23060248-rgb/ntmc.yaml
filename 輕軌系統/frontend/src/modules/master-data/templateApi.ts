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
  attachment_count?: number;
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

export interface TemplateSection {
  id: string;
  section_code: string;
  section_name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
}

export type ImportBatchStatus = "DRAFT" | "VALIDATED" | "APPROVED" | "APPLIED" | "REJECTED";
export type ImportRowStatus = "PENDING" | "VALID" | "INVALID" | "APPROVED" | "REJECTED" | "APPLIED";

export interface TemplateImportBatch {
  id: string;
  pm_template_id?: string | null;
  source_file_name: string;
  source_file_hash?: string;
  source_profile_code?: string;
  import_status: ImportBatchStatus;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  notes?: string;
  created_at: string;
  row_count?: number;
  approved_count?: number;
  rejected_count?: number;
  pending_review_count?: number;
  summary?: Partial<Record<ImportRowStatus, number>>;
}

export interface TemplateImportRow {
  id: string;
  source_row_no: number;
  source_page_no?: number;
  section_code?: string;
  section_name: string;
  item_no: string;
  item_description: string;
  check_type: "checkbox" | "value" | "text";
  standard_value?: string;
  unit?: string;
  requires_value: boolean;
  is_required: boolean;
  min_value?: string | number;
  max_value?: string | number;
  sort_order: number;
  validation_status: ImportRowStatus;
  validation_messages: string[];
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
  block_mapping_count?: number;
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

export type TemplateAttachmentType = "SEAT_MAP" | "MEASUREMENT_TABLE" | "OTHER";
export type AttachmentRenderStrategy = "WORD_BLOCK" | "WORD_TABLE" | "WORD_OVERLAY" | "DATA_ONLY";

export interface SeatMapModule {
  code: string;
  rows: Array<Array<"S" | "P" | null>>;
}

export interface MeasurementPoint {
  key: string;
  label: string;
}

export interface AttachmentField {
  key: string;
  label: string;
  type?: string;
  unit?: string;
  min?: number | string;
  max?: number | string;
  required?: boolean;
}

export interface TemplateAttachment {
  id?: string;
  attachment_definition_version_id?: string | null;
  library_version_no?: string;
  library_lifecycle_status?: TemplateLifecycle;
  attachment_code: string;
  attachment_name: string;
  attachment_type: TemplateAttachmentType;
  schema_json: {
    modules?: SeatMapModule[];
    points?: MeasurementPoint[];
    fields?: AttachmentField[];
    legend?: Record<string, string>;
    abnormalMark?: string;
  };
  sort_order: number;
  is_required: boolean;
  condition_code: string;
  schema_version: number;
  render_strategy: AttachmentRenderStrategy;
  is_active: boolean;
}

export interface AttachmentLibraryItem {
  id: string;
  attachment_code: string;
  attachment_name: string;
  attachment_type: TemplateAttachmentType;
  description?: string;
  is_active: boolean;
  version_count?: number;
  published_version_id?: string;
  published_version_no?: string;
  published_schema_version?: number;
  published_render_strategy?: AttachmentRenderStrategy;
}

export interface AttachmentLibraryVersion {
  id: string;
  attachment_definition_id: string;
  version_no: string;
  schema_version: number;
  lifecycle_status: TemplateLifecycle;
  schema_json: TemplateAttachment["schema_json"];
  render_strategy: AttachmentRenderStrategy;
  source_asset_path?: string;
  source_asset_hash?: string;
  effective_from?: string;
  effective_to?: string;
  published_at?: string;
  is_active: boolean;
}

export interface PublishedAttachmentVersion {
  attachment_definition_version_id: string;
  attachment_definition_id: string;
  attachment_code: string;
  attachment_name: string;
  attachment_type: TemplateAttachmentType;
  description?: string;
  version_no: string;
  schema_version: number;
  schema_json: TemplateAttachment["schema_json"];
  render_strategy: AttachmentRenderStrategy;
}

export interface WordBlockMapping {
  id?: string;
  block_code: string;
  source_path: string;
  block_type: "CHECK_TABLE" | "MATERIAL_TABLE" | "SEAT_MAP" | "MEASUREMENT_TABLE" | "OTHER";
  word_target_type: "BOOKMARK_RANGE" | "TABLE" | "SHAPE_COORDINATES" | "IMAGE_OVERLAY";
  word_target: string;
  transform_code?: string;
  config_json?: Record<string, unknown>;
  is_required: boolean;
  is_verified?: boolean;
  verified_run_id?: string | null;
  verified_at?: string | null;
  sort_order: number;
}

export interface WordBlockVerification {
  id: string;
  blockMappingId: string;
  blockCode: string;
  verificationStatus: "PASSED" | "FAILED";
  outputFileHash: string;
  pageNumbers: number[];
  evidence?: Record<string, unknown>;
  createdAt: string;
}

export interface WordVerificationRun {
  id: string;
  form_template_id: string;
  print_job_id?: string | null;
  run_status: "RUNNING" | "PASSED" | "FAILED";
  print_stage: "PRE_WORK" | "POST_COMPLETION";
  output_file_hash: string;
  output_file_path: string;
  evidence_hash: string;
  evidence_path: string;
  page_count: number;
  requested_at: string;
  completed_at?: string | null;
  completed_by?: string | null;
  blocks: WordBlockVerification[];
}

export interface TemplateDetail {
  item: PmTemplateVersion;
  sections: TemplateSection[];
  checks: TemplateCheckItem[];
  materials: TemplateMaterial[];
  instruments: TemplateInstrument[];
  wiDocuments: TemplateWi[];
  attachments: TemplateAttachment[];
  formTemplates: WordTemplateVersion[];
}

export function listTemplateVersions(input: { search?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return api.get<{ items: PmTemplateVersion[]; total: number; limit: number; offset: number }>("master-data/pm-template-studio", input, signal);
}

export function getTemplateVersion(id: string, signal?: AbortSignal) {
  return api.get<TemplateDetail>(`master-data/pm-template-studio/${encodeURIComponent(id)}`, undefined, signal);
}

export function listTemplateImportBatches(input: { pmCode?: string; status?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return api.get<{ items: TemplateImportBatch[]; total: number; limit: number; offset: number }>("master-data/pm-template-studio/import-batches", input, signal);
}

export function getTemplateImportBatch(id: string, signal?: AbortSignal) {
  return api.get<{ item: TemplateImportBatch; rows: TemplateImportRow[]; limit: number; offset: number }>(`master-data/pm-template-studio/import-batches/${encodeURIComponent(id)}`, undefined, signal);
}

export function reviewTemplateImportRow(batchId: string, rowId: string, input: Record<string, unknown>) {
  return api.patch<{ item: TemplateImportRow }>(`master-data/pm-template-studio/import-batches/${encodeURIComponent(batchId)}/rows/${encodeURIComponent(rowId)}`, input);
}

export function approveAllTemplateImportRows(batchId: string) {
  return api.post<{ approved: number }>(`master-data/pm-template-studio/import-batches/${encodeURIComponent(batchId)}/approve-all`);
}

export function approveTemplateImportBatch(batchId: string, note?: string) {
  return api.post<{ item: TemplateImportBatch }>(`master-data/pm-template-studio/import-batches/${encodeURIComponent(batchId)}/approve`, { note });
}

export function applyTemplateImportBatch(batchId: string, versionNo?: string) {
  return api.post<{ item: PmTemplateVersion }>(`master-data/pm-template-studio/import-batches/${encodeURIComponent(batchId)}/apply`, { versionNo });
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

export function saveTemplateAttachments(id: string, items: Array<Record<string, unknown>>) {
  return api.put<TemplateDetail>(`master-data/pm-template-studio/${encodeURIComponent(id)}/attachments`, { items });
}

export function listAttachmentLibrary(input: { search?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return api.get<{ items: AttachmentLibraryItem[]; total: number; limit: number; offset: number }>("master-data/pm-template-studio/attachment-library", input, signal);
}

export function listPublishedAttachmentVersions(signal?: AbortSignal) {
  return api.get<{ items: PublishedAttachmentVersion[] }>("master-data/pm-template-studio/attachment-library/published", undefined, signal);
}

export function getAttachmentLibraryItem(id: string, signal?: AbortSignal) {
  return api.get<{ item: AttachmentLibraryItem; versions: AttachmentLibraryVersion[] }>(`master-data/pm-template-studio/attachment-library/${encodeURIComponent(id)}`, undefined, signal);
}

export function createAttachmentLibraryItem(input: Record<string, unknown>) {
  return api.post<{ item: AttachmentLibraryItem; versions: AttachmentLibraryVersion[] }>("master-data/pm-template-studio/attachment-library", input);
}

export function createAttachmentLibraryRevision(id: string, versionNo: string) {
  return api.post<{ item: AttachmentLibraryItem; versions: AttachmentLibraryVersion[] }>(`master-data/pm-template-studio/attachment-library/${encodeURIComponent(id)}/revisions`, { versionNo });
}

export function updateAttachmentLibraryVersion(id: string, input: Record<string, unknown>) {
  return api.patch<{ item: AttachmentLibraryItem; versions: AttachmentLibraryVersion[] }>(`master-data/pm-template-studio/attachment-library/versions/${encodeURIComponent(id)}`, input);
}

export function publishAttachmentLibraryVersion(id: string, effectiveFrom?: string) {
  return api.post<{ item: AttachmentLibraryItem; versions: AttachmentLibraryVersion[] }>(`master-data/pm-template-studio/attachment-library/versions/${encodeURIComponent(id)}/publish`, { effectiveFrom });
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

export function getWordBlockMappings(id: string, signal?: AbortSignal) {
  return api.get<{ items: WordBlockMapping[]; lifecycleStatus: TemplateLifecycle }>(`precheck/form-templates/${encodeURIComponent(id)}/block-mappings`, undefined, signal);
}

export function getWordVerificationRuns(id: string, signal?: AbortSignal) {
  return api.get<{ items: WordVerificationRun[] }>(`precheck/form-templates/${encodeURIComponent(id)}/verification-runs`, undefined, signal);
}

export function saveWordBlockMappings(id: string, mappings: WordBlockMapping[]) {
  return api.put<{ items: WordBlockMapping[] }>(`precheck/form-templates/${encodeURIComponent(id)}/block-mappings`, {
    mappings: mappings.map((mapping, index) => ({
      blockCode: mapping.block_code,
      sourcePath: mapping.source_path,
      blockType: mapping.block_type,
      wordTargetType: mapping.word_target_type,
      wordTarget: mapping.word_target,
      transformCode: mapping.transform_code,
      configJson: mapping.config_json || {},
      isRequired: mapping.is_required,
      sortOrder: mapping.sort_order || index + 1,
    })),
  });
}

export function publishWordTemplate(id: string, effectiveFrom?: string) {
  return api.post<{ item: WordTemplateVersion }>(`precheck/form-templates/${encodeURIComponent(id)}/publish`, { effectiveFrom });
}
