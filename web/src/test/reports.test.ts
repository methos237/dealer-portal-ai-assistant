import { describe, expect, test } from "vitest";
import { fillMonths, monthLabel, toBars } from "@/lib/reports";

describe("toBars", () => {
  test("scales to the largest value", () => {
    expect(
      toBars([
        { label: "a", value: 2 },
        { label: "b", value: 4 },
      ]),
    ).toEqual([
      { label: "a", value: 2, height: 50 },
      { label: "b", value: 4, height: 100 },
    ]);
  });

  test("all-zero rows get zero height", () => {
    expect(toBars([{ label: "a", value: 0 }])[0].height).toBe(0);
  });
});

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
