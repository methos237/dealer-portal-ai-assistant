"use client";

import { useState } from "react";

type Extraction = {
  vin: string | null;
  model: string | null;
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
    <details className="mt-4 max-w-lg rounded border bg-white p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Paste the customer&apos;s email to pre-fill
      </summary>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        aria-label="Customer email"
        className="mt-2 block w-full rounded border p-2"
      />
      <button
        type="button"
        disabled={busy || !text.trim()}
        onClick={extract}
        className="mt-2 rounded border px-3 py-1 disabled:opacity-50"
      >
        Extract claim details
      </button>
      {error && <p className="mt-1 text-red-700">{error}</p>}
    </details>
  );
}
