import { listParts, listUnits } from "@/lib/api";
import { OrderForm } from "@/components/OrderForm";

export const metadata = { title: "New parts order" };

export default async function NewPartsOrderPage() {
  const [parts, units] = await Promise.all([listParts(), listUnits()]);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="page-title">New parts order</h1>
      <p className="mt-2 text-fg-muted">
        Order for stock, or tie the order to a coach so it shows on the unit.
      </p>
      <OrderForm parts={parts} units={units} />
    </div>
  );
}
