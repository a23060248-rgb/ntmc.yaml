import { createHash } from "node:crypto";

const allowedKinds = new Set(["phase", "remediation", "review"]);
const allowedStates = new Set(["AUTHORIZED", "STARTED", "COMPLETED", "ARCHIVED"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

export function validateLifecycleEvents(events) {
  const violations = [];
  const ids = new Set();
  const perTask = new Map();
  for (const event of events ?? []) {
    if (!event?.event_id || ids.has(event.event_id)) violations.push(`LIFECYCLE duplicate or missing event_id ${event?.event_id ?? "<missing>"}.`);
    ids.add(event?.event_id);
    if (!/^[A-Z][A-Z0-9-]{2,63}$/.test(event?.task_id ?? "")) violations.push(`LIFECYCLE invalid task_id ${event?.task_id ?? "<missing>"}.`);
    if (!allowedKinds.has(event?.task_kind)) violations.push(`LIFECYCLE invalid task_kind for ${event?.task_id}.`);
    if (!allowedStates.has(event?.state)) violations.push(`LIFECYCLE invalid state for ${event?.task_id}.`);
    if (!Number.isFinite(Date.parse(event?.at))) violations.push(`LIFECYCLE invalid time for ${event?.task_id}.`);
    if (!event?.source_ref || !/^[A-F0-9]{64}$/.test(event?.source_sha256 ?? "")) violations.push(`LIFECYCLE ${event?.task_id} lacks source reference/hash.`);
    const list = perTask.get(event?.task_id) ?? [];
    list.push(event);
    perTask.set(event?.task_id, list);
  }
  const rank = { AUTHORIZED: 0, STARTED: 1, COMPLETED: 2, ARCHIVED: 3 };
  for (const [taskId, list] of perTask) {
    const sorted = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (let index = 1; index < sorted.length; index += 1) if (rank[sorted[index].state] < rank[sorted[index - 1].state]) violations.push(`LIFECYCLE state regression for ${taskId}.`);
  }
  return violations;
}

export function projectLifecycleState({ event_log, generated_at }) {
  const events = event_log?.events ?? [];
  const violations = validateLifecycleEvents(events);
  if (violations.length) return { projection: null, violations };
  const ordered = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.event_id.localeCompare(b.event_id));
  const latestByTask = new Map();
  for (const event of ordered) latestByTask.set(event.task_id, event);
  const latest = [...latestByTask.values()];
  const completedRemediations = latest.filter((event) => event.task_kind === "remediation" && ["COMPLETED", "ARCHIVED"].includes(event.state)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const completedReviews = latest.filter((event) => event.task_kind === "review" && ["COMPLETED", "ARCHIVED"].includes(event.state)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const active = latest.filter((event) => ["AUTHORIZED", "STARTED"].includes(event.state)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const sources = Object.fromEntries(ordered.map((event) => [event.source_ref, event.source_sha256]));
  const projection = {
    schema_version: 4,
    projection_type: "deterministic-informational-phase-lifecycle",
    authority: "informational",
    generated: true,
    may_be_stale: true,
    used_as_gate_input: false,
    used_as_scope_input: false,
    used_as_approval_input: false,
    generated_at,
    lifecycle_event_log_sha256: sha256(JSON.stringify(event_log)),
    lifecycle_source_artifacts: Object.keys(sources).sort(),
    lifecycle_source_hashes: Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))),
    current_phase: event_log.phase_id,
    product_root: "${PRODUCT_ROOT}",
    git_container_root: "${GIT_ROOT}",
    product_writes_allowed: false,
    database_operations_allowed: false,
    last_completed_remediation: completedRemediations[0]?.task_id ?? null,
    last_completed_review: completedReviews[0]?.task_id ?? null,
    last_review_outcome: completedReviews[0]?.outcome ?? null,
    active_task: active[0]?.task_id ?? null,
    active_task_state: active[0]?.state ?? null,
    session_b_authorized: false,
    session_b_started: false,
    bootstrap_candidate_review_gate: "NO-GO",
    bootstrap_human_commit_gate: "NO-GO",
    steady_state_governance_preparation_gate: "DISABLED",
    steady_state_governance_execution_gate: "DISABLED",
    migration_320_execution_gate: "NO-GO"
  };
  return { projection, violations: [] };
}
