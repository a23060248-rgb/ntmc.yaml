import { api } from "../../shared/api/client";
import type { PagedResult } from "../../shared/types/api";

export type ScheduleTargetType = "VEHICLE" | "DEPOT_EQUIPMENT";

export interface ScheduleItem {
  id: string;
  importBatchId?: string;
  scheduleYear: number;
  scheduleMonth: number;
  siteCode: string;
  targetType: ScheduleTargetType;
  targetKey: string;
  targetName: string;
  trainId?: string;
  equipmentGroupId?: string;
  pmLevel: "1M" | "3M" | "6M" | "1Y" | "5Y/1Y";
  fixedCycleMonths?: number;
  latestActualFinishDate?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  latheStartDate?: string;
  latheEndDate?: string;
  generatedWorkOrderId?: string;
  scheduleStatus: string;
  isPublished: boolean;
  publishedAt?: string;
  isManual: boolean;
  isForced: boolean;
  needsReview: boolean;
  reviewReasons: string[];
  version: number;
  updatedAt: string;
}

export interface ScheduleImportBatch {
  id: string;
  batch_no: string;
  source_file?: string;
  source_year: number;
  target_type: ScheduleTargetType;
  import_status: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  imported_by_name?: string;
  imported_at: string;
}

export interface NormalizedImportRow {
  rowNo?: number;
  targetKey: string;
  targetName: string;
  targetType: ScheduleTargetType;
  latestActualFinishDate?: string;
  levels?: Record<string, string>;
  month?: number;
  pmLevel?: string;
  deferToMonthEnd?: boolean;
}

export interface CalendarException {
  calendar_date: string;
  site_code: string;
  day_type: "HOLIDAY" | "WORKDAY";
  name: string;
  source: string;
}

export interface PackageListItem {
  work_order_no: string;
  title: string;
  status: string;
  work_order_date: string;
  planned_start_at?: string;
  pm_code: string;
  backfill_status: string;
  train_no?: string;
  target_name?: string;
  target_type?: ScheduleTargetType;
  pm_level?: string;
  planned_start_date?: string;
  has_print: boolean;
}

export interface PackageMaterial {
  material_id: string;
  part_no: string;
  material_name: string;
  spec?: string;
  planned_qty?: string;
  actual_qty?: string;
  unit?: string;
  note?: string;
  template_default_qty?: string;
  condition_code?: string;
  condition_options?: Array<Record<string, unknown>>;
}

export interface PackageInstrument {
  id: string;
  instrument_no: string;
  instrument_name: string;
  calibration_due_date?: string;
  status: string;
}

export interface PackageWi {
  id: string;
  wi_no: string;
  title?: string;
  wi_name?: string;
  version_no?: string;
  status: string;
}

export interface FormTemplate {
  id: string;
  template_code: string;
  template_name: string;
  pm_template_id: string;
  version_no: string;
  source_file_name: string;
  storage_path: string;
  file_hash?: string;
  file_format: "DOC" | "DOCX";
  mapping_count?: number;
}

export interface PrintJob {
  id: string;
  print_stage: "PRE_WORK" | "POST_COMPLETION";
  job_status: "QUEUED" | "GENERATING" | "READY" | "FAILED";
  copies: number;
  output_file_name?: string;
  output_hash?: string;
  requested_at: string;
  generated_at?: string;
  error_message?: string;
  template_name: string;
  version_no: string;
}

export interface WorkPackage {
  workOrderId: string;
  workOrderNo: string;
  status: string;
  title: string;
  trainNo?: string;
  targetKey?: string;
  targetName?: string;
  targetType?: ScheduleTargetType;
  pmCode: string;
  pmLabel?: string;
  pmTemplateVersion?: string;
  pmTemplateRevision?: number;
  pmLevel?: string;
  planStartDate?: string;
  plannedEndDate?: string;
  latestFinishDate?: string;
  latestActualFinishDate?: string;
  maintenanceType?: string;
  executionType?: string;
  formTemplateId?: string;
  formSnapshot: Record<string, unknown>;
  backfillStatus: string;
  materials: PackageMaterial[];
  instruments: PackageInstrument[];
  wiDocuments: PackageWi[];
  formTemplates: FormTemplate[];
  printJobs: PrintJob[];
}

export interface CheckItemResult {
  id: string;
  section: string;
  item_no: string;
  item_description: string;
  check_type: "checkbox" | "value" | "text";
  standard_value?: string;
  unit?: string;
  default_status: string;
  requires_value: boolean;
  is_required: boolean;
  min_value?: string;
  max_value?: string;
  result_id?: string;
  result_status?: string;
  result_value?: string;
  result_remark?: string;
  abnormal_action?: "CREATE_C" | "UPDATE_C" | "RECORD_ONLY";
  linked_fault_work_order_id?: string;
  linked_fault_work_order_no?: string;
  abnormal_reason?: string;
  open_fault_work_order_id?: string;
  open_fault_work_order_no?: string;
  open_fault_status?: string;
}

export interface TemplateAttachment {
  id: string;
  attachment_code: string;
  attachment_name: string;
  attachment_type: "SEAT_MAP" | "MEASUREMENT_TABLE" | "OTHER";
  schema_json: Record<string, unknown>;
}

export interface AttachmentResult {
  id?: string;
  template_attachment_id: string;
  item_key: string;
  result_status: "正常" | "異常" | "N/A" | "未填";
  result_value: Record<string, unknown>;
  remark?: string;
  abnormal_action?: "CREATE_C" | "UPDATE_C" | "RECORD_ONLY";
  linked_fault_work_order_id?: string;
  linked_fault_work_order_no?: string;
  abnormal_reason?: string;
}

