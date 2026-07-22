const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTIONS,
  C_STATUS,
  assertActionAllowed,
  assertExpectedVersion,
  availableActions,
  resolveTargetStatus,
} = require("../src/services/cWorkOrderWorkflow");

test("normal C workflow follows report, accept, dispatch, finish, review, and close", () => {
  assert.equal(resolveTargetStatus({ action: ACTIONS.ACCEPT }), C_STATUS.ACCEPTED);
  assert.equal(resolveTargetStatus({ action: ACTIONS.DISPATCH }), C_STATUS.DISPATCHED);
  assert.equal(resolveTargetStatus({ action: ACTIONS.FINISH }), C_STATUS.FINISHED);
  assert.equal(resolveTargetStatus({ action: ACTIONS.REVIEW }), C_STATUS.REVIEWED);
  assert.equal(resolveTargetStatus({ action: ACTIONS.CLOSE }), C_STATUS.CLOSED);
});

test("technician can finish dispatched work but cannot review or close it", () => {
  assert.doesNotThrow(() => assertActionAllowed({
    action: ACTIONS.FINISH,
    status: C_STATUS.DISPATCHED,
    role: "technician",
  }));
  assert.throws(() => assertActionAllowed({
    action: ACTIONS.REVIEW,
    status: C_STATUS.FINISHED,
    role: "technician",
  }), (error) => error.status === 403);
  assert.deepEqual(availableActions(C_STATUS.FINISHED, "technician"), []);
});

test("viewer and scheduler receive no C mutation actions", () => {
  assert.deepEqual(availableActions(C_STATUS.REPORTED, "viewer"), []);
  assert.deepEqual(availableActions(C_STATUS.REPORTED, "scheduler"), []);
});

test("shortage and normal observation restore the recorded previous state", () => {
  assert.equal(resolveTargetStatus({
    action: ACTIONS.RESUME,
    previousStatus: C_STATUS.DISPATCHED,
  }), C_STATUS.DISPATCHED);
  assert.equal(resolveTargetStatus({
    action: ACTIONS.OBSERVATION_RESULT,
    observationResult: "NORMAL",
    previousStatus: C_STATUS.ACCEPTED,
  }), C_STATUS.ACCEPTED);
});

test("abnormal observation is redispatched while extension remains observed", () => {
  assert.equal(resolveTargetStatus({
    action: ACTIONS.OBSERVATION_RESULT,
    observationResult: "STILL_ABNORMAL",
    previousStatus: C_STATUS.ACCEPTED,
  }), C_STATUS.DISPATCHED);
  assert.equal(resolveTargetStatus({
    action: ACTIONS.OBSERVATION_RESULT,
    observationResult: "EXTENDED",
    previousStatus: C_STATUS.DISPATCHED,
  }), C_STATUS.OBSERVATION);
});

test("terminal statuses expose no further actions", () => {
  for (const status of [C_STATUS.CLOSED, C_STATUS.MERGED, C_STATUS.VOIDED]) {
    assert.deepEqual(availableActions(status, "system_admin"), []);
  }
});

test("optimistic version check rejects stale and malformed requests", () => {
  assert.equal(assertExpectedVersion(4, 4), 4);
  assert.throws(() => assertExpectedVersion(5, 4), (error) => (
    error.status === 409 && error.code === "WORK_ORDER_VERSION_CONFLICT"
  ));
  assert.throws(() => assertExpectedVersion(1, undefined), (error) => error.status === 400);
});
