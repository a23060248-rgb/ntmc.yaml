import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { StatusBadge } from "../../shared/ui";
import { createWorkflowOption, listWorkflowOptions, updateWorkflowOption, type WorkflowOption } from "./api";

const blankOption: WorkflowOption = {
  group: "WORK_ORDER_STATUS",
  code: "",
  label: "",
  sortOrder: 0,
  isTerminal: false,
  isActive: true,
  description: "",
  uiTone: "neutral",
  backgroundColor: "",
  textColor: "",
};

export function WorkflowOptionsMaster() {
  const queryClient = useQueryClient();
  const [group, setGroup] = useState("ALL");
  const [draft, setDraft] = useState<WorkflowOption | null>(null);
  const query = useQuery({ queryKey: ["workflow-options"], queryFn: ({ signal }) => listWorkflowOptions(signal) });
  const groups = useMemo(() => Object.keys(query.data?.groups || {}).sort(), [query.data]);
  const items = useMemo(() => groups.flatMap((key) => query.data?.groups[key] || []).filter((item) => group === "ALL" || item.group === group), [group, groups, query.data]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const exists = items.some((item) => item.group === draft.group && item.code === draft.code);
      return exists ? updateWorkflowOption(draft.group, draft.code, draft) : createWorkflowOption(draft);
    },
    onSuccess: async () => { setDraft(null); await queryClient.invalidateQueries({ queryKey: ["workflow-options"] }); },
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <div className="workflow-master">
    <div className="toolbar master-toolbar">
      <select value={group} onChange={(event) => setGroup(event.target.value)}><option value="ALL">全部流程群組</option>{groups.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <span />
      <button className="primary-button" type="button" onClick={() => setDraft({ ...blankOption, group: group === "ALL" ? blankOption.group : group })}><Plus size={15} />新增選項</button>
    </div>
    {!items.length ? <EmptyState title="目前沒有流程選項" description="可新增狀態、處理路線或驗收結果。" /> : <div className="table-frame"><table><thead><tr><th>群組</th><th>代碼</th><th>顯示文字</th><th>語意色</th><th>排序</th><th>結案</th><th>狀態</th><th>操作</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.group}-${item.code}`}><td>{item.group}</td><td>{item.code}</td><td>{item.label}<small>{item.description}</small></td><td><StatusBadge tone={item.uiTone}>{item.uiTone}</StatusBadge></td><td>{item.sortOrder}</td><td>{item.isTerminal ? "是" : "否"}</td><td>{item.isActive ? "啟用" : "停用"}</td><td><button className="table-action" type="button" onClick={() => setDraft(item)}>編輯</button></td></tr>)}</tbody></table></div>}
    {draft ? <aside className="edit-drawer"><header><div><small>流程與狀態顯示</small><h2>{draft.code ? "編輯選項" : "新增選項"}</h2></div><button className="icon-button" type="button" onClick={() => setDraft(null)}>×</button></header><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <label><span>群組 *</span><input required disabled={items.some((item) => item.group === draft.group && item.code === draft.code)} value={draft.group} onChange={(event) => setDraft({ ...draft, group: event.target.value.toUpperCase() })} /></label>
      <label><span>代碼 *</span><input required disabled={items.some((item) => item.group === draft.group && item.code === draft.code)} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} /></label>
      <label><span>顯示文字 *</span><input required value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
      <label><span>語意色</span><select value={draft.uiTone} onChange={(event) => setDraft({ ...draft, uiTone: event.target.value as WorkflowOption["uiTone"] })}><option value="neutral">中性</option><option value="info">資訊</option><option value="success">完成</option><option value="warning">提醒</option><option value="danger">異常</option></select></label>
      <label><span>排序</span><input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} /></label>
      <label><span>說明</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label className="toggle-field"><input type="checkbox" checked={draft.isTerminal} onChange={(event) => setDraft({ ...draft, isTerminal: event.target.checked })} /><span>此狀態代表結案</span></label>
      <label className="toggle-field"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /><span>啟用</span></label>
      <button className="primary-button" type="submit" disabled={mutation.isPending}><Save size={15} />儲存</button>
    </form></aside> : null}
  </div>;
}
