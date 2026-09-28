"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPartsOrder } from "@/lib/actions";
import { validatePartsOrder } from "@/lib/validation";
import type { Part, Unit } from "@/lib/types";

export function OrderForm({ parts, units }: { parts: Part[]; units: Unit[] }) {
  const router = useRouter();
  const [lines, setLines] = useState([{ sku: "", quantity: 1 }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validatePartsOrder({
      unitId: new FormData(e.currentTarget).get("unitId"),
      lines,
    });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    const result = await createPartsOrder(v.value);
    if (result.ok) router.push("/parts-orders");
    else setStatus(result.error);
  }

  const total = lines.reduce(
    (sum, l) =>
      sum + (parts.find((p) => p.sku === l.sku)?.unitPrice ?? 0) * l.quantity,
    0,
  );

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-2xl space-y-4" noValidate>
      <label className="block text-sm">
        Unit (optional)
        <select
          name="unitId"
          className="mt-1 block w-full rounded border p-2"
          defaultValue=""
        >
          <option value="">Stock order</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.vin} · {u.model}
            </option>
          ))}
        </select>
      </label>
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2 text-sm">
          <select
            value={line.sku}
            onChange={(e) =>
              setLines(
                lines.map((l, j) =>
                  j === i ? { ...l, sku: e.target.value } : l,
                ),
              )
            }
            className="flex-1 rounded border p-2"
            aria-label={`Part ${i + 1}`}
          >
            <option value="">Choose a part</option>
            {parts.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.sku} · {p.name} · {p.unitPrice.toFixed(2)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={line.quantity}
            onChange={(e) =>
              setLines(
                lines.map((l, j) =>
                  j === i ? { ...l, quantity: Number(e.target.value) } : l,
                ),
              )
            }
            className="w-24 rounded border p-2"
            aria-label={`Quantity ${i + 1}`}
          />
          <button
            type="button"
            onClick={() => setLines(lines.filter((_, j) => j !== i))}
            className="px-2"
          >
            ✕
          </button>
        </div>
      ))}
      {errors.lines && <p className="text-sm text-red-700">{errors.lines}</p>}
      <button
        type="button"
        onClick={() => setLines([...lines, { sku: "", quantity: 1 }])}
        className="rounded border px-3 py-1 text-sm"
      >
        Add line
      </button>
      <p className="text-sm">Estimated total: {total.toFixed(2)}</p>
      <button className="rounded bg-blue-700 px-4 py-2 text-white">
        Place order
      </button>
      {status && (
        <p role="status" className="text-sm text-red-700">
          {status}
        </p>
      )}
    </form>
  );
}
