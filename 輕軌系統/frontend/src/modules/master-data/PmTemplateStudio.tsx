import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CopyPlus, FileText, Plus, Save, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { StatusBadge } from "../../shared/ui";
import { listMaterials } from "../inventory/api";
import { listMasterData } from "./api";
import { AttachmentEditor } from "./AttachmentEditor";
import {
  createTemplateRevision,
  createTemplateVersion,
  createWordTemplate,
  getTemplateVersion,
  getWordBlockMappings,
  getWordMappings,
  listTemplateVersions,
  publishTemplateVersion,
  publishWordTemplate,
  saveTemplateChecks,
  saveTemplateAttachments,
  saveTemplateInstruments,
  saveTemplateMaterials,
  saveTemplateWis,
  saveWordBlockMappings,
  saveWordMappings,
  updateTemplateVersion,
  type TemplateAttachment,
  type TemplateCheckItem,
  type TemplateInstrument,
  type TemplateMaterial,
  type TemplateWi,
  type WordBlockMapping,
  type WordFieldMapping,
  type WordTemplateVersion,
} from "./templateApi";

type StudioSection = "overview" | "checks" | "attachments" | "materials" | "links" | "word";

const sectionLabels: Array<{ id: StudioSection; label: string }> = [
  { id: "overview", label: "版本資訊" },
  { id: "checks", label: "檢查項目" },
  { id: "attachments", label: "附件結構" },
  { id: "materials", label: "預設用料" },
  { id: "links", label: "儀器與 WI" },
  { id: "word", label: "Word 對應" },
];

function lifecycleTone(status: string) {
  if (status === "PUBLISHED") return "success" as const;
  if (status === "DRAFT") return "warning" as const;
  return "neutral" as const;
}

function lifecycleLabel(status: string) {
  return status === "PUBLISHED" ? "已發布" : status === "DRAFT" ? "草稿" : "已退役";
}

function CheckEditor({
  items,
  editable,
  onChange,
  onSave,
  saving,
}: {
  items: TemplateCheckItem[];
  editable: boolean;
  onChange(items: TemplateCheckItem[]): void;
  onSave(): void;
  saving: boolean;
}) {
  return (
    <div className="studio-editor-stack">
      <div className="studio-action-row">
        <p>項目順序與量測上下限會成為新工單的固定版本。</p>
        {editable ? <button className="secondary-button" type="button" onClick={() => onChange([...items, {
          section: "新區段", item_no: "", item_description: "", check_type: "checkbox",
          default_status: "未填", requires_value: false, is_required: false,
          section_sort_order: 0, sort_order: items.length + 1, is_active: true,
        }])}><Plus size={15} />新增項目</button> : null}
      </div>
      <div className="table-frame studio-table-frame">
        <table className="studio-edit-table">
          <thead><tr><th>區段</th><th>編號</th><th>檢查內容</th><th>型態</th><th>標準/單位</th><th>範圍</th><th>必填</th><th>排序</th>{editable ? <th aria-label="移除" /> : null}</tr></thead>
          <tbody>
            {items.filter((item) => item.is_active !== false).map((item, index) => (
              <tr key={item.id || `new-${index}`}>
                <td><input disabled={!editable} value={item.section} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, section: event.target.value } : row))} /></td>
                <td><input disabled={!editable} value={item.item_no} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, item_no: event.target.value } : row))} /></td>
                <td><input disabled={!editable} value={item.item_description} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, item_description: event.target.value } : row))} /></td>
                <td><select disabled={!editable} value={item.check_type} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, check_type: event.target.value as TemplateCheckItem["check_type"], requires_value: event.target.value === "value" } : row))}><option value="checkbox">勾選</option><option value="value">量測</option><option value="text">文字</option></select></td>
                <td><div className="inline-inputs"><input disabled={!editable} value={item.standard_value || ""} placeholder="標準" onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, standard_value: event.target.value } : row))} /><input disabled={!editable} value={item.unit || ""} placeholder="單位" onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, unit: event.target.value } : row))} /></div></td>
                <td><div className="inline-inputs"><input disabled={!editable} type="number" value={item.min_value ?? ""} placeholder="最小" onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, min_value: event.target.value } : row))} /><input disabled={!editable} type="number" value={item.max_value ?? ""} placeholder="最大" onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, max_value: event.target.value } : row))} /></div></td>
                <td><input disabled={!editable} type="checkbox" checked={item.is_required} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, is_required: event.target.checked } : row))} /></td>
                <td><input className="short-number" disabled={!editable} type="number" value={item.sort_order} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, sort_order: Number(event.target.value) } : row))} /></td>
                {editable ? <td><button className="icon-button" type="button" title="停用此項" onClick={() => onChange(items.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? <button className="primary-button studio-save" type="button" disabled={saving} onClick={onSave}><Save size={16} />儲存檢查項目</button> : null}
    </div>
  );
}

