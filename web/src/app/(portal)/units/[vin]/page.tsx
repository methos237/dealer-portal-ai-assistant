import Link from "next/link";
import { notFound } from "next/navigation";
import { getUnit, listClaims } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

export default async function UnitPage({
  params,
}: {
  params: Promise<{ vin: string }>;
}) {
  const { vin } = await params;
  const unit = await getUnit(vin).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const claims = (await listClaims()).filter((c) => c.unitId === unit.id);
  return (
    <>
      <h1 className="font-mono text-2xl font-semibold">{unit.vin}</h1>
      <dl className="mt-4 grid max-w-md grid-cols-2 gap-2 text-sm">
        <dt className="text-slate-500">Model</dt>
        <dd>{unit.model}</dd>
        <dt className="text-slate-500">Delivered</dt>
        <dd>{unit.deliveryDate}</dd>
        <dt className="text-slate-500">Warranty</dt>
        <dd data-testid="warranty">
          {unit.inWarranty ? "In warranty (36 months)" : "Expired"}
        </dd>
      </dl>
      {unit.inWarranty && (
        <Link
          href={`/claims/new?unitId=${unit.id}`}
          className="mt-4 inline-block rounded bg-blue-700 px-4 py-2 text-white"
        >
          File a claim
        </Link>
      )}
      <h2 className="mt-8 text-lg font-semibold">Claims on this unit</h2>
      <ul className="mt-2 text-sm">
        {claims.length === 0 && <li className="text-slate-500">None.</li>}
        {claims.map((c) => (
          <li key={c.id} className="border-b py-2">
            #{c.id} · {c.description} · {c.amount.toFixed(2)} · {c.status}
          </li>
        ))}
      </ul>
    </>
  );
}
