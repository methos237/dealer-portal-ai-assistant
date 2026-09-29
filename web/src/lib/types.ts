export type Dealer = { id: number; code: string; name: string };
export type Me = { dealer: Dealer | null; roles: string[] };
export type Unit = {
  id: number;
  vin: string;
  model: string;
  deliveryDate: string;
  inWarranty: boolean;
};
export type ClaimStatus = "Open" | "PendingApproval" | "Approved" | "Rejected";
export type Claim = {
  id: number;
  unitId: number;
  vin: string;
  description: string;
  amount: number;
  status: ClaimStatus;
  createdAt: string;
  approvedAt: string | null;
};
export type PartsOrderLine = {
  sku: string;
  quantity: number;
  unitPrice: number;
};
export type PartsOrder = {
  id: number;
  unitId: number | null;
  status: "Submitted" | "Shipped" | "Cancelled";
  total: number;
  createdAt: string;
  lines: PartsOrderLine[];
};
export type Part = { sku: string; name: string; unitPrice: number };
export type Document = {
  id: number;
  title: string;
  kind: "OwnerManual" | "ServiceBulletin";
  path: string;
  model: string | null;
  publishedOn: string;
};
export type NewClaim = { unitId: number; description: string; amount: number };
export type NewPartsOrder = {
  unitId: number | null;
  lines: { sku: string; quantity: number }[];
};
export type ReportSummary = {
  dealerId: number | null;
  totals: {
    claimCount: number;
    claimAmount: number;
    avgDaysToClose: number | null;
    openPartsOrders: number;
  };
  claimsByMonth: { month: string; count: number; amount: number }[];
  topParts: { sku: string; name: string; quantity: number }[];
};
