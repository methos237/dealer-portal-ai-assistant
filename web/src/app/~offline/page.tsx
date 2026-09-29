import { Mark } from "@/components/icons";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <Mark className="text-primary" width={40} height={40} />
      <h1 className="mt-6 text-3xl font-semibold">You are offline</h1>
      <p className="mt-3 text-fg-muted">
        This page is not cached. Claim drafts you saved while offline are sent
        automatically when the connection returns.
      </p>
    </main>
  );
}
