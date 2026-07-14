import { useQuery } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { StatusBadge } from "../../shared/ui";
import { listPublishedAttachmentVersions, type TemplateAttachment } from "./templateApi";

export function TemplateAttachmentSelector({
  items,
  editable,
  saving,
  onChange,
  onSave,
}: {
  items: TemplateAttachment[];
  editable: boolean;
  saving: boolean;
  onChange(value: TemplateAttachment[]): void;
  onSave(): void;
}) {
  const libraryQuery = useQuery({
    queryKey: ["published-attachment-library"],
    queryFn: ({ signal }) => listPublishedAttachmentVersions(signal),
  });

  function addLibraryVersion(versionId: string) {
    const selected = libraryQuery.data?.items.find((item) => item.attachment_definition_version_id === versionId);
    if (!selected || items.some((item) => item.attachment_definition_version_id === versionId)) return;
    onChange([...items, {
      attachment_definition_version_id: selected.attachment_definition_version_id,
      library_version_no: selected.version_no,
      library_lifecycle_status: "PUBLISHED",
      attachment_code: selected.attachment_code,
      attachment_name: selected.attachment_name,
      attachment_type: selected.attachment_type,
      schema_json: structuredClone(selected.schema_json),
      sort_order: items.length + 1,
      is_required: true,
      condition_code: "ALWAYS",
      schema_version: selected.schema_version,
      render_strategy: selected.render_strategy,
      is_active: true,
    }]);
  }

  function update(index: number, patch: Partial<TemplateAttachment>) {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  return <div className="studio-editor-stack template-attachment-selector">
    <div className="studio-section-heading">
      <div><h3>附件選用</h3><p>附件結構在「附件模板庫」設計；這裡只選擇已發布版本、設定帶入條件與排序。新 P 工單會保存所選版本快照。</p></div>
      {editable ? <label className="attachment-library-picker"><select aria-label="選擇已發布附件" defaultValue="" disabled={libraryQuery.isPending} onChange={(event) => { addLibraryVersion(event.target.value); event.target.value = ""; }}><option value="">選擇已發布附件…</option>{libraryQuery.data?.items.filter((version) => !items.some((item) => item.attachment_definition_version_id === version.attachment_definition_version_id)).map((version) => <option key={version.attachment_definition_version_id} value={version.attachment_definition_version_id}>{version.attachment_name}｜v{version.version_no}</option>)}</select><Plus size={15} /></label> : null}
    </div>
    {libraryQuery.isPending ? <LoadingState /> : null}
    {libraryQuery.isError ? <ErrorState error={libraryQuery.error} onRetry={() => void libraryQuery.refetch()} /> : null}
    {!items.length ? <EmptyState title="這個模板尚未選用附件" description="請先到附件模板庫發布附件，再回到這裡選用。" /> : <div className="table-frame studio-table-frame"><table className="studio-edit-table attachment-binding-table"><thead><tr><th>附件</th><th>來源版本</th><th>帶入條件</th><th>必填</th><th>排序</th>{editable ? <th aria-label="移除" /> : null}</tr></thead><tbody>{items.map((item, index) => <tr key={item.id || item.attachment_definition_version_id || `${item.attachment_code}-${index}`}>
      <td><strong>{item.attachment_name}</strong><small>{item.attachment_code}｜{item.attachment_type}</small></td>
      <td>{item.attachment_definition_version_id ? <StatusBadge tone="success">附件庫 v{item.library_version_no || item.schema_version}</StatusBadge> : <span title="這是 migration 前保留的內嵌附件，可繼續使用；建立新修訂時建議改選附件庫版本。"><StatusBadge tone="warning">舊版內嵌</StatusBadge></span>}</td>
      <td><select disabled={!editable} value={item.condition_code} onChange={(event) => update(index, { condition_code: event.target.value })}><option value="ALWAYS">固定帶入</option><option value="MANUAL_OPTION">列印前選擇</option></select></td>
      <td><input disabled={!editable} type="checkbox" checked={item.is_required} onChange={(event) => update(index, { is_required: event.target.checked })} /></td>
      <td><input className="short-number" disabled={!editable} type="number" min="1" value={item.sort_order} onChange={(event) => update(index, { sort_order: Number(event.target.value) })} /></td>
      {editable ? <td><button className="icon-button" type="button" title="從此模板移除" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></td> : null}
    </tr>)}</tbody></table></div>}
    {editable ? <button className="primary-button studio-save" type="button" disabled={saving} onClick={onSave}><Save size={15} />儲存附件選用</button> : <div className="inline-notice">已發布 P 模板附件不可直接更換；請建立新的 P 模板修訂。</div>}
  </div>;
}
