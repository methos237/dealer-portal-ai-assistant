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
        className="mt-6 max-w-lg space-y-4"
        noValidate
      >
        <label className="block text-sm">
          Unit
          <select
            name="unitId"
            defaultValue={initialUnitId ?? ""}
            className="mt-1 block w-full rounded border p-2"
          >
            <option value="">Choose a unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.vin} · {u.model}
              </option>
            ))}
          </select>
          {errors.unitId && (
            <span className="text-red-700">{errors.unitId}</span>
          )}
        </label>
        <label className="block text-sm">
          Description
          <textarea
            name="description"
            rows={4}
            className="mt-1 block w-full rounded border p-2"
          />
          {errors.description && (
            <span className="text-red-700">{errors.description}</span>
          )}
        </label>
        <label className="block text-sm">
          Amount (USD)
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            className="mt-1 block w-full rounded border p-2"
          />
          {errors.amount && (
            <span className="text-red-700">{errors.amount}</span>
          )}
        </label>
        <button
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          Submit claim
        </button>
        {status && (
          <p role="status" className="text-sm text-slate-700">
            {status}
          </p>
        )}
      </form>
    </>
  );
}
