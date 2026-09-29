import type { Claim, PartsOrder, Unit } from "@/lib/types";

const claimTone: Record<Claim["status"], string> = {
  Open: "tag-primary",
  PendingApproval: "tag-warn",
  Approved: "tag-success",
  Rejected: "tag-error",
};
const claimLabel: Record<Claim["status"], string> = {
  Open: "Open",
  PendingApproval: "Pending approval",
  Approved: "Approved",
  Rejected: "Rejected",
};
const orderTone: Record<PartsOrder["status"], string> = {
  Submitted: "tag-primary",
  Shipped: "tag-success",
  Cancelled: "tag",
};

export function ClaimStatusTag({ status }: { status: Claim["status"] }) {
  return (
    <span className={`tag ${claimTone[status]}`}>{claimLabel[status]}</span>
  );
}

export function OrderStatusTag({ status }: { status: PartsOrder["status"] }) {
  return <span className={`tag ${orderTone[status]}`}>{status}</span>;
}

export function WarrantyTag({
  inWarranty,
}: {
  inWarranty: Unit["inWarranty"];
}) {
  return (
    <span className={`tag ${inWarranty ? "tag-success" : "tag"}`}>
      {inWarranty ? "In warranty" : "Expired"}
    </span>
  );
}
