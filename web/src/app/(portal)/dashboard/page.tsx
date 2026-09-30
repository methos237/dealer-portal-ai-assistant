import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { ClaimStatusTag } from "@/components/StatusTag";
import { getMe, listClaims, listPartsOrders, listUnits } from "@/lib/api";

export const metadata = { title: "Dashboard" };

import { money } from "@/lib/format";

export default async function DashboardPage() {
  const [me, units, claims, orders] = await Promise.all([
    getMe(),
    listUnits(),
    listClaims(),
    listPartsOrders(),
  ]);
  const pending = claims.filter((c) => c.status === "PendingApproval");
  const tiles = [
    {
      label: "Units",
      value: units.length,
      note: `${units.filter((u) => u.inWarranty).length} in warranty`,
      href: "/units",
      cta: "See units",
    },
    {
      label: "Open claims",
      value: claims.filter((c) => c.status === "Open").length,
      note: `${claims.length} filed in total`,
      href: "/claims",
      cta: "See claims",
    },
    {
      label: "Pending approval",
      value: pending.length,
      note: money(pending.reduce((s, c) => s + c.amount, 0)) + " waiting",
      href: "/claims?status=PendingApproval",
      cta: "Review",
    },
    {
      label: "Parts orders",
      value: orders.length,
      note: `${orders.filter((o) => o.status === "Submitted").length} not yet shipped`,
      href: "/parts-orders",
      cta: "See orders",
    },
  ];
  const recent = [...claims]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">
            {me.dealer ? me.dealer.name : "All dealers"}
          </h1>
          <p className="mt-1 text-fg-muted">
            {me.dealer
              ? `Dealer ${me.dealer.code}`
              : "THOR administrator view across every dealer"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/claims/new" className="btn btn-primary">
            New claim
          </Link>
          <Link href="/parts-orders/new" className="btn btn-ghost">
            New parts order
          </Link>
        </div>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link
              href={t.href}
              className="card group flex h-full flex-col p-5 transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg">{t.label}</h2>
                <span
                  className="font-heading text-4xl leading-none font-semibold tabular-nums"
                  data-testid={`tile-${t.label}`}
                >
                  {t.value}
                </span>
              </div>
              <p className="mt-2 text-sm text-fg-muted">{t.note}</p>
              <span className="link-arrow mt-auto pt-5">
                {t.cta}
                <ArrowRight width={16} height={16} />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl">Latest claims</h2>
          <Link href="/claims" className="link-arrow">
            All claims
            <ArrowRight width={16} height={16} />
          </Link>
        </div>
        <div className="card mt-3 overflow-x-auto">
          {recent.length === 0 ? (
            <p className="p-6 text-sm text-fg-muted">
              No claims yet. File the first one from a unit page or with the
              button above.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>VIN</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Filed</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/units/${c.vin}`}
                        className="font-mono text-[13px] text-link hover:underline"
                      >
                        {c.vin}
                      </Link>
                    </td>
                    <td className="max-w-md truncate">{c.description}</td>
                    <td className="num">{money(c.amount)}</td>
                    <td>
                      <ClaimStatusTag status={c.status} />
                    </td>
                    <td className="text-fg-muted">
                      {c.createdAt.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
