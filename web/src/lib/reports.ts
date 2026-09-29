/** Pure data shaping for the Reports page. Unit tested; no Next.js imports. */
import type { ReportSummary } from "./types";

export type Bar = { label: string; value: number; height: number };

/** Scales values to bar heights; all-zero input gives zero-height bars. */
export function toBars(
  rows: { label: string; value: number }[],
  maxHeight = 100,
): Bar[] {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return rows.map((r) => ({
    ...r,
    height: max === 0 ? 0 : Math.round((r.value / max) * maxHeight),
  }));
}

/** "2026-04" -> "Apr 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Fills missing months between the first and last row with zero rows. */
export function fillMonths(
  rows: ReportSummary["claimsByMonth"],
): ReportSummary["claimsByMonth"] {
  if (rows.length === 0) return [];
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const [y0, m0] = rows[0].month.split("-").map(Number);
  const last = rows[rows.length - 1].month;
  const out: ReportSummary["claimsByMonth"] = [];
  for (
    let d = new Date(Date.UTC(y0, m0 - 1, 1));
    ;
    d.setUTCMonth(d.getUTCMonth() + 1)
  ) {
    const key = d.toISOString().slice(0, 7);
    out.push(byMonth.get(key) ?? { month: key, count: 0, amount: 0 });
    if (key === last) return out;
  }
}