function MaterialEditor({
  items,
  editable,
  onChange,
  onSave,
  saving,
}: {
  items: TemplateMaterial[];
  editable: boolean;
  onChange(items: TemplateMaterial[]): void;
  onSave(): void;
  saving: boolean;
}) {
  const [search, setSearch] = useState("");
  const materialQuery = useQuery({
    queryKey: ["template-material-options", search],
    queryFn: ({ signal }) => listMaterials({ search, limit: 20 }, signal),
    enabled: editable,
  });
  const available = materialQuery.data?.items.filter((material) => !items.some((item) => item.material_id === material.id)) || [];
  return (
    <div className="studio-editor-stack">
      {editable ? <div className="studio-picker">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋料號或物料名稱" />
        <select defaultValue="" onChange={(event) => {
          const material = available.find((item) => item.id === event.target.value);
          if (!material) return;
          onChange([...items, {
            material_id: material.id, part_no: material.partNo, material_name: material.materialName,
            spec: material.spec, base_unit: material.unit, default_qty: 0, default_unit: material.unit,
            sort_order: items.length + 1, condition_code: "ALWAYS", condition_options: [],
            is_required: false, is_active: true,
          }]);
          event.target.value = "";
        }}><option value="">新增用料...</option>{available.map((item) => <option key={item.id} value={item.id}>{item.partNo}｜{item.materialName}</option>)}</select>
      </div> : null}
      <div className="table-frame studio-table-frame">
        <table className="studio-edit-table">
          <thead><tr><th>料號 / 名稱</th><th>預設數量</th><th>單位</th><th>帶入條件</th><th>列印說明</th><th>必填</th>{editable ? <th /> : null}</tr></thead>
          <tbody>{items.filter((item) => item.is_active !== false).map((item, index) => <tr key={item.material_id}>
            <td><strong>{item.part_no}</strong><small>{item.material_name}{item.spec ? `｜${item.spec}` : ""}</small></td>
            <td><input disabled={!editable} type="number" step="0.001" value={item.default_qty ?? ""} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, default_qty: event.target.value } : row))} /></td>
            <td><input disabled={!editable} value={item.default_unit || item.base_unit || ""} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, default_unit: event.target.value } : row))} /></td>
            <td><select disabled={!editable} value={item.condition_code || "ALWAYS"} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, condition_code: event.target.value } : row))}><option value="ALWAYS">固定帶入</option><option value="AIR_FILTER_WASH">濾網水洗</option><option value="AIR_FILTER_REPLACE">濾網更換</option><option value="MANUAL_OPTION">列印前選擇</option></select></td>
            <td><input disabled={!editable} value={item.display_note || ""} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, display_note: event.target.value } : row))} /></td>
            <td><input disabled={!editable} type="checkbox" checked={item.is_required} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, is_required: event.target.checked } : row))} /></td>
            {editable ? <td><button className="icon-button" type="button" title="停用此用料" onClick={() => onChange(items.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button></td> : null}
          </tr>)}</tbody>
        </table>
      </div>
      {editable ? <button className="primary-button studio-save" type="button" disabled={saving} onClick={onSave}><Save size={16} />儲存預設用料</button> : null}
    </div>
  );
}

