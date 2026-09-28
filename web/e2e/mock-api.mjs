// Minimal stand-in for the portal API so the Playwright smoke test runs without Entra or Postgres.
import { createServer } from "node:http";

const today = new Date();
const monthsAgo = (m) =>
  new Date(today.getFullYear(), today.getMonth() - m, 15)
    .toISOString()
    .slice(0, 10);
const units = [
  {
    id: 1,
    vin: "1THRA24X0RN000001",
    model: "Aria 24",
    deliveryDate: monthsAgo(6),
    inWarranty: true,
  },
  {
    id: 4,
    vin: "1THRS36X4RN000004",
    model: "Summit 36",
    deliveryDate: monthsAgo(20),
    inWarranty: true,
  },
  {
    id: 16,
    vin: "1THRA24X1RL000016",
    model: "Aria 24",
    deliveryDate: monthsAgo(50),
    inWarranty: false,
  },
];
const parts = [
  { sku: "AWN-1200", name: "Awning motor 12V", unitPrice: 389.0 },
  { sku: "FRN-SAIL", name: "Furnace sail switch", unitPrice: 19.95 },
];
const claims = [
  {
    id: 1,
    unitId: 1,
    vin: units[0].vin,
    description: "Slide-out seal leaking",
    amount: 760.0,
    status: "Open",
    createdAt: new Date().toISOString(),
    approvedAt: null,
  },
  {
    id: 2,
    unitId: 4,
    vin: units[1].vin,
    description: "Inverter shuts down under load",
    amount: 7250.0,
    status: "PendingApproval",
    createdAt: new Date().toISOString(),
    approvedAt: null,
  },
];
const orders = [
  {
    id: 1,
    unitId: null,
    status: "Submitted",
    total: 389.0,
    createdAt: new Date().toISOString(),
    lines: [{ sku: "AWN-1200", quantity: 1, unitPrice: 389.0 }],
  },
];
const documents = [
  {
    id: 1,
    title: "Aria Owners Manual (2024)",
    kind: "OwnerManual",
    path: "owner-manual-aria.md",
    model: "Aria",
    publishedOn: "2024-01-15",
  },
  {
    id: 4,
    title: "SB-2026-03 Slide-out seal inspection",
    kind: "ServiceBulletin",
    path: "sb-2026-03.md",
    model: "Aria",
    publishedOn: "2026-03-04",
  },
];

const json = (res, status, body) => {
  res.writeHead(status, {
    "content-type":
      status >= 400 ? "application/problem+json" : "application/json",
  });
  res.end(JSON.stringify(body));
};
const readJson = (req) =>
  new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b ? JSON.parse(b) : null));
  });

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  if (p === "/health") return json(res, 200, { status: "ok" });
  if (!req.headers.authorization?.startsWith("Bearer "))
    return json(res, 401, { title: "Unauthorized", status: 401 });
  if (p === "/dealers/me")
    return json(res, 200, {
      dealer: { id: 1, code: "D-100", name: "Blue Ridge RV" },
      roles: ["Dealer.User"],
    });
  if (p === "/units") return json(res, 200, units);
  if (p.startsWith("/units/")) {
    const u = units.find((u) => u.vin === decodeURIComponent(p.slice(7)));
    return u
      ? json(res, 200, u)
      : json(res, 404, { title: "Not Found", status: 404 });
  }
  if (p === "/claims" && req.method === "GET") return json(res, 200, claims);
  if (p === "/claims" && req.method === "POST") {
    const body = await readJson(req);
    const unit = units.find((u) => u.id === body.unitId);
    if (!unit) return json(res, 404, { title: "Not Found", status: 404 });
    if (!unit.inWarranty)
      return json(res, 422, { title: "Unit is out of warranty", status: 422 });
    const claim = {
      id: claims.length + 1,
      unitId: unit.id,
      vin: unit.vin,
      description: body.description,
      amount: body.amount,
      status: body.amount > 5000 ? "PendingApproval" : "Open",
      createdAt: new Date().toISOString(),
      approvedAt: null,
    };
    claims.unshift(claim);
    return json(res, 201, claim);
  }
  const approve = p.match(/^\/claims\/(\d+)\/approve$/);
  if (approve && req.method === "POST") {
    const c = claims.find((c) => c.id === Number(approve[1]));
    if (!c) return json(res, 404, { title: "Not Found", status: 404 });
    if (c.status !== "PendingApproval")
      return json(res, 409, {
        title: "Claim is not pending approval",
        status: 409,
      });
    c.status = "Approved";
    c.approvedAt = new Date().toISOString();
    return json(res, 200, c);
  }
  if (p === "/parts-orders" && req.method === "GET")
    return json(res, 200, orders);
  if (p === "/parts-orders" && req.method === "POST") {
    const body = await readJson(req);
    const unknown = body.lines
      .map((l) => l.sku)
      .filter((s) => !parts.some((p) => p.sku === s));
    if (unknown.length)
      return json(res, 400, {
        title: "Unknown SKU",
        status: 400,
        errors: { Lines: unknown.map((s) => `Unknown SKU '${s}'.`) },
      });
    const lines = body.lines.map((l) => ({
      ...l,
      unitPrice: parts.find((p) => p.sku === l.sku).unitPrice,
    }));
    const order = {
      id: orders.length + 1,
      unitId: body.unitId,
      status: "Submitted",
      total: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      createdAt: new Date().toISOString(),
      lines,
    };
    orders.unshift(order);
    return json(res, 201, order);
  }
  if (p === "/parts") return json(res, 200, parts);
  if (p === "/documents") return json(res, 200, documents);
  json(res, 404, { title: "Not Found", status: 404 });
}).listen(Number(process.env.PORT ?? 5081), () =>
  console.log("mock api on", process.env.PORT ?? 5081),
);
