import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "@/components/icons";
import { ClaimStatusTag, WarrantyTag } from "@/components/StatusTag";
import { getUnit, listClaims } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

import { money } from "@/lib/format";

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
      <Link href="/units" className="link-arrow">
        <ArrowRight width={16} height={16} className="rotate-180" />
        All units
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-fg-muted">{unit.model}</p>
          <h1 className="page-title font-mono tracking-normal">{unit.vin}</h1>
        </div>
        {unit.inWarranty && (
          <Link
            href={`/claims/new?unitId=${unit.id}`}
            className="btn btn-primary"
          >
            File a claim
          </Link>
        )}
      </div>

      <dl className="card mt-6 grid max-w-2xl grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <dt className="text-sm text-fg-muted">Model</dt>
          <dd className="mt-1 font-medium">{unit.model}</dd>
        </div>
        <div className="p-5">
          <dt className="text-sm text-fg-muted">Delivered</dt>
          <dd className="mt-1 font-medium tabular-nums">{unit.deliveryDate}</dd>
        </div>
        <div className="p-5">
          <dt className="text-sm text-fg-muted">Warranty</dt>
          <dd className="mt-1" data-testid="warranty">
            <WarrantyTag inWarranty={unit.inWarranty} />
            <span className="ml-2 text-sm text-fg-muted">
              {unit.inWarranty ? "36 months from delivery" : ""}
            </span>
          </dd>
        </div>
      </dl>

      <section className="mt-10">
        <h2 className="text-xl">Claims on this unit</h2>
        <div className="card mt-3 overflow-x-auto">
          {claims.length === 0 ? (
            <p className="p-6 text-sm text-fg-muted">
              No claims filed for this coach.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Filed</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td className="num text-fg-muted">{c.id}</td>
                    <td>{c.description}</td>
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
