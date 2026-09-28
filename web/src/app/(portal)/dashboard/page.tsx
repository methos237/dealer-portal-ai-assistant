import Link from "next/link";
import { getMe, listClaims, listPartsOrders, listUnits } from "@/lib/api";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [me, units, claims, orders] = await Promise.all([
    getMe(),
    listUnits(),
    listClaims(),
    listPartsOrders(),
  ]);
  const tiles = [
    { label: "Units", value: units.length, href: "/units" },
    {
      label: "Open claims",
      value: claims.filter((c) => c.status === "Open").length,
      href: "/claims",
    },
    {
      label: "Pending approval",
      value: claims.filter((c) => c.status === "PendingApproval").length,
      href: "/claims?status=PendingApproval",
    },
    { label: "Parts orders", value: orders.length, href: "/parts-orders" },
  ];
  return (
    <>
      <h1 className="text-2xl font-semibold">
        {me.dealer ? me.dealer.name : "All dealers"}
      </h1>
      <p className="text-sm text-slate-500">
        {me.dealer ? `Dealer ${me.dealer.code}` : "THOR administrator view"}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="rounded border bg-white p-4 hover:border-blue-600"
          >
            <div className="text-sm text-slate-500">{t.label}</div>
            <div
              className="text-3xl font-semibold"
              data-testid={`tile-${t.label}`}
            >
              {t.value}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
