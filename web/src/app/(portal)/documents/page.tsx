import { listDocuments } from "@/lib/api";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const docs = await listDocuments();
  return (
    <>
      <h1 className="text-2xl font-semibold">Documents</h1>
      <ul className="mt-4 divide-y bg-white text-sm">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-4 p-3">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
              {d.kind === "OwnerManual" ? "Manual" : "Bulletin"}
            </span>
            <span className="flex-1">{d.title}</span>
            <span className="text-slate-500">{d.model ?? "All models"}</span>
            <span className="text-slate-500">{d.publishedOn}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