export interface BackfillDetail {
  item: WorkPackage;
  workOrder: Record<string, unknown>;
  checks: CheckItemResult[];
  attachments: TemplateAttachment[];
  attachmentResults: AttachmentResult[];
  dangerPeriods: Array<{ id?: string; start_at: string; end_at: string; note?: string; hours?: string }>;
}

export function listSchedules(input: { year?: number; month?: number; targetType?: string; search?: string; needsReview?: boolean; limit?: number; offset?: number }, signal?: AbortSignal) {
  return api.get<PagedResult<ScheduleItem>>("precheck/schedules", input, signal);
}

export function getSchedule(id: string, signal?: AbortSignal) {
  return api.get<{ item: ScheduleItem; changes: Array<Record<string, unknown>> }>(`precheck/schedules/${encodeURIComponent(id)}`, undefined, signal);
}

export function updateSchedule(id: string, input: { plannedStartDate: string; plannedEndDate?: string; reason: string; isForced?: boolean; needsReview?: boolean; reviewReason?: string }) {
  return api.patch<{ item: ScheduleItem }>(`precheck/schedules/${encodeURIComponent(id)}`, input);
}

export function generateSchedules(input: { startDate: string; reason?: string }) {
  return api.post<{ generated: number; reviewCount: number; startDate: string; endDate: string }>("precheck/schedules/generate", input);
}

export function replanSchedules(input: { startDate: string; reason: string }) {
  return api.post<{ generated: number; reviewCount: number; startDate: string; endDate: string }>("precheck/schedules/replan", input);
}

export function publishSchedules(ids: string[], reason?: string) {
  return api.post<{ published: number }>("precheck/schedules/publish", { ids, reason });
}

export function listCalendarExceptions(year: number, signal?: AbortSignal) {
  return api.get<{ items: CalendarException[] }>("precheck/calendar-exceptions", { year }, signal);
}

export function saveCalendarException(input: { date: string; dayType: "HOLIDAY" | "WORKDAY"; name: string; siteCode?: string }) {
  return api.post<{ item: CalendarException }>("precheck/calendar-exceptions", input);
}

export function listScheduleImports(signal?: AbortSignal) {
  return api.get<{ items: ScheduleImportBatch[] }>("precheck/imports", { limit: 50 }, signal);
}

export function previewScheduleImport(input: { sourceFile?: string; sourceYear: number; targetType: ScheduleTargetType; siteCode?: string; rows: NormalizedImportRow[] }) {
  return api.post<{ batch: ScheduleImportBatch; preview: { rows: NormalizedImportRow[]; errors: Array<{ rowNo: number; targetKey?: string; month?: number; reasons: string[] }> } }>("precheck/imports/preview", input);
}

export function applyScheduleImport(id: string) {
  return api.post<{ batchNo: string; applied: number }>(`precheck/imports/${encodeURIComponent(id)}/apply`);
}

export function createWorkOrderFromSchedule(id: string) {
  return api.post<{ workOrderNo: string; existing: boolean }>(`precheck/schedules/${encodeURIComponent(id)}/work-order`);
}

export function listPackages(input: { search?: string; status?: string; limit?: number }, signal?: AbortSignal) {
  return api.get<{ items: PackageListItem[] }>("precheck/packages", input, signal);
}

export function getPackage(no: string, signal?: AbortSignal) {
  return api.get<{ item: WorkPackage }>(`precheck/packages/${encodeURIComponent(no)}`, undefined, signal);
}

export function updatePackage(no: string, input: Record<string, unknown>) {
  return api.patch<{ item: WorkPackage }>(`precheck/packages/${encodeURIComponent(no)}`, input);
}

export function createPrintJob(no: string, input: { formTemplateId: string; copies: number }, stage: "PRE_WORK" | "POST_COMPLETION" = "PRE_WORK") {
  const path = stage === "PRE_WORK" ? `precheck/packages/${encodeURIComponent(no)}/print-jobs` : `precheck/backfills/${encodeURIComponent(no)}/print-jobs`;
  return api.post<{ id: string; status: string; outputFileName?: string; outputHash?: string }>(path, input);
}

export function listBackfills(signal?: AbortSignal) {
  return api.get<{ items: Array<{ work_order_no: string; title: string; status: string; train_no?: string; pm_code: string; backfill_status: string; pm_level?: string; planned_start_date?: string; printed_days_ago?: number; abnormal_count: number }> }>("precheck/backfills", { limit: 200 }, signal);
}

export function getBackfill(no: string, signal?: AbortSignal) {
  return api.get<BackfillDetail>(`precheck/backfills/${encodeURIComponent(no)}`, undefined, signal);
}

export function saveBackfill(no: string, input: Record<string, unknown>) {
  return api.patch<BackfillDetail>(`precheck/backfills/${encodeURIComponent(no)}`, input);
}

export function completeBackfill(no: string, input: Record<string, unknown>) {
  return api.post<{ workOrderNo: string; abnormalCount: number; linkedFaultOrders: Array<{ id: string; workOrderNo: string }>; consumptionCount: number }>(`precheck/backfills/${encodeURIComponent(no)}/complete`, input);
}

export function listFormTemplates(signal?: AbortSignal) {
  return api.get<{ items: FormTemplate[] }>("precheck/form-templates", undefined, signal);
}
