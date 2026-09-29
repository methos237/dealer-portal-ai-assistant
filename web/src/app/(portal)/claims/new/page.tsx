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
    <div className="mx-auto max-w-2xl">
      <h1 className="page-title">New warranty claim</h1>
      <p className="mt-2 text-fg-muted">
        Only units within the 36-month warranty are listed. Claims over
        $5,000.00 go to THOR for approval before payment.
      </p>
      <ClaimForm
        units={units}
        initialUnitId={unitId ? Number(unitId) : undefined}
      />
    </div>
  );
}
