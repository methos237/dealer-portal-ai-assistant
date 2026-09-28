/**
 * MCP server over one SharePoint site: list its libraries, browse and read documents, search.
 * Read-only by construction (see graph.ts). The same server runs on stdio for Claude Desktop and
 * over streamable HTTP for the assistant (http.ts).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { extractText, isExtractable } from "./extract.js";
import type { DriveItem, Graph } from "./graph.js";

export const MAX_TEXT_CHARS = 60_000;

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

const item = (i: DriveItem) => ({
  id: i.id,
  name: i.name,
  kind: i.folder ? "folder" : "file",
  size: i.size,
  modified: i.lastModifiedDateTime,
  webUrl: i.webUrl,
  drive_id: i.parentReference?.driveId,
  ...(i.folder ? { children: i.folder.childCount } : {}),
});

export function createServer(graph: Graph, site: string): McpServer {
  const server = new McpServer({
    name: "dealer-portal-m365",
    version: "0.1.0",
  });
  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };

  server.registerTool(
    "list_libraries",
    {
      title: "List document libraries",
      description:
        "Document libraries (drives) in the configured SharePoint site. Use the returned drive_id with the other tools.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => {
      const libs = await graph.listLibraries(site);
      return ok(
        libs.map((l) => ({ drive_id: l.id, name: l.name, webUrl: l.webUrl })),
      );
    },
  );

  server.registerTool(
    "list_documents",
    {
      title: "List documents",
      description:
        "Files and folders in a library, optionally under a folder path such as 'Bulletins/2026'.",
      inputSchema: z.object({
        drive_id: z.string().describe("From list_libraries"),
        path: z
          .string()
          .optional()
          .describe("Folder path inside the library; omit for the root"),
      }),
      annotations: readOnly,
    },
    async ({ drive_id, path }) =>
      ok((await graph.listDocuments(drive_id, path)).map(item)),
  );

  server.registerTool(
    "get_document",
    {
      title: "Read a document",
      description: `Plain text of a .pdf, .docx, .md or .txt document (first ${MAX_TEXT_CHARS} characters).`,
      inputSchema: z.object({
        drive_id: z.string(),
        item_id: z.string().describe("From list_documents or search_documents"),
      }),
      annotations: readOnly,
    },
    async ({ drive_id, item_id }) => {
      const meta = await graph.getItem(drive_id, item_id);
      if (meta.folder)
        return fail(
          `${meta.name} is a folder; use list_documents with its path.`,
        );
      if (!isExtractable(meta.name))
        return fail(
          `Cannot extract text from ${meta.name}: unsupported file type.`,
        );
      const text = await extractText(
        meta.name,
        await graph.download(drive_id, item_id),
      );
      return ok({
        ...item(meta),
        truncated: text.length > MAX_TEXT_CHARS,
        text: text.slice(0, MAX_TEXT_CHARS),
      });
    },
  );

  server.registerTool(
    "search_documents",
    {
      title: "Search documents",
      description:
        "Full-text search over file names and contents. Searches one library, or every library in the site when drive_id is omitted.",
      inputSchema: z.object({
        query: z.string().min(1),
        drive_id: z.string().optional(),
      }),
      annotations: readOnly,
    },
    async ({ query, drive_id }) => {
      const drives = drive_id
        ? [drive_id]
        : (await graph.listLibraries(site)).map((l) => l.id);
      const results = await Promise.all(
        drives.map((d) => graph.search(d, query)),
      );
      return ok(
        results
          .flat()
          .filter((i) => !i.folder)
          .map(item),
      );
    },
  );

  return server;
}
