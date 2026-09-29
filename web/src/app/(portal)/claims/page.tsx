import Link from "next/link";
import { auth } from "@/auth";
import { Check } from "@/components/icons";
import { ClaimStatusTag } from "@/components/StatusTag";
import { listClaims } from "@/lib/api";
import { approveClaim } from "@/lib/actions";
import type { ClaimStatus } from "@/lib/types";

export const metadata = { title: "Claims" };

const filters: { label: string; status?: ClaimStatus }[] = [
  { label: "All" },
  { label: "Open", status: "Open" },
  { label: "Pending approval", status: "PendingApproval" },
  { label: "Approved", status: "Approved" },
  { label: "Rejected", status: "Rejected" },
];
const money = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: ClaimStatus }>;
}) {
  const { status } = await searchParams;
  const [session, all] = await Promise.all([auth(), listClaims()]);
  const claims = status ? all.filter((c) => c.status === status) : all;
  const canApprove = session?.roles.includes("Thor.Admin") ?? false;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">
            Claims
            {status === "PendingApproval" ? " awaiting approval" : ""}
          </h1>
          <p className="mt-1 text-fg-muted">
            {claims.length} {claims.length === 1 ? "claim" : "claims"}
            {" · "}
            {money(claims.reduce((s, c) => s + c.amount, 0))}
          </p>
        </div>
        <Link href="/claims/new" className="btn btn-primary">
          New claim
        </Link>
      </div>

      <nav aria-label="Filter by status" className="mt-6 flex flex-wrap gap-1">
        {filters.map((f) => {
          const active = f.status === status;
          return (
            <Link
              key={f.label}
              href={f.status ? `/claims?status=${f.status}` : "/claims"}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-ink text-ink-fg"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums opacity-60">
                {f.status
                  ? all.filter((c) => c.status === f.status).length
                  : all.length}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="card mt-4 overflow-x-auto">
        {claims.length === 0 ? (
          <p className="p-6 text-sm text-fg-muted">
            {status
              ? "No claims in this state."
              : "No claims yet. File the first one from a unit in warranty."}
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>VIN</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th>Filed</th>
                {canApprove && <th className="num">Action</th>}
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} data-testid="claim-row">
                  <td className="num text-fg-muted">{c.id}</td>
                  <td>
                    <Link
                      href={`/units/${c.vin}`}
                      className="font-mono text-[13px] text-link hover:underline"
                    >
                      {c.vin}
                    </Link>
                  </td>
                  <td className="max-w-md">{c.description}</td>
                  <td className="num">{money(c.amount)}</td>
                  <td>
                    <ClaimStatusTag status={c.status} />
                  </td>
                  <td className="text-fg-muted">{c.createdAt.slice(0, 10)}</td>
                  {canApprove && (
                    <td className="num">
                      {c.status === "PendingApproval" && (
                        <form
                          action={async () => {
                            "use server";
                            await approveClaim(c.id);
                          }}
                        >
                          <button className="btn btn-ghost btn-sm">
                            <Check width={16} height={16} />
                            Approve
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
