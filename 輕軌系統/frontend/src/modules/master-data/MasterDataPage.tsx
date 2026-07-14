import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { PageHeader, Panel, StatusBadge } from "../../shared/ui";
import { createMasterData, listMasterData, updateMasterData, type MasterDataRecord } from "./api";
import { getMasterResource, masterResources, type MasterField } from "./resources";
import { PmTemplateStudio } from "./PmTemplateStudio";
import { WorkflowOptionsMaster } from "./WorkflowOptionsMaster";
import { EquipmentAliasesMaster } from "./EquipmentAliasesMaster";
import { AttachmentTemplateLibrary } from "./AttachmentTemplateLibrary";

function toInputValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: MasterField;
  value: unknown;
  onChange(value: unknown): void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="toggle-field">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        <span>{Boolean(value) ? "是" : "否"}</span>
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <select value={toInputValue(value)} onChange={(event) => onChange(event.target.value)} required={field.required}>
        <option value="">請選擇</option>
        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={toInputValue(value)}
      required={field.required}
      onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
    />
  );
}

export function MasterDataPage() {
  const params = useParams();
  const resource = getMasterResource(params.resource);
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MasterDataRecord | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const listQuery = useQuery({
    queryKey: ["master-data", resource.id, search],
    queryFn: ({ signal }) => listMasterData(resource.id, { search, limit: 100 }, signal),
    enabled: !resource.special,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (selected) return updateMasterData(resource.id, selected.id, draft);
      return createMasterData(resource.id, draft);
    },
    onSuccess: async () => {
      setSelected(null);
      setDraft({});
      await queryClient.invalidateQueries({ queryKey: ["master-data", resource.id] });
    },
  });

  const listFields = useMemo(() => resource.fields.filter((field) => field.list), [resource.fields]);

  function openNew() {
    setSelected(null);
    setDraft(Object.fromEntries(resource.fields.filter((field) => field.type === "boolean").map((field) => [field.key, field.key === "is_active"])));
  }

  function openEdit(row: MasterDataRecord) {
    setSelected(row);
    setDraft(Object.fromEntries(resource.fields.map((field) => [field.key, row[field.key]])));
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="主檔設定"
        description="共用代碼、表單帶入規則與基礎資料；已被引用的資料只停用、不刪除。"
        actions={<StatusBadge tone="info">{resource.label}</StatusBadge>}
      />

      <div className="master-workspace">
        <nav className="master-subnav" aria-label="主檔分類">
          {masterResources.filter((item) => !item.hidden).map((item) => (
            <NavLink key={item.id} to={`/master-data/${item.id}`} className={({ isActive }) => isActive ? "is-active" : ""}>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </NavLink>
          ))}
        </nav>

        <Panel title={resource.label} description={resource.description} className="master-content-panel">
          {resource.special === "pm-template" ? <PmTemplateStudio focus="overview" /> : null}
          {resource.special === "pm-material" ? <PmTemplateStudio focus="resources" /> : null}
          {resource.special === "word-template" ? <PmTemplateStudio focus="word" /> : null}
          {resource.special === "attachment-library" ? <AttachmentTemplateLibrary /> : null}
          {resource.special === "workflow-options" ? <WorkflowOptionsMaster /> : null}
          {resource.special === "equipment-aliases" ? <EquipmentAliasesMaster /> : null}
          {!resource.special ? <>
          <form
            className="toolbar master-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchDraft.trim());
            }}
          >
            <label className="search-field">
              <Search size={17} />
              <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={`搜尋${resource.label}`} />
            </label>
            <button className="secondary-button" type="submit">查詢</button>
            {!resource.readOnly ? <button className="primary-button" type="button" onClick={openNew}><Plus size={16} />新增</button> : null}
          </form>

          {listQuery.isPending ? <LoadingState /> : null}
          {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} /> : null}
          {listQuery.data && !listQuery.data.items.length ? <EmptyState title="目前沒有資料" description="可調整篩選條件或新增主檔。" /> : null}
          {listQuery.data?.items.length ? (
            <div className="table-frame">
              <table>
                <thead><tr>{listFields.map((field) => <th key={field.key}>{field.label}</th>)}<th>操作</th></tr></thead>
                <tbody>
                  {listQuery.data.items.map((row) => (
                    <tr key={row.id}>
                      {listFields.map((field) => <td key={field.key}>{field.type === "boolean" ? (row[field.key] ? "是" : "否") : toInputValue(row[field.key]) || "—"}</td>)}
                      <td><button className="table-action" type="button" onClick={() => openEdit(row)} disabled={resource.readOnly}>編輯</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          </> : null}
        </Panel>

        {!resource.special && !resource.readOnly && (selected || Object.keys(draft).length > 0) ? (
          <aside className="edit-drawer" aria-label={`${selected ? "編輯" : "新增"}${resource.label}`}>
            <header>
              <div><small>{selected ? "編輯主檔" : "新增主檔"}</small><h2>{resource.label}</h2></div>
              <button className="icon-button" type="button" aria-label="關閉編輯" onClick={() => { setSelected(null); setDraft({}); }}><X size={18} /></button>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              {resource.fields.map((field) => (
                <label key={field.key}>
                  <span>{field.label}{field.required ? " *" : ""}</span>
                  <FieldInput field={field} value={draft[field.key]} onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} />
                </label>
              ))}
              {mutation.isError ? <ErrorState title="儲存失敗" error={mutation.error} /> : null}
              <button className="primary-button" type="submit" disabled={mutation.isPending}><Save size={16} />儲存</button>
            </form>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
