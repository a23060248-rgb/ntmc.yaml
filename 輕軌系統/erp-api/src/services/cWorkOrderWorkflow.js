const { httpError } = require("../middleware/errorHandler");
const { ROLES } = require("../config/rolePolicy");

const C_STATUS = Object.freeze({
  REPORTED: "0",
  ACCEPTED: "1",
  DISPATCHED: "2",
  FINISHED: "3",
  REVIEWED: "4",
  CLOSED: "5",
  MERGED: "6",
  TRANSFERRED: "7",
  SHORTAGE: "9",
  VOIDED: "8",
  OBSERVATION: "10",
});

const C_STATUS_LABELS = Object.freeze({
  [C_STATUS.REPORTED]: "報修",
  [C_STATUS.ACCEPTED]: "接單",
  [C_STATUS.DISPATCHED]: "派工",
  [C_STATUS.FINISHED]: "完工",
  [C_STATUS.REVIEWED]: "覆核",
  [C_STATUS.CLOSED]: "結案",
  [C_STATUS.MERGED]: "併單",
  [C_STATUS.TRANSFERRED]: "轉單",
  [C_STATUS.VOIDED]: "作廢",
  [C_STATUS.SHORTAGE]: "缺料",
  [C_STATUS.OBSERVATION]: "觀察",
});

const ACTIONS = Object.freeze({
  ACCEPT: "accept",
  DISPATCH: "dispatch",
  FINISH: "finish",
  REVIEW: "review",
  REJECT_REVIEW: "reject-review",
  CLOSE: "close",
  TRANSFER: "transfer",
  MERGE: "merge",
  VOID: "void",
  SHORTAGE: "shortage",
  RESUME: "resume",
  OBSERVE: "observe",
  OBSERVATION_RESULT: "observation-result",
});

const ADMIN = ROLES.SYSTEM_ADMIN;
const SUPERVISOR = ROLES.MAINTENANCE_SUPERVISOR;
const TECHNICIAN = ROLES.TECHNICIAN;
const WAREHOUSE = ROLES.WAREHOUSE_STAFF;

const ACTION_RULES = Object.freeze({
  [ACTIONS.ACCEPT]: {
    label: "接單",
    from: [C_STATUS.REPORTED, C_STATUS.TRANSFERRED],
    roles: [ADMIN, SUPERVISOR, TECHNICIAN],
  },
  [ACTIONS.DISPATCH]: {
    label: "派工",
    from: [C_STATUS.ACCEPTED],
    roles: [ADMIN, SUPERVISOR],
  },
  [ACTIONS.FINISH]: {
    label: "回報完工",
    from: [C_STATUS.DISPATCHED],
    roles: [ADMIN, SUPERVISOR, TECHNICIAN],
  },
  [ACTIONS.REVIEW]: {
    label: "覆核通過",
    from: [C_STATUS.FINISHED],
    roles: [ADMIN, SUPERVISOR],
  },
  [ACTIONS.REJECT_REVIEW]: {
    label: "退回派工",
    from: [C_STATUS.FINISHED, C_STATUS.REVIEWED],
    roles: [ADMIN, SUPERVISOR],
  },
  [ACTIONS.CLOSE]: {
    label: "結案",
    from: [C_STATUS.REVIEWED],
    roles: [ADMIN, SUPERVISOR],
  },
  [ACTIONS.TRANSFER]: {
    label: "轉單",
    from: [C_STATUS.REPORTED, C_STATUS.ACCEPTED, C_STATUS.DISPATCHED, C_STATUS.SHORTAGE, C_STATUS.OBSERVATION],
    roles: [ADMIN, SUPERVISOR],
  },
  [ACTIONS.MERGE]: {
    label: "併單",
    from: [C_STATUS.REPORTED, C_STATUS.ACCEPTED, C_STATUS.DISPATCHED, C_STATUS.TRANSFERRED, C_STATUS.SHORTAGE, C_STATUS.OBSERVATION],
    roles: [ADMIN, SUPERVISOR],
  },
  [ACTIONS.VOID]: {
    label: "作廢",
    from: [C_STATUS.REPORTED, C_STATUS.ACCEPTED, C_STATUS.DISPATCHED, C_STATUS.TRANSFERRED, C_STATUS.SHORTAGE, C_STATUS.OBSERVATION],
    roles: [ADMIN, SUPERVISOR],
  },
  [ACTIONS.SHORTAGE]: {
    label: "登記缺料",
    from: [C_STATUS.ACCEPTED, C_STATUS.DISPATCHED, C_STATUS.TRANSFERRED],
    roles: [ADMIN, SUPERVISOR, TECHNICIAN],
  },
  [ACTIONS.RESUME]: {
    label: "恢復作業",
    from: [C_STATUS.SHORTAGE],
    roles: [ADMIN, SUPERVISOR, TECHNICIAN, WAREHOUSE],
  },
  [ACTIONS.OBSERVE]: {
    label: "進入觀察",
    from: [C_STATUS.ACCEPTED, C_STATUS.DISPATCHED, C_STATUS.TRANSFERRED],
    roles: [ADMIN, SUPERVISOR, TECHNICIAN],
  },
  [ACTIONS.OBSERVATION_RESULT]: {
    label: "填寫觀察結果",
    from: [C_STATUS.OBSERVATION],
    roles: [ADMIN, SUPERVISOR, TECHNICIAN],
  },
});

