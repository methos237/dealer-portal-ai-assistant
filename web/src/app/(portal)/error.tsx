"use client";

import Link from "next/link";
import { signOutAction } from "@/lib/auth-actions";

/** Catches failures below the portal shell: api down, expired token, unexpected 4xx/5xx. */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card mx-auto mt-8 max-w-xl p-8">
      <h1 className="text-2xl">This page could not load</h1>
      <p className="mt-3 text-fg-muted">
        The portal api did not return this data. Try again; if it keeps failing,
        sign out and back in to refresh your session.
      </p>
      {/* Production redacts server error messages to a generic React notice; keep the digest for logs. */}
      <p className="mt-3 font-mono text-xs text-fg-subtle">
        {process.env.NODE_ENV === "production"
          ? error.digest && `Reference ${error.digest}`
          : error.message}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-ghost">
          Dashboard
        </Link>
        <form action={signOutAction}>
          <button className="btn btn-ghost">Sign out</button>
        </form>
      </div>
    </div>
  );
}
