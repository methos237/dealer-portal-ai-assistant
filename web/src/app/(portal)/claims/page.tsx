import Link from "next/link";
import { auth } from "@/auth";
import { listClaims } from "@/lib/api";
import { approveClaim } from "@/lib/actions";
import type { ClaimStatus } from "@/lib/types";

export const metadata = { title: "Claims" };

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Claims{status ? ` · ${status}` : ""}
        </h1>
        <Link
          href="/claims/new"
          className="rounded bg-blue-700 px-4 py-2 text-white"
        >
          New claim
        </Link>
      </div>
      <table className="mt-4 w-full border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="p-2">#</th>
            <th className="p-2">VIN</th>
            <th className="p-2">Description</th>
            <th className="p-2 text-right">Amount</th>
            <th className="p-2">Status</th>
            <th className="p-2">Filed</th>
            {canApprove && <th className="p-2" />}
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id} className="border-b" data-testid="claim-row">
              <td className="p-2">{c.id}</td>
              <td className="p-2 font-mono">{c.vin}</td>
              <td className="p-2">{c.description}</td>
              <td className="p-2 text-right">{c.amount.toFixed(2)}</td>
              <td className="p-2">{c.status}</td>
              <td className="p-2">{c.createdAt.slice(0, 10)}</td>
              {canApprove && (
                <td className="p-2">
                  {c.status === "PendingApproval" && (
                    <form
                      action={async () => {
                        "use server";
                        await approveClaim(c.id);
                      }}
                    >
                      <button className="rounded border border-green-700 px-2 py-1 text-green-800">
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
    </>
  );
}
