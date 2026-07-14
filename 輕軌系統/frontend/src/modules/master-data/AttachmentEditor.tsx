import { CopyPlus, Minus, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AttachmentField,
  MeasurementPoint,
  SeatMapModule,
  TemplateAttachment,
} from "./templateApi";

function nextSeatValue(value: "S" | "P" | null) {
  if (value === null) return "S" as const;
  if (value === "S") return "P" as const;
  return null;
}

function newAttachment(index: number): TemplateAttachment {
  return {
    attachment_code: `NEW-ATTACHMENT-${index + 1}`,
    attachment_name: "新附件",
    attachment_type: "OTHER",
    schema_json: { fields: [] },
    sort_order: index + 1,
    is_required: true,
    condition_code: "ALWAYS",
    schema_version: 1,
    render_strategy: "WORD_BLOCK",
    is_active: true,
  };
}

function SeatMapEditor({ modules, editable, onChange }: { modules: SeatMapModule[]; editable: boolean; onChange(value: SeatMapModule[]): void }) {
  function updateModule(index: number, value: SeatMapModule) {
    onChange(modules.map((module, moduleIndex) => moduleIndex === index ? value : module));
  }
  return <div className="attachment-schema-editor seat-schema-editor">
    <div className="studio-action-row"><div><h4>座椅配置</h4><p>點座位切換：空位 → 一般座椅 → 優先座椅。</p></div>{editable ? <button className="secondary-button" type="button" onClick={() => onChange([...modules, { code: `M${modules.length + 1}`, rows: [["S", "S"]] }])}><Plus size={14} />新增模組</button> : null}</div>
    <div className="seat-module-list">{modules.map((module, moduleIndex) => <section key={`${module.code}-${moduleIndex}`} className="seat-module-editor">
      <header><label><span>模組代碼</span><input disabled={!editable} value={module.code} onChange={(event) => updateModule(moduleIndex, { ...module, code: event.target.value.toUpperCase() })} /></label>{editable ? <button className="icon-button" type="button" title="移除模組" onClick={() => onChange(modules.filter((_, index) => index !== moduleIndex))}><Trash2 size={14} /></button> : null}</header>
      <div className="seat-row-editor">{module.rows.map((row, rowIndex) => <div key={rowIndex} className="seat-row-line"><span>第 {rowIndex + 1} 列</span><div className="seat-cell-line">{row.map((cell, cellIndex) => <button key={cellIndex} type="button" disabled={!editable} className={`seat-schema-cell is-${cell || "empty"}`} title={cell === "S" ? "一般座椅" : cell === "P" ? "優先座椅" : "空位"} onClick={() => updateModule(moduleIndex, { ...module, rows: module.rows.map((currentRow, currentIndex) => currentIndex === rowIndex ? currentRow.map((currentCell, currentCellIndex) => currentCellIndex === cellIndex ? nextSeatValue(currentCell) : currentCell) : currentRow) })}>{cell || "·"}</button>)}</div>{editable ? <div className="compact-actions"><button className="icon-button" type="button" title="增加一格" onClick={() => updateModule(moduleIndex, { ...module, rows: module.rows.map((currentRow, currentIndex) => currentIndex === rowIndex ? [...currentRow, null] : currentRow) })}><Plus size={13} /></button><button className="icon-button" type="button" title="移除最後一格" disabled={row.length <= 1} onClick={() => updateModule(moduleIndex, { ...module, rows: module.rows.map((currentRow, currentIndex) => currentIndex === rowIndex ? currentRow.slice(0, -1) : currentRow) })}><Minus size={13} /></button><button className="icon-button" type="button" title="移除此列" disabled={module.rows.length <= 1} onClick={() => updateModule(moduleIndex, { ...module, rows: module.rows.filter((_, index) => index !== rowIndex) })}><Trash2 size={13} /></button></div> : null}</div>)}</div>
      {editable ? <button className="text-button" type="button" onClick={() => updateModule(moduleIndex, { ...module, rows: [...module.rows, ["S", "S"]] })}><Plus size={13} />新增座椅列</button> : null}
    </section>)}</div>
  </div>;
}

