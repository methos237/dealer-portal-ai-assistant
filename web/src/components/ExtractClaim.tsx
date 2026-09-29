"use client";

import { useState } from "react";

type Extraction = {
  vin: string | null;
  description: string;
  amount: number | null;
  confidence: string;
};

/** Paste a customer's email; the assistant extracts the claim fields and fills the form. */
export function ExtractClaim({
  onExtract,
}: {
  onExtract: (e: Extraction) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function extract() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant/extract/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`assistant ${res.status}`);
      onExtract(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card group mt-6 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
        <span>Pre-fill from the customer&apos;s email</span>
        <span className="text-fg-subtle transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-border px-5 pt-4 pb-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          aria-label="Customer email"
          placeholder="Paste the email here. The assistant picks out the VIN, the problem and the amount."
          className="field"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={extract}
            className="btn btn-ghost btn-sm"
          >
            {busy ? "Reading…" : "Extract claim details"}
          </button>
          {error && <p className="text-error-ink">{error}</p>}
        </div>
      </div>
    </details>
  );
}
