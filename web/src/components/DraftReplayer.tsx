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
        for (const d of drafts) {
          const result = await createClaim({
            unitId: d.unitId,
            description: d.description,
            amount: d.amount,
          });
          if (result.ok) {
            await deleteDraft(d.id);
            sent++;
          } else {
            setMessage(
              `Draft for unit ${d.unitId} was rejected: ${result.error}`,
            );
            await deleteDraft(d.id);
          }
        }
        if (sent > 0) {
          setMessage(
            `Sent ${sent} claim${sent === 1 ? "" : "s"} saved while offline.`,
          );
          router.refresh();
        }
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
      className="fixed bottom-4 right-4 rounded bg-slate-900 px-4 py-2 text-sm text-white shadow"
    >
      {message}
    </div>
  );
}
