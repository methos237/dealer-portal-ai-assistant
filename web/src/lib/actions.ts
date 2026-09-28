"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "./api-client";
import { post } from "./api";
import type { Claim, NewClaim, NewPartsOrder, PartsOrder } from "./types";

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

async function run<T>(
  fn: () => Promise<T>,
  paths: string[],
): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, value };
  } catch (e) {
    if (e instanceof ApiError) {
      const details = e.errors
        ? Object.values(e.errors).flat().join(" ")
        : e.detail;
      return { ok: false, error: details ? `${e.title}. ${details}` : e.title };
    }
    return { ok: false, error: "The portal API is unreachable." };
  }
}

export async function createClaim(claim: NewClaim) {
  return run(() => post<Claim>("/claims", claim), ["/claims", "/dashboard"]);
}

export async function approveClaim(id: number) {
  return run(
    () => post<Claim>(`/claims/${id}/approve`, undefined),
    ["/claims", "/dashboard"],
  );
}

export async function createPartsOrder(order: NewPartsOrder) {
  return run(
    () => post<PartsOrder>("/parts-orders", order),
    ["/parts-orders", "/dashboard"],
  );
}
