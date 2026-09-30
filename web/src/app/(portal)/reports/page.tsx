import { BarChart } from "@/components/BarChart";
import { getReportSummary } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { fillMonths, monthLabel } from "@/lib/reports";
import type { ReportSummary } from "@/lib/types";

export const metadata = { title: "Reports" };

import { money } from "@/lib/format";

export default async function ReportsPage() {
  let summary: ReportSummary;
  try {
    summary = await getReportSummary();
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) {
      return (
        <>
          <h1 className="page-title">Reports</h1>
          <div className="card mt-6 max-w-xl p-6">
            <h2 className="text-lg">Reporting is not set up here</h2>
            <p className="mt-2 text-fg-muted">
              This environment has no Fabric semantic model. Claims and orders
              still work; only the figures on this page are missing.
            </p>
          </div>
        </>
      );
    }
    throw e;
  }
  const { totals, topParts } = summary;
  const months = fillMonths(summary.claimsByMonth);
  const bars = months.map((m) => ({
    label: monthLabel(m.month),
    value: m.count,
  }));
  const tiles = [
    { label: "Claims", value: String(totals.claimCount) },
    { label: "Claim amount", value: money(totals.claimAmount) },
    {
      label: "Avg days to close",
      value:
        totals.avgDaysToClose === null ? "–" : totals.avgDaysToClose.toFixed(1),
    },
    { label: "Open parts orders", value: String(totals.openPartsOrders) },
  ];
  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="mt-1 text-fg-muted">
        {summary.dealerId === null
          ? "All dealers"
          : `Dealer ${summary.dealerId}`}
        . Figures come from the Fabric semantic model and refresh daily.
      </p>

      <dl className="card mt-6 grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className={`p-5 ${i % 2 === 1 ? "border-l border-border md:border-l-0" : ""} ${i > 1 ? "border-t border-border md:border-t-0" : ""}`}
          >
            <dt className="text-sm text-fg-muted">{t.label}</dt>
            <dd
              className="mt-1 font-heading text-3xl font-semibold tabular-nums"
              data-testid={`report-tile-${t.label}`}
            >
              {t.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section>
          <h2 className="text-xl">Claims by month</h2>
          <div className="card mt-3 p-5">
            {bars.length === 0 ? (
              <p className="text-sm text-fg-muted">No claims yet.</p>
            ) : (
              <BarChart
                bars={bars}
                detail={months.map((m) => money(m.amount))}
              />
            )}
          </div>
        </section>
        <section>
          <h2 className="text-xl">Top parts</h2>
          <div className="card mt-3 overflow-x-auto">
            {topParts.length === 0 ? (
              <p className="p-6 text-sm text-fg-muted">No parts ordered yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th className="num">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {topParts.map((p) => (
                    <tr key={p.sku}>
                      <td className="font-mono text-[13px]">{p.sku}</td>
                      <td>{p.name}</td>
                      <td className="num">{p.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
