import { expect, test } from "vitest";
import { fillMonths, monthLabel } from "@/lib/reports";

test("monthLabel", () => {
  expect(monthLabel("2026-04")).toBe("Apr 2026");
});

test("fillMonths fills gaps across a year boundary", () => {
  const rows = fillMonths([
    { month: "2025-11", count: 1, amount: 10 },
    { month: "2026-02", count: 2, amount: 20 },
  ]);
  expect(rows.map((r) => r.month)).toEqual([
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  expect(rows[1]).toEqual({ month: "2025-12", count: 0, amount: 0 });
  expect(fillMonths([])).toEqual([]);
});
