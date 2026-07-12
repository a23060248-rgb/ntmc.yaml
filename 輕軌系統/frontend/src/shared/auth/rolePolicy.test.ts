import { describe, expect, it } from "vitest";
import { rolePolicies } from "./rolePolicy";

describe("role policies", () => {
  it("keeps viewer access read-only", () => {
    expect(rolePolicies.read).toContain("viewer");
    expect(rolePolicies.scheduleWrite).not.toContain("viewer");
    expect(rolePolicies.backfillWrite).not.toContain("viewer");
    expect(rolePolicies.inventoryPost).not.toContain("viewer");
  });

  it("separates scheduler, technician and warehouse duties", () => {
    expect(rolePolicies.scheduleWrite).toContain("scheduler");
    expect(rolePolicies.scheduleWrite).not.toContain("technician");
    expect(rolePolicies.backfillWrite).toContain("technician");
    expect(rolePolicies.inventoryPost).toContain("warehouse_staff");
  });
});
