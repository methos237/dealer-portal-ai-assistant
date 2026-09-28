import Link from "next/link";
import { listPartsOrders } from "@/lib/api";

export const metadata = { title: "Parts orders" };

export default async function PartsOrdersPage() {
  const orders = await listPartsOrders();
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Parts orders</h1>
        <Link
          href="/parts-orders/new"
          className="rounded bg-blue-700 px-4 py-2 text-white"
        >
          New order
        </Link>
      </div>
      <table className="mt-4 w-full border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="p-2">#</th>
            <th className="p-2">Lines</th>
            <th className="p-2 text-right">Total</th>
            <th className="p-2">Status</th>
            <th className="p-2">Placed</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b">
              <td className="p-2">{o.id}</td>
              <td className="p-2">
                {o.lines.map((l) => `${l.quantity}× ${l.sku}`).join(", ")}
              </td>
              <td className="p-2 text-right">{o.total.toFixed(2)}</td>
              <td className="p-2">{o.status}</td>
              <td className="p-2">{o.createdAt.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
