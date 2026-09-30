"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPartsOrder } from "@/lib/actions";
import { validatePartsOrder } from "@/lib/validation";
import type { Part, Unit } from "@/lib/types";
import { Close } from "./icons";

import { money } from "@/lib/format";

export function OrderForm({ parts, units }: { parts: Part[]; units: Unit[] }) {
  const router = useRouter();
  const [lines, setLines] = useState([{ sku: "", quantity: 1 }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validatePartsOrder({
      unitId: new FormData(e.currentTarget).get("unitId"),
      lines,
    });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const result = await createPartsOrder(v.value);
    setBusy(false);
    if (result.ok) router.push("/parts-orders");
    else setStatus(result.error);
  }

  const price = (sku: string) =>
    parts.find((p) => p.sku === sku)?.unitPrice ?? 0;
  const total = lines.reduce((sum, l) => sum + price(l.sku) * l.quantity, 0);

  return (
    <form onSubmit={onSubmit} className="card mt-6 p-6" noValidate>
      <label className="label">
        Unit (optional)
        <select name="unitId" className="field mt-1.5" defaultValue="">
          <option value="">Stock order</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.vin} · {u.model}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="mt-6">
        <legend className="label">Parts</legend>
        <div className="mt-1.5 space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={line.sku}
                onChange={(e) =>
                  setLines(
                    lines.map((l, j) =>
                      j === i ? { ...l, sku: e.target.value } : l,
                    ),
                  )
                }
                className="field flex-1"
                aria-label={`Part ${i + 1}`}
              >
                <option value="">Choose a part</option>
                {parts.map((p) => (
                  <option key={p.sku} value={p.sku}>
                    {p.sku} · {p.name} · {money(p.unitPrice)}
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
                className="field w-24 text-right tabular-nums"
                aria-label={`Quantity ${i + 1}`}
              />
              <span className="hidden w-24 text-right text-sm text-fg-muted tabular-nums sm:block">
                {money(price(line.sku) * line.quantity)}
              </span>
              <button
                type="button"
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
                aria-label={`Remove line ${i + 1}`}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg"
              >
                <Close width={16} height={16} />
              </button>
            </div>
          ))}
        </div>
        {errors.lines && <p className="error-text">{errors.lines}</p>}
        <button
          type="button"
          onClick={() => setLines([...lines, { sku: "", quantity: 1 }])}
          className="btn btn-ghost btn-sm mt-3"
        >
          Add line
        </button>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
        <p className="text-sm text-fg-muted">
          Estimated total{" "}
          <span className="ml-1 font-heading text-xl font-semibold text-fg tabular-nums">
            {money(total)}
          </span>
        </p>
        <button disabled={busy} className="btn btn-primary">
          {busy ? "Placing…" : "Place order"}
        </button>
      </div>
      {status && (
        <p role="status" className="mt-3 text-sm text-error-ink">
          {status}
        </p>
      )}
    </form>
  );
}