function PointEditor({ points, editable, onChange }: { points: MeasurementPoint[]; editable: boolean; onChange(value: MeasurementPoint[]): void }) {
  return <section className="attachment-subsection"><div className="studio-action-row"><h4>量測點</h4>{editable ? <button className="secondary-button" type="button" onClick={() => onChange([...points, { key: `POINT-${points.length + 1}`, label: `量測點 ${points.length + 1}` }])}><Plus size={14} />新增量測點</button> : null}</div><div className="attachment-point-grid">{points.map((point, index) => <div key={`${point.key}-${index}`}><input disabled={!editable} value={point.key} placeholder="穩定代碼" onChange={(event) => onChange(points.map((row, rowIndex) => rowIndex === index ? { ...row, key: event.target.value.toUpperCase() } : row))} /><input disabled={!editable} value={point.label} placeholder="顯示名稱" onChange={(event) => onChange(points.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} />{editable ? <button className="icon-button" type="button" title="移除量測點" onClick={() => onChange(points.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button> : null}</div>)}</div></section>;
}

function FieldEditor({ fields, editable, onChange }: { fields: AttachmentField[]; editable: boolean; onChange(value: AttachmentField[]): void }) {
  return <section className="attachment-subsection"><div className="studio-action-row"><h4>欄位與標準</h4>{editable ? <button className="secondary-button" type="button" onClick={() => onChange([...fields, { key: `FIELD-${fields.length + 1}`, label: `欄位 ${fields.length + 1}`, type: "number", required: true }])}><Plus size={14} />新增欄位</button> : null}</div><div className="table-frame studio-table-frame"><table className="studio-edit-table"><thead><tr><th>欄位代碼</th><th>名稱</th><th>型態</th><th>單位</th><th>最小</th><th>最大</th><th>必填</th>{editable ? <th /> : null}</tr></thead><tbody>{fields.map((field, index) => <tr key={`${field.key}-${index}`}><td><input disabled={!editable} value={field.key} onChange={(event) => onChange(fields.map((row, rowIndex) => rowIndex === index ? { ...row, key: event.target.value } : row))} /></td><td><input disabled={!editable} value={field.label} onChange={(event) => onChange(fields.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} /></td><td><select disabled={!editable} value={field.type || "number"} onChange={(event) => onChange(fields.map((row, rowIndex) => rowIndex === index ? { ...row, type: event.target.value } : row))}><option value="number">數值</option><option value="status">正常／異常</option><option value="text">文字</option><option value="date">日期</option></select></td><td><input disabled={!editable} value={field.unit || ""} onChange={(event) => onChange(fields.map((row, rowIndex) => rowIndex === index ? { ...row, unit: event.target.value } : row))} /></td><td><input disabled={!editable} type="number" value={field.min ?? ""} onChange={(event) => onChange(fields.map((row, rowIndex) => rowIndex === index ? { ...row, min: event.target.value } : row))} /></td><td><input disabled={!editable} type="number" value={field.max ?? ""} onChange={(event) => onChange(fields.map((row, rowIndex) => rowIndex === index ? { ...row, max: event.target.value } : row))} /></td><td><input disabled={!editable} type="checkbox" checked={field.required !== false} onChange={(event) => onChange(fields.map((row, rowIndex) => rowIndex === index ? { ...row, required: event.target.checked } : row))} /></td>{editable ? <td><button className="icon-button" type="button" title="移除欄位" onClick={() => onChange(fields.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button></td> : null}</tr>)}</tbody></table></div></section>;
}

export function AttachmentEditor({
  items,
  editable,
  saving,
  onChange,
  onSave,
  showList = true,
  allowCollectionActions = true,
  showBindingFields = true,
  saveLabel = "儲存附件設定",
}: {
  items: TemplateAttachment[];
  editable: boolean;
  saving: boolean;
  onChange(value: TemplateAttachment[]): void;
  onSave(): void;
  showList?: boolean;
  allowCollectionActions?: boolean;
  showBindingFields?: boolean;
  saveLabel?: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => { if (selectedIndex >= items.length) setSelectedIndex(Math.max(0, items.length - 1)); }, [items.length, selectedIndex]);
  const selected = items[selectedIndex];
  function updateSelected(value: TemplateAttachment) {
    onChange(items.map((item, index) => index === selectedIndex ? value : item));
  }
  return <div className={`attachment-studio${showList ? "" : " is-single"}`}>
    {showList ? <aside className="attachment-list-panel"><div className="studio-action-row"><div><h3>附件清單</h3><p>附件隨模板版本保存。</p></div>{editable && allowCollectionActions ? <button className="icon-button" type="button" title="新增附件" onClick={() => { onChange([...items, newAttachment(items.length)]); setSelectedIndex(items.length); }}><Plus size={15} /></button> : null}</div><div className="attachment-list-buttons">{items.map((item, index) => <button key={item.id || `${item.attachment_code}-${index}`} type="button" aria-pressed={selectedIndex === index} onClick={() => setSelectedIndex(index)}><span><strong>{item.attachment_name}</strong><small>{item.attachment_code}｜{item.attachment_type}</small></span><span>{item.is_required ? "必填" : "選填"}</span></button>)}</div></aside> : null}
    <section className="attachment-detail-panel">{selected ? <><header className="attachment-detail-header"><div><span>附件 {selectedIndex + 1}</span><h3>{selected.attachment_name}</h3></div>{editable && allowCollectionActions ? <div className="button-row"><button className="secondary-button" type="button" onClick={() => { const copy = { ...selected, id: undefined, attachment_code: `${selected.attachment_code}-COPY`, attachment_name: `${selected.attachment_name} 副本`, sort_order: items.length + 1, schema_json: structuredClone(selected.schema_json) }; onChange([...items, copy]); setSelectedIndex(items.length); }}><CopyPlus size={14} />複製</button><button className="icon-button" type="button" title="移除附件" onClick={() => onChange(items.filter((_, index) => index !== selectedIndex))}><Trash2 size={14} /></button></div> : null}</header><div className="attachment-meta-grid"><label><span>附件代碼</span><input disabled={!editable || Boolean(selected.id)} value={selected.attachment_code} onChange={(event) => updateSelected({ ...selected, attachment_code: event.target.value.toUpperCase() })} /></label><label><span>附件名稱</span><input disabled={!editable} value={selected.attachment_name} onChange={(event) => updateSelected({ ...selected, attachment_name: event.target.value })} /></label><label><span>附件類型</span><select disabled={!editable || Boolean(selected.id)} value={selected.attachment_type} onChange={(event) => { const type = event.target.value as TemplateAttachment["attachment_type"]; updateSelected({ ...selected, attachment_type: type, schema_json: type === "SEAT_MAP" ? { modules: [{ code: "M1", rows: [["S", "S"]] }] } : type === "MEASUREMENT_TABLE" ? { points: [{ key: "POINT-1", label: "量測點 1" }], fields: [{ key: "value", label: "量測值", type: "number", required: true }] } : { fields: [] } }); }}><option value="SEAT_MAP">座椅／位置圖</option><option value="MEASUREMENT_TABLE">量測表格</option><option value="OTHER">一般附件</option></select></label><label><span>Word 輸出</span><select disabled={!editable} value={selected.render_strategy} onChange={(event) => updateSelected({ ...selected, render_strategy: event.target.value as TemplateAttachment["render_strategy"] })}><option value="WORD_BLOCK">Word 區塊</option><option value="WORD_TABLE">Word 表格</option><option value="WORD_OVERLAY">Word 圖形標記</option><option value="DATA_ONLY">僅保存數位資料</option></select></label>{showBindingFields ? <><label><span>帶入條件</span><select disabled={!editable} value={selected.condition_code} onChange={(event) => updateSelected({ ...selected, condition_code: event.target.value })}><option value="ALWAYS">固定帶入</option><option value="MANUAL_OPTION">列印前選擇</option></select></label><label className="toggle-label"><input disabled={!editable} type="checkbox" checked={selected.is_required} onChange={(event) => updateSelected({ ...selected, is_required: event.target.checked })} /><span>完工前必須回填</span></label><label><span>排序</span><input disabled={!editable} type="number" value={selected.sort_order} onChange={(event) => updateSelected({ ...selected, sort_order: Number(event.target.value) })} /></label></> : null}<label><span>結構版號</span><input disabled={!editable} type="number" min="1" value={selected.schema_version} onChange={(event) => updateSelected({ ...selected, schema_version: Number(event.target.value) })} /></label></div>
      {selected.attachment_type === "SEAT_MAP" ? <SeatMapEditor modules={selected.schema_json.modules || []} editable={editable} onChange={(modules) => updateSelected({ ...selected, schema_json: { ...selected.schema_json, modules } })} /> : null}
      {selected.attachment_type === "MEASUREMENT_TABLE" ? <><PointEditor points={selected.schema_json.points || []} editable={editable} onChange={(points) => updateSelected({ ...selected, schema_json: { ...selected.schema_json, points } })} /><FieldEditor fields={selected.schema_json.fields || []} editable={editable} onChange={(fields) => updateSelected({ ...selected, schema_json: { ...selected.schema_json, fields } })} /></> : null}
      {selected.attachment_type === "OTHER" ? <FieldEditor fields={selected.schema_json.fields || []} editable={editable} onChange={(fields) => updateSelected({ ...selected, schema_json: { ...selected.schema_json, fields } })} /> : null}
    </> : <div className="empty-inline">尚未建立附件。</div>}{editable ? <button className="primary-button studio-save" type="button" disabled={saving} onClick={onSave}><Save size={15} />{saveLabel}</button> : null}</section>
  </div>;
}
