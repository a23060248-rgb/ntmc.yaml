import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorState } from "../../shared/components/AsyncState";
import { performFaultWorkOrderAction, type UnifiedWorkOrder, type WorkOrderActionOptions } from "./api";

interface RemovalDraft {
  removedSerial: string;
  installedSerial: string;
}

interface Props {
  order: UnifiedWorkOrder;
  options?: WorkOrderActionOptions;
  onCompleted(result: { repairOrders: Array<{ workOrderNo: string; existing: boolean }> }): Promise<void> | void;
}

const reasonActions = new Set(["reject-review", "transfer", "merge", "void", "shortage", "resume", "observe", "observation-result"]);

export function CWorkOrderActions({ order, options, onCompleted }: Props) {
  const actions = order.availableActions || [];
  const [selectedAction, setSelectedAction] = useState("");
  const [draft, setDraft] = useState<Record<string, string | number | boolean>>({ resultCode: "NORMAL", isBlocking: true });
  const [removals, setRemovals] = useState<RemovalDraft[]>([]);
  const [success, setSuccess] = useState("");
  const action = useMemo(() => actions.find((item) => item.code === selectedAction), [actions, selectedAction]);

  const mutation = useMutation({
    mutationFn: () => performFaultWorkOrderAction(order.workOrderNo, selectedAction, {
      ...draft,
      expectedVersion: order.version,
      removals: selectedAction === "finish" ? removals.filter((item) => item.removedSerial.trim()) : undefined,
    }),
    onSuccess: async (result) => {
      const repairText = result.repairOrders.length
        ? `，建立 ${result.repairOrders.map((item) => item.workOrderNo).join("、")}`
        : "";
      setSuccess(`「${action?.label || selectedAction}」已完成${repairText}`);
      setSelectedAction("");
      setDraft({ resultCode: "NORMAL", isBlocking: true });
      setRemovals([]);
      await onCompleted(result);
    },
  });

  function choose(code: string) {
    setSelectedAction(code);
    setDraft({ resultCode: "NORMAL", isBlocking: true });
    setRemovals([]);
    setSuccess("");
    mutation.reset();
  }

  function update(key: string, value: string | number | boolean) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateRemoval(index: number, key: keyof RemovalDraft, value: string) {
    setRemovals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  if (!actions.length) {
    return <section className="c-workflow-actions"><h3>可執行動作</h3><p className="muted-text">目前狀態或角色沒有可執行的正式動作。</p></section>;
  }

  return (
    <section className="c-workflow-actions">
      <header><div><h3>可執行動作</h3><p>系統只顯示目前狀態與角色允許的操作。</p></div><span>版本 {order.version}</span></header>
      <div className="c-action-buttons">
        {actions.map((item) => <button key={item.code} className={item.code === selectedAction ? "primary-button" : "secondary-button"} type="button" onClick={() => choose(item.code)}>{item.label}</button>)}
      </div>
      {success ? <p className="success-note">{success}</p> : null}
      {action ? (
        <form className="c-action-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <header><strong>{action.label}</strong><button className="icon-button" type="button" aria-label="關閉操作表單" onClick={() => setSelectedAction("")}><X size={16} /></button></header>
          {selectedAction === "dispatch" ? <UserSelect label="派工人員 *" value={String(draft.toUserId || "")} users={options?.users || []} onChange={(value) => update("toUserId", value)} required /> : null}
          {selectedAction === "finish" ? <FinishFields draft={draft} update={update} removals={removals} setRemovals={setRemovals} updateRemoval={updateRemoval} /> : null}
          {selectedAction === "transfer" ? <TransferFields draft={draft} update={update} options={options} /> : null}
          {selectedAction === "merge" ? <MergeField currentNo={order.workOrderNo} value={String(draft.targetWorkOrderNo || "")} options={options} onChange={(value) => update("targetWorkOrderNo", value)} /> : null}
          {selectedAction === "shortage" ? <ShortageFields draft={draft} update={update} users={options?.users || []} /> : null}
          {selectedAction === "observe" ? <ObservationFields draft={draft} update={update} users={options?.users || []} /> : null}
          {selectedAction === "observation-result" ? <ObservationResultFields draft={draft} update={update} /> : null}
          {reasonActions.has(selectedAction) ? <label><span>原因 / 說明 *</span><textarea rows={3} required value={String(draft.reason || "")} onChange={(event) => update("reason", event.target.value)} /></label> : null}
          {mutation.isError ? <ErrorState title="工單操作失敗" error={mutation.error} /> : null}
          <button className="primary-button" type="submit" disabled={mutation.isPending}><CheckCircle2 size={16} />確認{action.label}</button>
        </form>
      ) : null}
    </section>
  );
}

function UserSelect({ label, value, users, onChange, required = false }: { label: string; value: string; users: WorkOrderActionOptions["users"]; onChange(value: string): void; required?: boolean }) {
  return <label><span>{label}</span><select required={required} value={value} onChange={(event) => onChange(event.target.value)}><option value="">請選擇</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}{user.department ? ` · ${user.department}` : ""}</option>)}</select></label>;
}

