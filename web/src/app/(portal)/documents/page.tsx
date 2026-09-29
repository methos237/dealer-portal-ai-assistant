import { listDocuments } from "@/lib/api";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const docs = await listDocuments();
  const manuals = docs.filter((d) => d.kind === "OwnerManual").length;
  return (
    <>
      <h1 className="page-title">Documents</h1>
      <p className="mt-1 text-fg-muted">
        {manuals} {manuals === 1 ? "owner manual" : "owner manuals"} and{" "}
        {docs.length - manuals} service{" "}
        {docs.length - manuals === 1 ? "bulletin" : "bulletins"}. The assistant
        answers from these and cites them.
      </p>
      <div className="card mt-6 overflow-x-auto">
        {docs.length === 0 ? (
          <p className="p-6 text-sm text-fg-muted">No documents indexed yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Model</th>
                <th>Published</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span
                      className={`tag ${d.kind === "OwnerManual" ? "tag-ink" : "tag-primary"}`}
                    >
                      {d.kind === "OwnerManual" ? "Manual" : "Bulletin"}
                    </span>
                  </td>
                  <td className="font-medium">{d.title}</td>
                  <td className="text-fg-muted">{d.model ?? "All models"}</td>
                  <td className="text-fg-muted">{d.publishedOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
