const test = require("node:test");
const assert = require("node:assert/strict");
const { ROLES, ALL_ROLES, ROLE_POLICIES, roleAllowed } = require("../src/config/rolePolicy");

test("role policy defines the six accepted system roles", () => {
  assert.deepEqual(ALL_ROLES, [
    "system_admin",
    "maintenance_supervisor",
    "scheduler",
    "technician",
    "warehouse_staff",
    "viewer",
  ]);
});

test("viewer can read but cannot execute any mutation policy", () => {
  assert.equal(roleAllowed(ROLES.VIEWER, ROLE_POLICIES.READ), true);
  for (const [name, roles] of Object.entries(ROLE_POLICIES)) {
    if (name === "READ") continue;
    assert.equal(roleAllowed(ROLES.VIEWER, roles), false, `viewer unexpectedly has ${name}`);
  }
});

test("specialized mutation policies remain separated", () => {
  assert.equal(roleAllowed(ROLES.SCHEDULER, ROLE_POLICIES.SCHEDULE_WRITE), true);
  assert.equal(roleAllowed(ROLES.SCHEDULER, ROLE_POLICIES.INVENTORY_POST), false);
  assert.equal(roleAllowed(ROLES.TECHNICIAN, ROLE_POLICIES.BACKFILL_WRITE), true);
  assert.equal(roleAllowed(ROLES.TECHNICIAN, ROLE_POLICIES.SCHEDULE_WRITE), false);
  assert.equal(roleAllowed(ROLES.WAREHOUSE_STAFF, ROLE_POLICIES.INVENTORY_POST), true);
  assert.equal(roleAllowed(ROLES.WAREHOUSE_STAFF, ROLE_POLICIES.WORK_ORDER_WRITE), false);
});