function FinishFields({ draft, update, removals, setRemovals, updateRemoval }: {
  draft: Record<string, string | number | boolean>;
  update(key: string, value: string | number | boolean): void;
  removals: RemovalDraft[];
  setRemovals(value: RemovalDraft[] | ((current: RemovalDraft[]) => RemovalDraft[])): void;
  updateRemoval(index: number, key: keyof RemovalDraft, value: string): void;
}) {
  return <><label><span>完工報告 *</span><textarea rows={4} required value={String(draft.report || "")} onChange={(event) => update("report", event.target.value)} /></label><div className="removal-editor"><header><div><strong>拆件與 R 工單</strong><small>一張 C 工單可依不同拆件事件建立多張 R 工單。</small></div><button className="secondary-button" type="button" onClick={() => setRemovals((current) => [...current, { removedSerial: "", installedSerial: "" }])}><Plus size={15} />新增拆件</button></header>{removals.map((item, index) => <div className="removal-row" key={`${index}-${item.removedSerial}`}><label><span>拆下件序號 *</span><input required value={item.removedSerial} onChange={(event) => updateRemoval(index, "removedSerial", event.target.value)} /></label><label><span>裝上件序號</span><input value={item.installedSerial} onChange={(event) => updateRemoval(index, "installedSerial", event.target.value)} /></label><button className="icon-button" type="button" aria-label="移除拆件" onClick={() => setRemovals((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button></div>)}</div></>;
}

function TransferFields({ draft, update, options }: { draft: Record<string, string | number | boolean>; update(key: string, value: string | number | boolean): void; options?: WorkOrderActionOptions }) {
  return <div className="c-action-grid"><label><span>轉入系統</span><select value={String(draft.toSystem || "")} onChange={(event) => update("toSystem", event.target.value)}><option value="">不變更</option>{options?.systems.map((system) => <option key={system}>{system}</option>)}</select></label><label><span>轉入單位</span><input value={String(draft.toUnit || "")} onChange={(event) => update("toUnit", event.target.value)} /></label><UserSelect label="轉入人員" value={String(draft.toUserId || "")} users={options?.users || []} onChange={(value) => update("toUserId", value)} /><label><span>轉入班別</span><input value={String(draft.toShift || "")} onChange={(event) => update("toShift", event.target.value)} /></label></div>;
}

function MergeField({ currentNo, value, options, onChange }: { currentNo: string; value: string; options?: WorkOrderActionOptions; onChange(value: string): void }) {
  return <label><span>併入主 C 工單 *</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">請選擇</option>{options?.mergeCandidates.filter((item) => item.workOrderNo !== currentNo).map((item) => <option key={item.workOrderNo} value={item.workOrderNo}>{item.workOrderNo} · {item.statusLabel} · {item.trainNo || "無車號"}</option>)}</select></label>;
}

function ShortageFields({ draft, update, users }: { draft: Record<string, string | number | boolean>; update(key: string, value: string | number | boolean): void; users: WorkOrderActionOptions["users"] }) {
  return <div className="c-action-grid"><label><span>料號 / 暫用品名</span><input value={String(draft.itemCode || "")} onChange={(event) => update("itemCode", event.target.value)} /></label><label><span>品名 *</span><input required value={String(draft.itemName || "")} onChange={(event) => update("itemName", event.target.value)} /></label><label><span>需求數量 *</span><input type="number" min="0.001" step="0.001" required value={String(draft.requiredQty || "")} onChange={(event) => update("requiredQty", event.target.value)} /></label><label><span>單位</span><input value={String(draft.unit || "")} onChange={(event) => update("unit", event.target.value)} /></label><label><span>預計到料日</span><input type="date" value={String(draft.expectedArrivalDate || "")} onChange={(event) => update("expectedArrivalDate", event.target.value)} /></label><label><span>採購 / 調撥狀態</span><input value={String(draft.supplyStatus || "待處理")} onChange={(event) => update("supplyStatus", event.target.value)} /></label><UserSelect label="負責人" value={String(draft.responsibleUserId || "")} users={users} onChange={(value) => update("responsibleUserId", value)} /><label className="toggle-field"><input type="checkbox" checked={draft.isBlocking !== false} onChange={(event) => update("isBlocking", event.target.checked)} /><span>完全阻斷工單</span></label></div>;
}

function ObservationFields({ draft, update, users }: { draft: Record<string, string | number | boolean>; update(key: string, value: string | number | boolean): void; users: WorkOrderActionOptions["users"] }) {
  return <div className="c-action-grid"><label className="is-wide"><span>觀察條件 *</span><textarea rows={3} required value={String(draft.observationCondition || "")} onChange={(event) => update("observationCondition", event.target.value)} /></label><label><span>到期時間 *</span><input type="datetime-local" required value={String(draft.dueAt || "")} onChange={(event) => update("dueAt", event.target.value)} /></label><UserSelect label="負責人" value={String(draft.responsibleUserId || "")} users={users} onChange={(value) => update("responsibleUserId", value)} /></div>;
}

function ObservationResultFields({ draft, update }: { draft: Record<string, string | number | boolean>; update(key: string, value: string | number | boolean): void }) {
  const resultCode = String(draft.resultCode || "NORMAL");
  return <><label><span>觀察結果 *</span><select required value={resultCode} onChange={(event) => update("resultCode", event.target.value)}><option value="NORMAL">正常，恢復原狀態</option><option value="STILL_ABNORMAL">仍有異常，重新派工</option><option value="REDISPATCH">直接重新派工</option><option value="EXTENDED">延長觀察</option></select></label>{resultCode === "EXTENDED" ? <label><span>新的到期時間 *</span><input type="datetime-local" required value={String(draft.dueAt || "")} onChange={(event) => update("dueAt", event.target.value)} /></label> : null}</>;
}
