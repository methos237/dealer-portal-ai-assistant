"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClaim } from "@/lib/actions";
import { deleteDraft, listDrafts } from "@/lib/drafts";

/** Sends claim drafts saved while offline once the browser is online again. */
export function DraftReplayer() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let running = false;
    async function replay() {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        const drafts = await listDrafts();
        let sent = 0;
        const notes: string[] = [];
        for (const d of drafts) {
          const result = await createClaim({
            unitId: d.unitId,
            description: d.description,
            amount: d.amount,
          });
          if (result.ok) {
            await deleteDraft(d.id);
            sent++;
          } else if (result.status && result.status < 500) {
            // The API read it and said no: the draft cannot succeed later.
            notes.push(
              `Draft for unit ${d.unitId} was rejected: ${result.error}`,
            );
            await deleteDraft(d.id);
          } else {
            notes.push(`Draft for unit ${d.unitId} kept: ${result.error}`);
          }
        }
        if (sent > 0) {
          notes.unshift(
            `Sent ${sent} claim${sent === 1 ? "" : "s"} saved while offline.`,
          );
          router.refresh();
        }
        if (notes.length) setMessage(notes.join(" "));
      } finally {
        running = false;
      }
    }
    replay();
    window.addEventListener("online", replay);
    return () => window.removeEventListener("online", replay);
  }, [router]);

  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 max-w-sm rounded-2xl bg-ink px-4 py-3 text-sm text-ink-fg shadow-bar"
    >
      {message}
    </div>
  );
}
