import Link from "next/link";
import { Search } from "@/components/icons";
import { WarrantyTag } from "@/components/StatusTag";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Units</h1>
          <p className="mt-1 text-fg-muted">
            {units.length} {units.length === 1 ? "coach" : "coaches"}
            {q ? ` matching “${q}”` : " on record"}
          </p>
        </div>
        <form className="relative w-full sm:w-80" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search by VIN or model"
            aria-label="Search units"
            className="field pl-11"
          />
        </form>
      </div>
      <div className="card mt-6 overflow-x-auto">
        {units.length === 0 ? (
          <p className="p-6 text-sm text-fg-muted">
            No units match. Try part of the VIN or a model name.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>VIN</th>
                <th>Model</th>
                <th>Delivered</th>
                <th>Warranty</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link
                      href={`/units/${u.vin}`}
                      className="font-mono text-[13px] text-link hover:underline"
                    >
                      {u.vin}
                    </Link>
                  </td>
                  <td className="font-medium">{u.model}</td>
                  <td className="text-fg-muted">{u.deliveryDate}</td>
                  <td>
                    <WarrantyTag inWarranty={u.inWarranty} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