const DIRECT_TARGETS = Object.freeze({
  [ACTIONS.ACCEPT]: C_STATUS.ACCEPTED,
  [ACTIONS.DISPATCH]: C_STATUS.DISPATCHED,
  [ACTIONS.FINISH]: C_STATUS.FINISHED,
  [ACTIONS.REVIEW]: C_STATUS.REVIEWED,
  [ACTIONS.REJECT_REVIEW]: C_STATUS.DISPATCHED,
  [ACTIONS.CLOSE]: C_STATUS.CLOSED,
  [ACTIONS.TRANSFER]: C_STATUS.TRANSFERRED,
  [ACTIONS.MERGE]: C_STATUS.MERGED,
  [ACTIONS.VOID]: C_STATUS.VOIDED,
  [ACTIONS.SHORTAGE]: C_STATUS.SHORTAGE,
  [ACTIONS.OBSERVE]: C_STATUS.OBSERVATION,
});

function normalizeStatus(value) {
  const status = String(value ?? "");
  if (!(status in C_STATUS_LABELS)) throw httpError(400, `不合法的 C 工單狀態：${status || "空白"}`);
  return status;
}

function actionRule(action) {
  const rule = ACTION_RULES[action];
  if (!rule) throw httpError(404, `不支援的 C 工單操作：${action}`);
  return rule;
}

function assertActionAllowed({ action, status, role }) {
  const current = normalizeStatus(status);
  const rule = actionRule(action);
  if (!rule.roles.includes(role)) throw httpError(403, `角色 ${role || "未登入"} 不可執行「${rule.label}」`);
  if (!rule.from.includes(current)) {
    throw httpError(409, `${C_STATUS_LABELS[current]}狀態不可執行「${rule.label}」`);
  }
  return rule;
}

function resolveTargetStatus({ action, previousStatus, observationResult }) {
  if (action === ACTIONS.RESUME) return normalizeRestorableStatus(previousStatus);
  if (action === ACTIONS.OBSERVATION_RESULT) {
    if (observationResult === "EXTENDED") return C_STATUS.OBSERVATION;
    if (["STILL_ABNORMAL", "REDISPATCH"].includes(observationResult)) return C_STATUS.DISPATCHED;
    if (observationResult === "NORMAL") return normalizeRestorableStatus(previousStatus);
    throw httpError(400, "觀察結果必須為 NORMAL、STILL_ABNORMAL、EXTENDED 或 REDISPATCH");
  }
  const target = DIRECT_TARGETS[action];
  if (!target) throw httpError(400, `無法判斷操作 ${action} 的目標狀態`);
  return target;
}

function normalizeRestorableStatus(value) {
  const status = normalizeStatus(value);
  if (![C_STATUS.ACCEPTED, C_STATUS.DISPATCHED, C_STATUS.TRANSFERRED].includes(status)) {
    throw httpError(409, `不可恢復到${C_STATUS_LABELS[status]}狀態`);
  }
  return status;
}

function availableActions(status, role) {
  const current = normalizeStatus(status);
  return Object.entries(ACTION_RULES)
    .filter(([, rule]) => rule.from.includes(current) && rule.roles.includes(role))
    .map(([code, rule]) => ({ code, label: rule.label }));
}

function assertExpectedVersion(actualVersion, expectedVersion) {
  const expected = Number(expectedVersion);
  if (!Number.isInteger(expected) || expected < 1) throw httpError(400, "expectedVersion 必須是正整數");
  if (Number(actualVersion) !== expected) {
    const error = httpError(409, "工單已由其他人更新，請重新載入後再操作");
    error.code = "WORK_ORDER_VERSION_CONFLICT";
    error.details = { expectedVersion: expected, actualVersion: Number(actualVersion) };
    throw error;
  }
  return expected;
}

function requireReason(value, label = "操作") {
  const reason = String(value || "").trim();
  if (!reason) throw httpError(400, `${label}原因不可為空`);
  return reason;
}

module.exports = {
  ACTIONS,
  ACTION_RULES,
  C_STATUS,
  C_STATUS_LABELS,
  actionRule,
  assertActionAllowed,
  assertExpectedVersion,
  availableActions,
  normalizeRestorableStatus,
  normalizeStatus,
  requireReason,
  resolveTargetStatus,
};
