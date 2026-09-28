import { listUnits } from "@/lib/api";
import { ClaimForm } from "@/components/ClaimForm";

export const metadata = { title: "New claim" };

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ unitId?: string }>;
}) {
  const { unitId } = await searchParams;
  const units = (await listUnits()).filter((u) => u.inWarranty);
  return (
    <>
      <h1 className="text-2xl font-semibold">New warranty claim</h1>
      <p className="text-sm text-slate-500">
        Only units within the 36-month warranty are listed. Claims over 5,000.00
        need THOR approval.
      </p>
      <ClaimForm
        units={units}
        initialUnitId={unitId ? Number(unitId) : undefined}
      />
    </>
  );
}
