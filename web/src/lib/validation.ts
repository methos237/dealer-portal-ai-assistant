import type { NewClaim, NewPartsOrder } from "./types";

export type Validation<T> =
  { ok: true; value: T } | { ok: false; errors: Record<string, string> };

/** Mirrors the API's data annotations so the form fails fast; the API remains the authority. */
export function validateClaim(input: {
  unitId: unknown;
  description: unknown;
  amount: unknown;
}): Validation<NewClaim> {
  const errors: Record<string, string> = {};
  const unitId = Number(input.unitId);
  const description = String(input.description ?? "").trim();
  const amount = Number(input.amount);
  if (!Number.isInteger(unitId) || unitId < 1) errors.unitId = "Choose a unit.";
  if (description.length < 5 || description.length > 2000)
    errors.description = "Describe the issue in 5 to 2000 characters.";
  if (!Number.isFinite(amount) || amount <= 0)
    errors.amount = "Amount must be greater than zero.";
  else if (Math.round(amount * 100) !== amount * 100)
    errors.amount = "Amount has at most two decimals.";
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { unitId, description, amount } };
}

export function validatePartsOrder(input: {
  unitId: unknown;
  lines: { sku: unknown; quantity: unknown }[];
}): Validation<NewPartsOrder> {
  const errors: Record<string, string> = {};
  const unitId =
    input.unitId === "" || input.unitId == null ? null : Number(input.unitId);
  if (unitId !== null && (!Number.isInteger(unitId) || unitId < 1))
    errors.unitId = "Choose a unit or leave blank.";
  const lines = input.lines
    .map((l) => ({
      sku: String(l.sku ?? "").trim(),
      quantity: Number(l.quantity),
    }))
    .filter((l) => l.sku !== "" || l.quantity > 0);
  if (lines.length === 0) errors.lines = "Add at least one line.";
  lines.forEach((l, i) => {
    if (!l.sku) errors[`lines.${i}.sku`] = "SKU is required.";
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 10000)
      errors[`lines.${i}.quantity`] = "Quantity 1 to 10000.";
  });
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { unitId, lines } };
}
