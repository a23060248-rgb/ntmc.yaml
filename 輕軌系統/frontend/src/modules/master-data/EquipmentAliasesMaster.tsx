import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../shared/components/AsyncState";
import { listEquipmentAliases, saveEquipmentAlias, setEquipmentAliasActive } from "./api";

export function EquipmentAliasesMaster() {
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState<{ sourceSystem: string; aliasName: string; targetKind: "GROUP" | "MATERIAL"; targetCode: string } | null>(null);
  const limit = 50;
  const query = useQuery({ queryKey: ["equipment-aliases", search, offset], queryFn: ({ signal }) => listEquipmentAliases({ search, offset, limit }, signal) });
  const saveMutation = useMutation({ mutationFn: () => saveEquipmentAlias(draft!), onSuccess: async () => { setDraft(null); await queryClient.invalidateQueries({ queryKey: ["equipment-aliases"] }); } });
  const activeMutation = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setEquipmentAliasActive(id, active), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["equipment-aliases"] }) });
  return <div>
    <form className="toolbar master-toolbar" onSubmit={(event) => { event.preventDefault(); setOffset(0); setSearch(searchDraft.trim()); }}><label className="search-field"><Search size={16} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜尋外部名稱或標準設備" /></label><button className="secondary-button">查詢</button><button className="primary-button" type="button" onClick={() => setDraft({ sourceSystem: "FAULT_C", aliasName: "", targetKind: "GROUP", targetCode: "" })}><Plus size={15} />新增別名</button></form>
    {query.isPending ? <LoadingState /> : null}
    {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
    {query.data && !query.data.items.length ? <EmptyState title="目前沒有設備別名" description="新增外部系統名稱與正式設備的對應。" /> : null}
    {query.data?.items.length ? <div className="table-frame"><table><thead><tr><th>來源</th><th>外部名稱</th><th>對應層級</th><th>正式代碼</th><th>正式名稱</th><th>狀態</th><th>操作</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id}><td>{item.sourceSystem}</td><td>{item.aliasName}</td><td>{item.targetKind === "GROUP" ? "設備群組" : "物料"}</td><td>{item.targetCode}</td><td>{item.canonicalName}</td><td>{item.isActive ? "啟用" : "停用"}</td><td><button className="table-action" type="button" onClick={() => activeMutation.mutate({ id: item.id, active: !item.isActive })}>{item.isActive ? "停用" : "啟用"}</button></td></tr>)}</tbody></table></div> : null}
    {query.data ? <div className="pagination-row"><button className="secondary-button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - limit))}>上一頁</button><span>{query.data.total} 筆</span><button className="secondary-button" disabled={offset + limit >= query.data.total} onClick={() => setOffset(offset + limit)}>下一頁</button></div> : null}
    {draft ? <aside className="edit-drawer"><header><div><small>名稱正規化</small><h2>新增設備別名</h2></div><button className="icon-button" type="button" onClick={() => setDraft(null)}>×</button></header><form onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }}><label><span>來源系統</span><input value={draft.sourceSystem} onChange={(event) => setDraft({ ...draft, sourceSystem: event.target.value })} /></label><label><span>外部設備名稱 *</span><input required value={draft.aliasName} onChange={(event) => setDraft({ ...draft, aliasName: event.target.value })} /></label><label><span>對應層級</span><select value={draft.targetKind} onChange={(event) => setDraft({ ...draft, targetKind: event.target.value as "GROUP" | "MATERIAL" })}><option value="GROUP">設備群組</option><option value="MATERIAL">物料料號</option></select></label><label><span>{draft.targetKind === "GROUP" ? "設備群組代碼" : "料號"} *</span><input required value={draft.targetCode} onChange={(event) => setDraft({ ...draft, targetCode: event.target.value })} /></label><button className="primary-button" disabled={saveMutation.isPending}>儲存對應</button></form></aside> : null}
  </div>;
}
