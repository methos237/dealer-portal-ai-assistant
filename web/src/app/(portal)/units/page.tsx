import Link from "next/link";
import { listUnits } from "@/lib/api";

export const metadata = { title: "Units" };

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const units = await listUnits(q);
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Units</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="VIN or model"
            className="rounded border px-2 py-1"
          />
          <button className="rounded border px-3 py-1">Search</button>
        </form>
      </div>
      <table className="mt-4 w-full border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="p-2">VIN</th>
            <th className="p-2">Model</th>
            <th className="p-2">Delivered</th>
            <th className="p-2">Warranty</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id} className="border-b hover:bg-slate-50">
              <td className="p-2 font-mono">
                <Link
                  href={`/units/${u.vin}`}
                  className="text-blue-800 underline"
                >
                  {u.vin}
                </Link>
              </td>
              <td className="p-2">{u.model}</td>
              <td className="p-2">{u.deliveryDate}</td>
              <td className="p-2">
                {u.inWarranty ? "In warranty" : "Expired"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
