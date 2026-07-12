import { describe, expect, it } from "vitest";
import { isWorkOrderNo, parseWorkOrderNo } from "./workOrder";

describe("work order number utilities", () => {
  it("accepts the formal work-order format", () => {
    expect(isWorkOrderNo("P-1150519-D-TS-001")).toBe(true);
    expect(isWorkOrderNo("P-11505-V-109-1Y")).toBe(false);
  });

  it("parses type, site, target, and sequence", () => {
    expect(parseWorkOrderNo("C-1150514-D-TS-031")).toEqual({
      type: "C",
      rocDate: "1150514",
      site: "D",
      target: "TS",
      sequence: "031",
    });
  });
});
