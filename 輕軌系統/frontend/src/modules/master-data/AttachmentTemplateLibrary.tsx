import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyPlus, Plus, Save, Search, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { StatusBadge } from "../../shared/ui";
import { AttachmentEditor } from "./AttachmentEditor";
import {
  createAttachmentLibraryItem,
  createAttachmentLibraryRevision,
  getAttachmentLibraryItem,
  listAttachmentLibrary,
  publishAttachmentLibraryVersion,
  updateAttachmentLibraryVersion,
  type AttachmentLibraryVersion,
  type TemplateAttachment,
  type TemplateAttachmentType,
} from "./templateApi";

function lifecycleLabel(value: AttachmentLibraryVersion["lifecycle_status"]) {
  return value === "PUBLISHED" ? "已發布" : value === "DRAFT" ? "草稿" : "已退版";
}

function lifecycleTone(value: AttachmentLibraryVersion["lifecycle_status"]) {
  return value === "PUBLISHED" ? "success" as const : value === "DRAFT" ? "warning" as const : "neutral" as const;
}

function defaultSchema(type: TemplateAttachmentType): TemplateAttachment["schema_json"] {
  if (type === "SEAT_MAP") return { modules: [{ code: "M1", rows: [["S", "S"], ["S", "S"]] }] };
  if (type === "MEASUREMENT_TABLE") return {
    points: [{ key: "POINT-1", label: "量測點 1" }],
    fields: [{ key: "value", label: "量測值", type: "number", required: true }],
  };
  return { fields: [] };
}

