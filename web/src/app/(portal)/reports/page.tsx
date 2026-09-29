import { BarChart } from "@/components/BarChart";
import { getReportSummary } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { fillMonths, monthLabel, toBars } from "@/lib/reports";
import type { ReportSummary } from "@/lib/types";

export const metadata = { title: "Reports" };

const money = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function ReportsPage() {
  let summary: ReportSummary;
  try {
    summary = await getReportSummary();
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) {
      return (
        <>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="mt-4 rounded border bg-white p-4 text-slate-600">
            Reporting is not configured: the Fabric semantic model is not set up
            for this environment.
          </p>
        </>
      );
    }
    throw e;
  }
  const { totals, topParts } = summary;
  const months = fillMonths(summary.claimsByMonth);
  const bars = toBars(
    months.map((m) => ({ label: monthLabel(m.month), value: m.count })),
  );
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
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-slate-500">
        {summary.dealerId === null
          ? "All dealers"
          : `Dealer ${summary.dealerId}`}{" "}
        · Fabric semantic model, refreshed daily
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded border bg-white p-4">
            <div className="text-sm text-slate-500">{t.label}</div>
            <div
              className="text-3xl font-semibold"
              data-testid={`report-tile-${t.label}`}
            >
              {t.value}
            </div>
          </div>
        ))}
      </div>
      <h2 className="mt-8 text-lg font-semibold">Claims by month</h2>
      <div className="mt-2 rounded border bg-white p-4">
        {bars.length === 0 ? (
          <p className="text-sm text-slate-500">No claims yet.</p>
        ) : (
          <>
            <BarChart bars={bars} />
            <p className="mt-2 text-xs text-slate-500">
              Amount:{" "}
              {months
                .map((m) => `${monthLabel(m.month)} ${money(m.amount)}`)
                .join(" · ")}
            </p>
          </>
        )}
      </div>
      <h2 className="mt-8 text-lg font-semibold">Top parts</h2>
      <table className="mt-2 w-full border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="p-2">SKU</th>
            <th className="p-2">Name</th>
            <th className="p-2 text-right">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {topParts.map((p) => (
            <tr key={p.sku} className="border-b">
              <td className="p-2 font-mono">{p.sku}</td>
              <td className="p-2">{p.name}</td>
              <td className="p-2 text-right">{p.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
