import { listParts, listUnits } from "@/lib/api";
import { OrderForm } from "@/components/OrderForm";

export const metadata = { title: "New parts order" };

export default async function NewPartsOrderPage() {
  const [parts, units] = await Promise.all([listParts(), listUnits()]);
  return (
    <>
      <h1 className="text-2xl font-semibold">New parts order</h1>
      <OrderForm parts={parts} units={units} />
    </>
  );
}
