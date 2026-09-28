import "server-only";
import { auth } from "@/auth";
import { apiRequest } from "./api-client";
import type { Claim, Document, Me, Part, PartsOrder, Unit } from "./types";

const baseUrl = process.env.PORTAL_API_URL ?? "http://localhost:5080";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await auth();
  return apiRequest<T>(baseUrl, session?.accessToken ?? "", path, init);
}

export const getMe = () => api<Me>("/dealers/me");
export const listUnits = (q?: string) =>
  api<Unit[]>(q ? `/units?q=${encodeURIComponent(q)}` : "/units");
export const getUnit = (vin: string) =>
  api<Unit>(`/units/${encodeURIComponent(vin)}`);
export const listClaims = () => api<Claim[]>("/claims");
export const listPartsOrders = () => api<PartsOrder[]>("/parts-orders");
export const listParts = () => api<Part[]>("/parts");
export const listDocuments = () => api<Document[]>("/documents");
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