function LinkEditor({
  instruments,
  wis,
  editable,
  onInstruments,
  onWis,
  onSaveInstruments,
  onSaveWis,
}: {
  instruments: TemplateInstrument[];
  wis: TemplateWi[];
  editable: boolean;
  onInstruments(items: TemplateInstrument[]): void;
  onWis(items: TemplateWi[]): void;
  onSaveInstruments(): void;
  onSaveWis(): void;
}) {
  const instrumentOptions = useQuery({ queryKey: ["master-data", "instruments", "template-options"], queryFn: ({ signal }) => listMasterData("instruments", { limit: 200 }, signal) });
  const wiOptions = useQuery({ queryKey: ["master-data", "wi-documents", "template-options"], queryFn: ({ signal }) => listMasterData("wi-documents", { limit: 200 }, signal) });
  return <div className="template-link-grid">
    <section>
      <header><div><h3>儀器與校驗</h3><p>列印前仍會檢查實際校驗效期。</p></div>{editable ? <select defaultValue="" onChange={(event) => {
        const option = instrumentOptions.data?.items.find((item) => item.id === event.target.value);
        if (!option || instruments.some((item) => item.instrument_id === option.id)) return;
        onInstruments([...instruments, { instrument_id: option.id, instrument_no: String(option.instrument_no || ""), instrument_name: String(option.instrument_name || ""), calibration_due_date: String(option.calibration_due_date || ""), status: String(option.status || ""), sort_order: instruments.length + 1, is_required: true, is_active: true }]);
        event.target.value = "";
      }}><option value="">新增儀器...</option>{instrumentOptions.data?.items.map((item) => <option key={item.id} value={item.id}>{String(item.instrument_no)}｜{String(item.instrument_name)}</option>)}</select> : null}</header>
      <ul className="template-link-list">{instruments.filter((item) => item.is_active !== false).map((item, index) => <li key={item.instrument_id}><span><strong>{item.instrument_no}</strong>{item.instrument_name}<small>校驗至 {item.calibration_due_date || "未設定"}</small></span>{editable ? <button className="icon-button" type="button" onClick={() => onInstruments(instruments.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button> : null}</li>)}</ul>
      {editable ? <button className="primary-button" type="button" onClick={onSaveInstruments}><Save size={15} />儲存儀器</button> : null}
    </section>
    <section>
      <header><div><h3>W.I.No</h3><p>工單保存當下使用的工作說明書版本。</p></div>{editable ? <select defaultValue="" onChange={(event) => {
        const option = wiOptions.data?.items.find((item) => item.id === event.target.value);
        if (!option || wis.some((item) => item.wi_document_id === option.id)) return;
        onWis([...wis, { wi_document_id: option.id, wi_no: String(option.wi_no || ""), wi_name: String(option.wi_name || ""), version_no: String(option.version_no || ""), status: String(option.status || ""), sort_order: wis.length + 1, is_required: true, is_active: true }]);
        event.target.value = "";
      }}><option value="">新增 W.I.No...</option>{wiOptions.data?.items.map((item) => <option key={item.id} value={item.id}>{String(item.wi_no)}｜{String(item.wi_name)}</option>)}</select> : null}</header>
      <ul className="template-link-list">{wis.filter((item) => item.is_active !== false).map((item, index) => <li key={item.wi_document_id}><span><strong>{item.wi_no}</strong>{item.wi_name}<small>版本 {item.version_no || "未設定"}</small></span>{editable ? <button className="icon-button" type="button" onClick={() => onWis(wis.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button> : null}</li>)}</ul>
      {editable ? <button className="primary-button" type="button" onClick={onSaveWis}><Save size={15} />儲存 WI</button> : null}
    </section>
  </div>;
}

function blockTypeForAttachment(attachment: TemplateAttachment): WordBlockMapping["block_type"] {
  if (attachment.attachment_type === "SEAT_MAP") return "SEAT_MAP";
  if (attachment.attachment_type === "MEASUREMENT_TABLE") return "MEASUREMENT_TABLE";
  return "OTHER";
}

function targetTypeForAttachment(attachment: TemplateAttachment): WordBlockMapping["word_target_type"] {
  if (attachment.render_strategy === "WORD_TABLE") return "TABLE";
  if (attachment.render_strategy === "WORD_OVERLAY") return attachment.attachment_type === "SEAT_MAP" ? "SHAPE_COORDINATES" : "IMAGE_OVERLAY";
  return "BOOKMARK_RANGE";
}

function WordEditor({ templateId, pmCode, forms, attachments, editable, onChanged }: {
  templateId: string;
  pmCode: string;
  forms: WordTemplateVersion[];
  attachments: TemplateAttachment[];
  editable: boolean;
  onChanged(): void;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [newForm, setNewForm] = useState({ templateCode: `${pmCode}-FORM`, templateName: `${pmCode} 預檢表單`, versionNo: "1", sourceFileName: "", storagePath: "", fileFormat: "DOC" });
  const [mappings, setMappings] = useState<WordFieldMapping[]>([]);
  const [blockMappings, setBlockMappings] = useState<WordBlockMapping[]>([]);

  useEffect(() => {
    if (!selectedId && forms[0]) setSelectedId(forms[0].id);
    if (selectedId && !forms.some((form) => form.id === selectedId)) setSelectedId(forms[0]?.id || "");
  }, [forms, selectedId]);
  useEffect(() => {
    setMappings([]);
    setBlockMappings([]);
  }, [selectedId]);

  const mappingQuery = useQuery({ queryKey: ["word-mappings", selectedId], queryFn: ({ signal }) => getWordMappings(selectedId, signal), enabled: Boolean(selectedId) });
  const blockMappingQuery = useQuery({ queryKey: ["word-block-mappings", selectedId], queryFn: ({ signal }) => getWordBlockMappings(selectedId, signal), enabled: Boolean(selectedId) });
  useEffect(() => { if (mappingQuery.data) setMappings(mappingQuery.data.items); }, [mappingQuery.data]);
  useEffect(() => { if (blockMappingQuery.data) setBlockMappings(blockMappingQuery.data.items); }, [blockMappingQuery.data]);

  const selectedForm = forms.find((form) => form.id === selectedId);
  const formEditable = Boolean(editable && selectedForm?.lifecycle_status === "DRAFT");
  const createMutation = useMutation({ mutationFn: () => createWordTemplate({ ...newForm, pmTemplateId: templateId }), onSuccess: async (result) => { setSelectedId(result.item.id); onChanged(); } });
  const saveMutation = useMutation({ mutationFn: () => saveWordMappings(selectedId, mappings.map((item, index) => ({ ...item, sortOrder: item.sort_order ?? index + 1, fieldKey: item.field_key, sourcePath: item.source_path, wordTargetType: item.word_target_type, wordTarget: item.word_target, transformCode: item.transform_code, defaultValue: item.default_value, isRequired: item.is_required }))), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["word-mappings", selectedId] }); onChanged(); } });
  const saveBlocksMutation = useMutation({ mutationFn: () => saveWordBlockMappings(selectedId, blockMappings), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["word-block-mappings", selectedId] }); onChanged(); } });
  const publishMutation = useMutation({ mutationFn: () => publishWordTemplate(selectedId), onSuccess: () => onChanged() });

  function addAttachmentBlocks() {
    const existing = new Set(blockMappings.map((mapping) => mapping.block_code));
    const additions = attachments
      .filter((attachment) => attachment.is_active !== false && attachment.render_strategy !== "DATA_ONLY" && !existing.has(attachment.attachment_code))
      .map((attachment, index): WordBlockMapping => ({
        block_code: attachment.attachment_code,
        source_path: `backfill.attachments.${attachment.attachment_code}`,
        block_type: blockTypeForAttachment(attachment),
        word_target_type: targetTypeForAttachment(attachment),
        word_target: "",
        config_json: { schemaVersion: attachment.schema_version },
        is_required: attachment.is_required,
        is_verified: false,
        sort_order: blockMappings.length + index + 1,
      }));
    setBlockMappings([...blockMappings, ...additions]);
  }

  return <div className="word-studio">
    <section className="word-form-list">
      <header><h3>Word 範本版本</h3><p>正式版面維持原始 DOC/DOCX；此處只設定資料落點。</p></header>
      <div className="word-template-buttons">{forms.map((form) => <button key={form.id} type="button" aria-pressed={selectedId === form.id} onClick={() => setSelectedId(form.id)}><FileText size={15} /><span><strong>{form.template_name}</strong><small>v{form.version_no}｜{form.lifecycle_status}</small></span></button>)}</div>
      {editable ? <form onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }} className="word-template-create">
        <input required value={newForm.templateCode} onChange={(event) => setNewForm({ ...newForm, templateCode: event.target.value })} placeholder="範本代碼" />
        <input required value={newForm.templateName} onChange={(event) => setNewForm({ ...newForm, templateName: event.target.value })} placeholder="範本名稱" />
        <input required value={newForm.versionNo} onChange={(event) => setNewForm({ ...newForm, versionNo: event.target.value })} placeholder="版號" />
        <input required value={newForm.sourceFileName} onChange={(event) => setNewForm({ ...newForm, sourceFileName: event.target.value })} placeholder="原始檔名.doc" />
        <input required value={newForm.storagePath} onChange={(event) => setNewForm({ ...newForm, storagePath: event.target.value })} placeholder="伺服器範本相對路徑" />
        <select value={newForm.fileFormat} onChange={(event) => setNewForm({ ...newForm, fileFormat: event.target.value })}><option value="DOC">DOC</option><option value="DOCX">DOCX</option></select>
        <button className="secondary-button" disabled={createMutation.isPending}><Plus size={15} />新增 Word 版本</button>
      </form> : null}
    </section>
    {selectedId ? <section className="word-mapping-editor">
      <div className="studio-action-row"><div><h3>固定欄位</h3><p>工單號、車號、日期等單一值。</p></div>{formEditable ? <button className="secondary-button" type="button" onClick={() => setMappings([...mappings, { field_key: "", source_path: "", word_target_type: "PLACEHOLDER", word_target: "", is_required: false, sort_order: mappings.length + 1 }])}><Plus size={15} />新增欄位</button> : null}</div>
      {mappingQuery.isPending ? <LoadingState /> : null}
      <div className="table-frame studio-table-frame"><table className="studio-edit-table"><thead><tr><th>欄位鍵</th><th>資料來源</th><th>Word 型態</th><th>Word 目標</th><th>轉換</th><th>必填</th>{formEditable ? <th /> : null}</tr></thead><tbody>{mappings.map((mapping, index) => <tr key={mapping.id || index}>
        <td><input disabled={!formEditable} value={mapping.field_key} onChange={(event) => setMappings(mappings.map((row, rowIndex) => rowIndex === index ? { ...row, field_key: event.target.value } : row))} /></td>
        <td><input disabled={!formEditable} value={mapping.source_path} onChange={(event) => setMappings(mappings.map((row, rowIndex) => rowIndex === index ? { ...row, source_path: event.target.value } : row))} /></td>
        <td><select disabled={!formEditable} value={mapping.word_target_type} onChange={(event) => setMappings(mappings.map((row, rowIndex) => rowIndex === index ? { ...row, word_target_type: event.target.value as WordFieldMapping["word_target_type"] } : row))}><option value="PLACEHOLDER">Placeholder</option><option value="BOOKMARK">Bookmark</option></select></td>
        <td><input disabled={!formEditable} value={mapping.word_target} onChange={(event) => setMappings(mappings.map((row, rowIndex) => rowIndex === index ? { ...row, word_target: event.target.value } : row))} /></td>
        <td><input disabled={!formEditable} value={mapping.transform_code || ""} onChange={(event) => setMappings(mappings.map((row, rowIndex) => rowIndex === index ? { ...row, transform_code: event.target.value } : row))} /></td>
        <td><input disabled={!formEditable} type="checkbox" checked={mapping.is_required} onChange={(event) => setMappings(mappings.map((row, rowIndex) => rowIndex === index ? { ...row, is_required: event.target.checked } : row))} /></td>
        {formEditable ? <td><button className="icon-button" type="button" title="移除欄位" onClick={() => setMappings(mappings.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button></td> : null}
      </tr>)}</tbody></table></div>
      {formEditable ? <button className="primary-button studio-save" type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}><Save size={15} />儲存固定欄位</button> : null}

      <div className="word-block-heading studio-action-row"><div><h3>動態區塊</h3><p>檢查表、附件圖與量測表的 Word 落點。</p></div>{formEditable ? <div className="button-row"><button className="secondary-button" type="button" onClick={addAttachmentBlocks}><CopyPlus size={15} />從附件補齊</button><button className="secondary-button" type="button" onClick={() => setBlockMappings([...blockMappings, { block_code: `BLOCK-${blockMappings.length + 1}`, source_path: "", block_type: "OTHER", word_target_type: "BOOKMARK_RANGE", word_target: "", is_required: false, is_verified: false, sort_order: blockMappings.length + 1 }])}><Plus size={15} />新增區塊</button></div> : null}</div>
      {blockMappingQuery.isPending ? <LoadingState /> : null}
      <div className="table-frame studio-table-frame"><table className="studio-edit-table word-block-table"><thead><tr><th>區塊代碼</th><th>資料來源</th><th>內容型態</th><th>Word 落點</th><th>目標</th><th>必填</th><th>驗證</th>{formEditable ? <th /> : null}</tr></thead><tbody>{blockMappings.map((mapping, index) => <tr key={mapping.id || `${mapping.block_code}-${index}`}>
        <td><input disabled={!formEditable || Boolean(mapping.id)} value={mapping.block_code} onChange={(event) => setBlockMappings(blockMappings.map((row, rowIndex) => rowIndex === index ? { ...row, block_code: event.target.value.toUpperCase() } : row))} /></td>
        <td><input disabled={!formEditable} value={mapping.source_path} onChange={(event) => setBlockMappings(blockMappings.map((row, rowIndex) => rowIndex === index ? { ...row, source_path: event.target.value } : row))} /></td>
        <td><select disabled={!formEditable} value={mapping.block_type} onChange={(event) => setBlockMappings(blockMappings.map((row, rowIndex) => rowIndex === index ? { ...row, block_type: event.target.value as WordBlockMapping["block_type"] } : row))}><option value="CHECK_TABLE">檢查表</option><option value="MATERIAL_TABLE">用料表</option><option value="SEAT_MAP">座椅圖</option><option value="MEASUREMENT_TABLE">量測表</option><option value="OTHER">其他</option></select></td>
        <td><select disabled={!formEditable} value={mapping.word_target_type} onChange={(event) => setBlockMappings(blockMappings.map((row, rowIndex) => rowIndex === index ? { ...row, word_target_type: event.target.value as WordBlockMapping["word_target_type"] } : row))}><option value="BOOKMARK_RANGE">書籤範圍</option><option value="TABLE">表格</option><option value="SHAPE_COORDINATES">圖形座標</option><option value="IMAGE_OVERLAY">圖片覆蓋</option></select></td>
        <td><input disabled={!formEditable} value={mapping.word_target} onChange={(event) => setBlockMappings(blockMappings.map((row, rowIndex) => rowIndex === index ? { ...row, word_target: event.target.value } : row))} /></td>
        <td><input disabled={!formEditable} type="checkbox" checked={mapping.is_required} onChange={(event) => setBlockMappings(blockMappings.map((row, rowIndex) => rowIndex === index ? { ...row, is_required: event.target.checked } : row))} /></td>
        <td><StatusBadge tone={mapping.is_verified ? "success" : "warning"}>{mapping.is_verified ? "已驗證" : "待驗證"}</StatusBadge></td>
        {formEditable ? <td><button className="icon-button" type="button" title="移除區塊" onClick={() => setBlockMappings(blockMappings.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button></td> : null}
      </tr>)}</tbody></table></div>
      {formEditable ? <div className="button-row word-publish-row"><button className="primary-button" type="button" disabled={saveBlocksMutation.isPending} onClick={() => saveBlocksMutation.mutate()}><Save size={15} />儲存動態區塊</button><button className="secondary-button" type="button" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()}><Send size={15} />發布 Word 版本</button></div> : null}
      {selectedForm?.lifecycle_status === "DRAFT" && blockMappings.some((mapping) => mapping.is_required && !mapping.is_verified) ? <div className="inline-notice is-warning">必填動態區塊須完成實際 Word 輸出驗證後才能發布。</div> : null}
    </section> : <EmptyState title="請選擇 Word 範本版本" description="選擇後才能查看欄位對應。" />}
  </div>;
}

export function PmTemplateStudio({ focus = "overview" }: { focus?: "overview" | "attachments" | "materials" | "word" }) {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<StudioSection>(focus);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [checks, setChecks] = useState<TemplateCheckItem[]>([]);
  const [attachments, setAttachments] = useState<TemplateAttachment[]>([]);
  const [materials, setMaterials] = useState<TemplateMaterial[]>([]);
  const [instruments, setInstruments] = useState<TemplateInstrument[]>([]);
  const [wis, setWis] = useState<TemplateWi[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const limit = 30;

  useEffect(() => setSection(focus), [focus]);
  const listQuery = useQuery({ queryKey: ["pm-template-studio", search, offset], queryFn: ({ signal }) => listTemplateVersions({ search, limit, offset }, signal) });
  useEffect(() => { if (!selectedId && listQuery.data?.items[0]) setSelectedId(listQuery.data.items[0].id); }, [listQuery.data, selectedId]);
  const detailQuery = useQuery({ queryKey: ["pm-template-version", selectedId], queryFn: ({ signal }) => getTemplateVersion(selectedId, signal), enabled: Boolean(selectedId) });
  useEffect(() => {
    const data = detailQuery.data;
    if (!data) return;
    setChecks(data.checks.filter((item) => item.is_active !== false));
    setAttachments(data.attachments.filter((item) => item.is_active !== false));
    setMaterials(data.materials.filter((item) => item.is_active !== false));
    setInstruments(data.instruments.filter((item) => item.is_active !== false));
    setWis(data.wiDocuments.filter((item) => item.is_active !== false));
    setMeta({
      pmLabel: data.item.pm_label, versionNo: data.item.version_no,
      maintenancePeriod: data.item.maintenance_period || "", latestOffsetDays: data.item.latest_offset_days,
      jobDescription: data.item.job_description || "", defaultCorrectiveAction: data.item.default_corrective_action || "",
      effectiveFrom: data.item.effective_from || "", effectiveTo: data.item.effective_to || "",
    });
  }, [detailQuery.data]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["pm-template-studio"] });
    await queryClient.invalidateQueries({ queryKey: ["pm-template-version", selectedId] });
  }
  const saveMeta = useMutation({ mutationFn: () => updateTemplateVersion(selectedId, meta), onSuccess: refresh });
  const saveChecks = useMutation({ mutationFn: () => saveTemplateChecks(selectedId, checks.map((item) => ({ itemNo: item.item_no, itemDescription: item.item_description, section: item.section, checkType: item.check_type, standardValue: item.standard_value, unit: item.unit, defaultStatus: item.default_status, requiresValue: item.requires_value, isRequired: item.is_required, minValue: item.min_value, maxValue: item.max_value, validationRule: item.validation_rule, sectionSortOrder: item.section_sort_order, sortOrder: item.sort_order }))), onSuccess: refresh });
  const saveAttachments = useMutation({ mutationFn: () => saveTemplateAttachments(selectedId, attachments.map((item) => ({ attachmentCode: item.attachment_code, attachmentName: item.attachment_name, attachmentType: item.attachment_type, schemaJson: item.schema_json, sortOrder: item.sort_order, isRequired: item.is_required, conditionCode: item.condition_code, schemaVersion: item.schema_version, renderStrategy: item.render_strategy }))), onSuccess: refresh });
  const saveMaterials = useMutation({ mutationFn: () => saveTemplateMaterials(selectedId, materials.map((item) => ({ materialId: item.material_id, defaultQty: item.default_qty, defaultUnit: item.default_unit, displayNote: item.display_note, conditionCode: item.condition_code, conditionOptions: item.condition_options, isRequired: item.is_required, sortOrder: item.sort_order }))), onSuccess: refresh });
  const saveInstruments = useMutation({ mutationFn: () => saveTemplateInstruments(selectedId, instruments.map((item) => ({ instrumentId: item.instrument_id, isRequired: item.is_required, sortOrder: item.sort_order }))), onSuccess: refresh });
  const saveWis = useMutation({ mutationFn: () => saveTemplateWis(selectedId, wis.map((item) => ({ wiDocumentId: item.wi_document_id, isRequired: item.is_required, sortOrder: item.sort_order }))), onSuccess: refresh });
  const revision = useMutation({ mutationFn: () => createTemplateRevision(selectedId, window.prompt("新版本號", String((detailQuery.data?.item.revision_no || 0) + 1)) || ""), onSuccess: async (result) => { setSelectedId(result.item.id); await refresh(); } });
  const publish = useMutation({ mutationFn: () => publishTemplateVersion(selectedId), onSuccess: refresh });
  const createBase = useMutation({ mutationFn: () => createTemplateVersion({ pmCode: window.prompt("模板代碼，例如 P1") || "", pmLabel: window.prompt("模板名稱") || "", versionNo: "1" }), onSuccess: async (result) => { setSelectedId(result.item.id); await refresh(); } });

  const selected = detailQuery.data?.item;
  const editable = selected?.lifecycle_status === "DRAFT";
  const hasMore = Boolean(listQuery.data && offset + limit < listQuery.data.total);
  const counts = useMemo(() => selected ? `${detailQuery.data?.checks.filter((item) => item.is_active).length || 0} 項檢查｜${detailQuery.data?.attachments.filter((item) => item.is_active).length || 0} 份附件｜${detailQuery.data?.materials.filter((item) => item.is_active).length || 0} 項用料` : "", [detailQuery.data, selected]);

  return <div className="template-studio">
    <aside className="template-version-list">
      <div className="studio-list-toolbar"><input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} placeholder="搜尋 P1/P2/P3/P4 或版號" /><button className="icon-button" type="button" title="建立新模板" onClick={() => createBase.mutate()}><Plus size={16} /></button></div>
      {listQuery.isPending ? <LoadingState /> : null}
      {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} /> : null}
      <div className="template-version-buttons">{listQuery.data?.items.map((item) => <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><span><strong>{item.pm_code}｜{item.pm_label}</strong><small>v{item.version_no} · 修訂 {item.revision_no}</small></span><StatusBadge tone={lifecycleTone(item.lifecycle_status)}>{lifecycleLabel(item.lifecycle_status)}</StatusBadge></button>)}</div>
      <div className="pagination-row"><button className="secondary-button" type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - limit))}>上一頁</button><span>{listQuery.data?.total || 0} 版</span><button className="secondary-button" type="button" disabled={!hasMore} onClick={() => setOffset(offset + limit)}>下一頁</button></div>
    </aside>
    <section className="template-studio-detail">
      {detailQuery.isPending ? <LoadingState /> : null}
      {detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /> : null}
      {selected ? <>
        <header className="template-detail-header"><div><span>{selected.pm_code} · v{selected.version_no}</span><h2>{selected.pm_label}</h2><p>{counts}</p></div><div className="button-row"><StatusBadge tone={lifecycleTone(selected.lifecycle_status)}>{lifecycleLabel(selected.lifecycle_status)}</StatusBadge>{selected.lifecycle_status !== "DRAFT" ? <button className="secondary-button" type="button" disabled={revision.isPending} onClick={() => revision.mutate()}><CopyPlus size={15} />建立新修訂</button> : <button className="primary-button" type="button" disabled={publish.isPending} onClick={() => publish.mutate()}><Send size={15} />發布版本</button>}</div></header>
        <nav className="segmented-nav template-studio-tabs">{sectionLabels.map((item) => <button key={item.id} type="button" aria-selected={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>
        {section === "overview" ? <div className="template-meta-form">
          <label><span>模板名稱</span><input disabled={!editable} value={String(meta.pmLabel || "")} onChange={(event) => setMeta({ ...meta, pmLabel: event.target.value })} /></label>
          <label><span>版號</span><input disabled={!editable} value={String(meta.versionNo || "")} onChange={(event) => setMeta({ ...meta, versionNo: event.target.value })} /></label>
          <label><span>固定週期</span><input disabled={!editable} value={String(meta.maintenancePeriod || "")} onChange={(event) => setMeta({ ...meta, maintenancePeriod: event.target.value })} placeholder="1M / 3M / 6M / 1Y" /></label>
          <label><span>最晚偏移天數</span><input disabled={!editable} type="number" value={String(meta.latestOffsetDays ?? 0)} onChange={(event) => setMeta({ ...meta, latestOffsetDays: Number(event.target.value) })} /></label>
          <label className="span-2"><span>工作說明</span><textarea disabled={!editable} value={String(meta.jobDescription || "")} onChange={(event) => setMeta({ ...meta, jobDescription: event.target.value })} /></label>
          <label className="span-2"><span>預設處理情形</span><textarea disabled={!editable} value={String(meta.defaultCorrectiveAction || "")} onChange={(event) => setMeta({ ...meta, defaultCorrectiveAction: event.target.value })} /></label>
          {editable ? <button className="primary-button" type="button" disabled={saveMeta.isPending} onClick={() => saveMeta.mutate()}><Save size={16} />儲存版本資訊</button> : <div className="inline-notice"><Check size={15} />已發布版本只供工單引用；修改請建立新修訂。</div>}
        </div> : null}
        {section === "checks" ? <CheckEditor items={checks} editable={editable} onChange={setChecks} onSave={() => saveChecks.mutate()} saving={saveChecks.isPending} /> : null}
        {section === "attachments" ? <AttachmentEditor items={attachments} editable={editable} onChange={setAttachments} onSave={() => saveAttachments.mutate()} saving={saveAttachments.isPending} /> : null}
        {section === "materials" ? <MaterialEditor items={materials} editable={editable} onChange={setMaterials} onSave={() => saveMaterials.mutate()} saving={saveMaterials.isPending} /> : null}
        {section === "links" ? <LinkEditor instruments={instruments} wis={wis} editable={editable} onInstruments={setInstruments} onWis={setWis} onSaveInstruments={() => saveInstruments.mutate()} onSaveWis={() => saveWis.mutate()} /> : null}
        {section === "word" ? <WordEditor templateId={selected.id} pmCode={selected.pm_code} forms={detailQuery.data?.formTemplates || []} attachments={attachments} editable={editable} onChanged={() => void refresh()} /> : null}
      </> : !detailQuery.isPending ? <EmptyState title="尚未選擇模板" description="請從左側選擇模板版本。" /> : null}
    </section>
  </div>;
}
