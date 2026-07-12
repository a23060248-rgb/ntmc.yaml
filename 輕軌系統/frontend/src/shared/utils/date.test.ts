import { describe, expect, it } from "vitest";
import { differenceInCalendarDaysSafe, formatRocDate, toRocYear } from "./date";

describe("date utilities", () => {
  it("converts western years to ROC years", () => {
    expect(toRocYear(2026)).toBe(115);
  });

  it("formats a valid ROC date", () => {
    expect(formatRocDate("2026-07-10")).toBe("115.07.10");
  });

  it("calculates calendar-day differences", () => {
    expect(differenceInCalendarDaysSafe("2026-08-05", "2026-07-06")).toBe(30);
  });
});
