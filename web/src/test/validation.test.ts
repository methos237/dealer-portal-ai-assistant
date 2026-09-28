import { describe, expect, test } from "vitest";
import { validateClaim, validatePartsOrder } from "@/lib/validation";

describe("validateClaim", () => {
  test("accepts a well-formed claim and coerces types", () => {
    const v = validateClaim({
      unitId: "3",
      description: "Awning motor stalls",
      amount: "420.50",
    });
    expect(v).toEqual({
      ok: true,
      value: { unitId: 3, description: "Awning motor stalls", amount: 420.5 },
    });
  });

  test("rejects missing unit, short description, non-positive or fractional-cent amounts", () => {
    const v = validateClaim({ unitId: "", description: "x", amount: "0" });
    expect(v.ok).toBe(false);
    if (!v.ok)
      expect(Object.keys(v.errors).sort()).toEqual([
        "amount",
        "description",
        "unitId",
      ]);
    const cents = validateClaim({
      unitId: 1,
      description: "Long enough",
      amount: "10.005",
    });
    expect(cents.ok).toBe(false);
  });
});

describe("validatePartsOrder", () => {
  test("drops empty lines and allows a stock order without a unit", () => {
    const v = validatePartsOrder({
      unitId: "",
      lines: [
        { sku: "AWN-1200", quantity: "2" },
        { sku: "", quantity: 0 },
      ],
    });
    expect(v).toEqual({
      ok: true,
      value: { unitId: null, lines: [{ sku: "AWN-1200", quantity: 2 }] },
    });
  });

  test("requires at least one line and a sku per line", () => {
    expect(validatePartsOrder({ unitId: null, lines: [] }).ok).toBe(false);
    const v = validatePartsOrder({
      unitId: null,
      lines: [{ sku: "", quantity: 3 }],
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors["lines.0.sku"]).toBeDefined();
  });
});
