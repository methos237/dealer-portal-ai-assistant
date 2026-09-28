export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md p-12 text-center">
      <h1 className="text-2xl font-semibold">You are offline</h1>
      <p className="mt-2 text-slate-600">
        This page is not cached. Claim drafts you saved while offline are sent
        automatically when the connection returns.
      </p>
    </main>
  );
}