export function AttachmentTemplateLibrary() {
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [editorItem, setEditorItem] = useState<TemplateAttachment | null>(null);
  const [description, setDescription] = useState("");
  const [sourceAssetPath, setSourceAssetPath] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newItem, setNewItem] = useState({
    attachmentCode: "",
    attachmentName: "",
    attachmentType: "OTHER" as TemplateAttachmentType,
    description: "",
    versionNo: "1",
  });

  const listQuery = useQuery({
    queryKey: ["attachment-library", search],
    queryFn: ({ signal }) => listAttachmentLibrary({ search, limit: 100 }, signal),
  });
  useEffect(() => {
    if (!selectedId && listQuery.data?.items[0]) setSelectedId(listQuery.data.items[0].id);
    if (selectedId && listQuery.data && !listQuery.data.items.some((item) => item.id === selectedId)) {
      setSelectedId(listQuery.data.items[0]?.id || "");
    }
  }, [listQuery.data, selectedId]);

  const detailQuery = useQuery({
    queryKey: ["attachment-library-detail", selectedId],
    queryFn: ({ signal }) => getAttachmentLibraryItem(selectedId, signal),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    const versions = detailQuery.data?.versions;
    if (!versions?.length) {
      setSelectedVersionId("");
      return;
    }
    if (!versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(versions.find((version) => version.lifecycle_status === "DRAFT")?.id || versions[0].id);
    }
  }, [detailQuery.data, selectedVersionId]);

  const selectedVersion = useMemo(
    () => detailQuery.data?.versions.find((version) => version.id === selectedVersionId),
    [detailQuery.data, selectedVersionId],
  );

  useEffect(() => {
    const definition = detailQuery.data?.item;
    if (!definition || !selectedVersion) {
      setEditorItem(null);
      return;
    }
    setEditorItem({
      id: selectedVersion.id,
      attachment_definition_version_id: selectedVersion.id,
      attachment_code: definition.attachment_code,
      attachment_name: definition.attachment_name,
      attachment_type: definition.attachment_type,
      schema_json: structuredClone(selectedVersion.schema_json || {}),
      sort_order: 1,
      is_required: true,
      condition_code: "ALWAYS",
      schema_version: selectedVersion.schema_version,
      render_strategy: selectedVersion.render_strategy,
      is_active: true,
    });
    setDescription(definition.description || "");
    setSourceAssetPath(selectedVersion.source_asset_path || "");
  }, [detailQuery.data, selectedVersion]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["attachment-library"] }),
      queryClient.invalidateQueries({ queryKey: ["attachment-library-detail", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["published-attachment-library"] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: () => createAttachmentLibraryItem({
      ...newItem,
      schemaJson: defaultSchema(newItem.attachmentType),
      schemaVersion: 1,
      renderStrategy: newItem.attachmentType === "SEAT_MAP" ? "WORD_OVERLAY" : "WORD_TABLE",
    }),
    onSuccess: async (result) => {
      setSelectedId(result.item.id);
      setSelectedVersionId(result.versions[0]?.id || "");
      setShowCreate(false);
      setNewItem({ attachmentCode: "", attachmentName: "", attachmentType: "OTHER", description: "", versionNo: "1" });
      await refresh();
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersion || !editorItem) throw new Error("請先選擇附件草稿版本");
      return updateAttachmentLibraryVersion(selectedVersion.id, {
        attachmentName: editorItem.attachment_name,
        description,
        schemaJson: editorItem.schema_json,
        schemaVersion: editorItem.schema_version,
        renderStrategy: editorItem.render_strategy,
        sourceAssetPath,
      });
    },
    onSuccess: refresh,
  });

  const revisionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("請先選擇附件模板");
      const versionNo = window.prompt("新附件版號", String((detailQuery.data?.versions.length || 0) + 1));
      if (!versionNo?.trim()) throw new Error("已取消建立修訂");
      return createAttachmentLibraryRevision(selectedId, versionNo.trim());
    },
    onSuccess: async (result) => {
      setSelectedVersionId(result.versions.find((version) => version.lifecycle_status === "DRAFT")?.id || "");
      await refresh();
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVersion) throw new Error("請先選擇附件版本");
      if (!window.confirm(`確定發布附件版本 ${selectedVersion.version_no}？發布後不可直接修改。`)) {
        throw new Error("已取消發布");
      }
      return publishAttachmentLibraryVersion(selectedVersion.id);
    },
    onSuccess: refresh,
  });

  const editable = selectedVersion?.lifecycle_status === "DRAFT";

  return <div className="attachment-library-workspace">
    <aside className="attachment-library-sidebar">
      <form className="studio-list-toolbar" onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); }}>
        <label className="search-field"><Search size={15} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜尋附件代碼或名稱" /></label>
        <button className="icon-button" type="button" title="新增附件模板" onClick={() => setShowCreate(true)}><Plus size={16} /></button>
      </form>
      {listQuery.isPending ? <LoadingState /> : null}
      {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} /> : null}
      <div className="attachment-library-list">{listQuery.data?.items.map((item) => <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}>
        <span><strong>{item.attachment_name}</strong><small>{item.attachment_code}｜{item.attachment_type}</small></span>
        <StatusBadge tone={item.published_version_id ? "success" : "warning"}>{item.published_version_id ? `v${item.published_version_no}` : "未發布"}</StatusBadge>
      </button>)}</div>
      {listQuery.data && !listQuery.data.items.length ? <EmptyState title="尚無附件模板" description="新增後先完成設計，再發布供 P 模板選用。" /> : null}
    </aside>

    <section className="attachment-library-detail">
      {detailQuery.isPending ? <LoadingState /> : null}
      {detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /> : null}
      {detailQuery.data ? <>
        <header className="attachment-library-header">
          <div><span>{detailQuery.data.item.attachment_code}</span><h2>{detailQuery.data.item.attachment_name}</h2><p>先在附件模板庫完成設計與發布；P1/P2/P3/P4 只會選用已發布版本。</p></div>
          <div className="button-row"><button className="secondary-button" type="button" disabled={revisionMutation.isPending} onClick={() => revisionMutation.mutate()}><CopyPlus size={15} />建立新修訂</button>{editable ? <button className="primary-button" type="button" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()}><Send size={15} />發布附件</button> : null}</div>
        </header>
        <nav className="attachment-version-strip" aria-label="附件版本">{detailQuery.data.versions.map((version) => <button key={version.id} type="button" aria-pressed={selectedVersionId === version.id} onClick={() => setSelectedVersionId(version.id)}><span>v{version.version_no}｜結構 {version.schema_version}</span><StatusBadge tone={lifecycleTone(version.lifecycle_status)}>{lifecycleLabel(version.lifecycle_status)}</StatusBadge></button>)}</nav>
        {editorItem && selectedVersion ? <>
          <div className="attachment-library-meta">
            <label><span>用途說明</span><input disabled={!editable} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label><span>原始附件／底圖相對路徑</span><input disabled={!editable} value={sourceAssetPath} onChange={(event) => setSourceAssetPath(event.target.value)} placeholder="例如 templates/p1/seat-map.png" /></label>
          </div>
          <AttachmentEditor
            items={[editorItem]}
            editable={Boolean(editable)}
            saving={saveMutation.isPending}
            onChange={(items) => setEditorItem(items[0] || null)}
            onSave={() => saveMutation.mutate()}
            showList={false}
            allowCollectionActions={false}
            showBindingFields={false}
            saveLabel="儲存附件草稿"
          />
          {!editable ? <div className="inline-notice"><Save size={14} />已發布附件為唯讀；需要修改時請建立新修訂。</div> : null}
          {saveMutation.isError ? <ErrorState title="附件儲存失敗" error={saveMutation.error} /> : null}
        </> : null}
      </> : !detailQuery.isPending ? <EmptyState title="請選擇附件模板" description="可建立座椅圖、量測表或其他數位附件。" /> : null}
    </section>

    {showCreate ? <aside className="edit-drawer attachment-create-drawer" aria-label="新增附件模板">
      <header><div><small>附件模板庫</small><h2>新增附件模板</h2></div><button className="icon-button" type="button" title="關閉" onClick={() => setShowCreate(false)}><X size={18} /></button></header>
      <form onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
        <label><span>附件代碼 *</span><input required value={newItem.attachmentCode} onChange={(event) => setNewItem({ ...newItem, attachmentCode: event.target.value.toUpperCase() })} placeholder="例如 P1-SEAT-MAP" /></label>
        <label><span>附件名稱 *</span><input required value={newItem.attachmentName} onChange={(event) => setNewItem({ ...newItem, attachmentName: event.target.value })} /></label>
        <label><span>附件類型 *</span><select value={newItem.attachmentType} onChange={(event) => setNewItem({ ...newItem, attachmentType: event.target.value as TemplateAttachmentType })}><option value="SEAT_MAP">座椅／位置圖</option><option value="MEASUREMENT_TABLE">量測表格</option><option value="OTHER">一般附件</option></select></label>
        <label><span>初始版號 *</span><input required value={newItem.versionNo} onChange={(event) => setNewItem({ ...newItem, versionNo: event.target.value })} /></label>
        <label><span>用途說明</span><textarea value={newItem.description} onChange={(event) => setNewItem({ ...newItem, description: event.target.value })} /></label>
        {createMutation.isError ? <ErrorState title="建立失敗" error={createMutation.error} /> : null}
        <button className="primary-button" type="submit" disabled={createMutation.isPending}><Plus size={16} />建立草稿</button>
      </form>
    </aside> : null}
  </div>;
}
