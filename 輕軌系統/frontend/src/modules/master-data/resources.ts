export interface MasterField {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "boolean" | "select";
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  list?: boolean;
}

export interface MasterResource {
  id: string;
  label: string;
  description: string;
  readOnly?: boolean;
  special?: "pm-template" | "pm-material" | "word-template" | "workflow-options" | "equipment-aliases";
  fields: MasterField[];
}

const activeField: MasterField = { key: "is_active", label: "啟用", type: "boolean", list: true };

export const masterResources: MasterResource[] = [
  {
    id: "users",
    label: "人員與角色",
    description: "派工、經手、審核與簽核人員。",
    fields: [
      { key: "employee_no", label: "員工編號", required: true, list: true },
      { key: "display_name", label: "姓名", required: true, list: true },
      { key: "department", label: "單位", list: true },
      { key: "role_name", label: "職務", list: true },
      { key: "system_role", label: "系統角色", type: "select", required: true, list: true, options: [
        { label: "系統管理員", value: "system_admin" },
        { label: "維修主管", value: "maintenance_supervisor" },
        { label: "排程人員", value: "scheduler" },
        { label: "維修人員", value: "technician" },
        { label: "倉管人員", value: "warehouse_staff" },
        { label: "唯讀人員", value: "viewer" },
      ] },
      activeField,
    ],
  },
  {
    id: "sites",
    label: "場站與路線",
    description: "淡海、安坑與後續場站共用代碼。",
    fields: [
      { key: "site_code", label: "場站代碼", required: true, list: true },
      { key: "site_name", label: "場站名稱", required: true, list: true },
      { key: "line_name", label: "路線", list: true },
      { key: "display_order", label: "排序", type: "number" },
      { key: "remark", label: "備註" },
      activeField,
    ],
  },
  {
    id: "trains",
    label: "車輛與場站",
    description: "車號、原車號、車隊、場站與排序。",
    fields: [
      { key: "train_no", label: "車號", required: true, list: true },
      { key: "former_train_no", label: "原車號", list: true },
      { key: "fleet_name", label: "車隊", list: true },
      { key: "site_code", label: "場站", type: "select", required: true, list: true, options: [{ label: "淡海 D", value: "D" }, { label: "安坑 K", value: "K" }] },
      { key: "line_name", label: "路線" },
      { key: "display_order", label: "排序", type: "number" },
      { key: "remark", label: "備註" },
      activeField,
    ],
  },
  {
    id: "warehouses",
    label: "倉庫與位置",
    description: "中心倉、分存站、現場、車上、廠商與報廢位置。",
    fields: [
      { key: "warehouse_code", label: "位置代碼", required: true, list: true },
      { key: "warehouse_name", label: "位置名稱", required: true, list: true },
      { key: "location_type", label: "位置型態", required: true, list: true },
      { key: "default_stock_status", label: "預設庫存狀態", list: true },
      { key: "is_issue_destination", label: "視為已領料", type: "boolean" },
      { key: "location_note", label: "位置說明" },
      activeField,
    ],
  },
  {
    id: "equipment-groups",
    label: "設備群組",
    description: "設備類型、系統、安全等級與備品水位。",
    fields: [
      { key: "group_code", label: "群組代碼", required: true, list: true },
      { key: "group_name", label: "設備名稱", required: true, list: true },
      { key: "system_name", label: "系統", required: true, list: true },
      { key: "safety_level", label: "安全等級", list: true },
      { key: "fleet_count", label: "車隊數量", type: "number" },
      { key: "online_required_qty", label: "上線需求", type: "number" },
      { key: "min_safety_spare_qty", label: "最低安全備品", type: "number" },
      { key: "warning_spare_qty", label: "警戒備品", type: "number" },
      activeField,
    ],
  },
  {
    id: "equipment-aliases",
    label: "設備別名",
    description: "把外部故障名稱對到正式設備群組或物料。",
    special: "equipment-aliases",
    fields: [],
  },
  {
    id: "vehicle-positions",
    label: "車輛坑位",
    description: "設備實際可裝用位置與階層。",
    fields: [
      { key: "position_code", label: "坑位代碼", required: true, list: true },
      { key: "position_name", label: "坑位名稱", required: true, list: true },
      { key: "site_code", label: "場站", required: true, list: true },
      { key: "train_set_no", label: "車號", list: true },
      { key: "module_no", label: "模組", list: true },
      { key: "position_type", label: "坑位型態", list: true },
      { key: "parent_position_code", label: "上層坑位" },
      { key: "is_installable", label: "可裝設備", type: "boolean" },
      { key: "position_status", label: "狀態" },
      { key: "remark", label: "備註" },
    ],
  },
  {
    id: "instruments",
    label: "儀器主檔",
    description: "儀器編號、類型、校驗效期與使用狀態。",
    fields: [
      { key: "instrument_no", label: "儀器編號", required: true, list: true },
      { key: "instrument_name", label: "儀器名稱", required: true, list: true },
      { key: "instrument_type", label: "類型", list: true },
      { key: "location", label: "位置", list: true },
      { key: "calibration_due_date", label: "校驗效期", type: "date", list: true },
      { key: "status", label: "狀態", list: true },
      { key: "remark", label: "備註" },
    ],
  },
  {
    id: "wi-documents",
    label: "工作說明書",
    description: "W.I.No、版本、類型與啟用狀態。",
    fields: [
      { key: "wi_no", label: "W.I.No", required: true, list: true },
      { key: "wi_name", label: "名稱", required: true, list: true },
      { key: "wi_type", label: "類型", list: true },
      { key: "version_no", label: "版本", list: true },
      { key: "status", label: "狀態", list: true },
      { key: "remark", label: "備註" },
    ],
  },
  {
    id: "pm-templates",
    label: "預檢模板與項目",
    description: "P1/P2/P3/P4 版本、區段、檢查與量測標準。",
    special: "pm-template",
    fields: [
      { key: "pm_code", label: "模板代碼", required: true, list: true },
      { key: "pm_label", label: "顯示名稱", required: true, list: true },
      { key: "maintenance_period", label: "週期", list: true },
      { key: "latest_offset_days", label: "最晚偏移天數", type: "number", list: true },
      { key: "job_description", label: "工作說明" },
      { key: "default_corrective_action", label: "預設處理情形" },
      activeField,
    ],
  },
  {
    id: "pm-materials",
    label: "表單預設用料",
    description: "各檢修級別的用料、數量與列印條件。",
    special: "pm-material",
    fields: [],
  },
  {
    id: "form-templates",
    label: "Word 範本對應",
    description: "原始 Word 版本、欄位來源與 bookmark/placeholder。",
    special: "word-template",
    fields: [],
  },
  {
    id: "workflow-options",
    label: "流程與狀態",
    description: "狀態、處理路線、驗收結果與畫面語意色。",
    special: "workflow-options",
    fields: [],
  },
  {
    id: "document-sequences",
    label: "單號流水",
    description: "P/C/R/J/I 每日、場站與對象的流水使用情形。",
    readOnly: true,
    fields: [
      { key: "document_type", label: "文件類型", list: true },
      { key: "sequence_date", label: "日期", type: "date", list: true },
      { key: "site_code", label: "場站", list: true },
      { key: "target_code", label: "對象", list: true },
      { key: "last_sequence", label: "目前流水", type: "number", list: true },
      { key: "remark", label: "備註" },
    ],
  },
];

export function getMasterResource(id?: string) {
  return masterResources.find((resource) => resource.id === id) ?? masterResources[0];
}
