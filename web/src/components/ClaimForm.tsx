"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClaim } from "@/lib/actions";
import { saveDraft } from "@/lib/drafts";
import { validateClaim } from "@/lib/validation";
import type { Unit } from "@/lib/types";
import { ExtractClaim } from "./ExtractClaim";

export function ClaimForm({
  units,
  initialUnitId,
}: {
  units: Unit[];
  initialUnitId?: number;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefill, setPrefill] = useState<{
    unitId?: number;
    description?: string;
    amount?: number;
  }>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const v = validateClaim({
      unitId: form.get("unitId"),
      description: form.get("description"),
      amount: form.get("amount"),
    });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    if (!navigator.onLine) {
      await saveDraft(v.value);
      setStatus(
        "You are offline. The claim is saved on this device and will be sent when you reconnect.",
      );
      setBusy(false);
      return;
    }
    const result = await createClaim(v.value);
    setBusy(false);
    if (result.ok) router.push("/claims");
    else setStatus(result.error);
  }

  return (
    <>
      <ExtractClaim
        onExtract={(e) =>
          setPrefill({
            unitId: units.find((u) => u.vin === e.vin)?.id,
            description: e.description,
            amount: e.amount ?? undefined,
          })
        }
      />
      <form
        key={JSON.stringify(prefill)}
        onSubmit={onSubmit}
        className="card mt-6 space-y-5 p-6"
        noValidate
      >
        <label className="label">
          Unit
          <select
            name="unitId"
            defaultValue={prefill.unitId ?? initialUnitId ?? ""}
            aria-invalid={errors.unitId ? true : undefined}
            className="field mt-1.5"
          >
            <option value="">Choose a unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.vin} · {u.model}
              </option>
            ))}
          </select>
          {errors.unitId && <span className="error-text">{errors.unitId}</span>}
        </label>
        <label className="label">
          Description
          <textarea
            name="description"
            rows={4}
            defaultValue={prefill.description}
            aria-invalid={errors.description ? true : undefined}
            placeholder="What failed, what the customer reported, what was replaced"
            className="field mt-1.5"
          />
          {errors.description && (
            <span className="error-text">{errors.description}</span>
          )}
        </label>
        <label className="label">
          Amount (USD)
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={prefill.amount}
            aria-invalid={errors.amount ? true : undefined}
            placeholder="0.00"
            className="field mt-1.5 max-w-xs tabular-nums"
          />
          {errors.amount && <span className="error-text">{errors.amount}</span>}
        </label>
        <div className="flex items-center gap-4 pt-1">
          <button disabled={busy} className="btn btn-primary">
            {busy ? "Submitting…" : "Submit claim"}
          </button>
          {status && (
            <p role="status" className="text-sm text-fg-muted">
              {status}
            </p>
          )}
        </div>
      </form>
    </>
  );
}
