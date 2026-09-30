import Link from "next/link";
import { OrderStatusTag } from "@/components/StatusTag";
import { listPartsOrders } from "@/lib/api";

export const metadata = { title: "Parts orders" };

import { money } from "@/lib/format";

export default async function PartsOrdersPage() {
  const orders = await listPartsOrders();
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Parts orders</h1>
          <p className="mt-1 text-fg-muted">
            {orders.length} {orders.length === 1 ? "order" : "orders"}
            {" · "}
            {money(orders.reduce((s, o) => s + o.total, 0))}
          </p>
        </div>
        <Link href="/parts-orders/new" className="btn btn-primary">
          New order
        </Link>
      </div>
      <div className="card mt-6 overflow-x-auto">
        {orders.length === 0 ? (
          <p className="p-6 text-sm text-fg-muted">
            No parts orders yet. Start one for stock or for a specific unit.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Lines</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="num text-fg-muted">{o.id}</td>
                  <td>
                    <ul className="flex flex-wrap gap-1.5">
                      {o.lines.map((l) => (
                        <li key={l.sku} className="tag font-mono">
                          {l.quantity} × {l.sku}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="num">{money(o.total)}</td>
                  <td>
                    <OrderStatusTag status={o.status} />
                  </td>
                  <td className="text-fg-muted">{o.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
