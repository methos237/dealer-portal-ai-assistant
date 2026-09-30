import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Graph } from "../src/graph.js";
import { PowerBi } from "../src/powerbi.js";
import { createServer } from "../src/server.js";
import { createApp } from "../src/http.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const SITE = "contoso.sharepoint.com:/sites/dealer-docs";
const DRIVE =
  "b!agemyV2spEyc7NQnza-3L2e2U4DRoExButL3TNAZA-pJYTKt8ZajSIsWsdSbuiI0";
const ITEM = "014LKTFRKN6FABEKZCENDKPNK5RGCBINM7";

/** Recorded Graph responses keyed by URL path; unknown paths fail like Graph does. */
const routes: Record<string, () => Response> = {
  [`/sites/${SITE}/drives`]: () =>
    Response.json(JSON.parse(fixture("drives.json").toString())),
  [`/drives/${DRIVE}/root/children`]: () =>
    Response.json(JSON.parse(fixture("children.json").toString())),
  [`/drives/${DRIVE}/root:/2026:/children`]: () => Response.json({ value: [] }),
  [`/drives/${DRIVE}/items/${ITEM}`]: () =>
    Response.json(JSON.parse(fixture("item.json").toString())),
  [`/drives/${DRIVE}/items/${ITEM}/content`]: () =>
    new Response(fixture("sb-2026-11-awning-motor.md")),
  [`/drives/${DRIVE}/root/search(q='awning%20motor')`]: () =>
    Response.json(JSON.parse(fixture("search.json").toString())),
  [`/drives/${DRIVE}/root/search(q='awning')`]: () =>
    Response.json(
      {
        error: {
          code: "generalException",
          message: "General exception while processing",
        },
      },
      { status: 500 },
    ),
};
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const MODEL = "22222222-2222-4222-8222-222222222222";
const PBI_PATH = `/groups/${WORKSPACE}/datasets/${MODEL}/executeQueries`;
const calls: string[] = [];
const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace("/v1.0", "").replace("/myorg", "");
  calls.push(path);
  if (path === PBI_PATH) {
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer fake-pbi-token",
    );
    const { queries } = JSON.parse(String(init?.body));
    return queries[0].query.includes("BAD")
      ? Response.json(
          {
            error: {
              code: "DatasetExecuteQueriesError",
              message: "Query (1, 10) The syntax for 'BAD' is incorrect.",
            },
          },
          { status: 400 },
        )
      : Response.json({
          results: [
            {
              tables: [
                {
                  rows: [
                    { "dealers[name]": "Blue Ridge RV", "[Claims]": 6 },
                    { "dealers[name]": "Lakeshore Motorhomes", "[Claims]": 6 },
                  ],
                },
              ],
            },
          ],
        });
  }
  expect((init?.headers as Record<string, string>).authorization).toBe(
    "Bearer fake-graph-token",
  );
  const route = routes[path] ?? routes[decodeURIComponent(path)];
  return route
    ? route()
    : Response.json(
        {
          error: {
            code: "itemNotFound",
            message: "The resource could not be found.",
          },
        },
        { status: 404 },
      );
};
const graph = new Graph(async () => "fake-graph-token", fakeFetch);
const powerBi = new PowerBi(
  async () => "fake-pbi-token",
  WORKSPACE,
  MODEL,
  fakeFetch,
);

async function connect(pbi?: PowerBi) {
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await createServer(graph, SITE, pbi).connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}
const text = (r: Awaited<ReturnType<Client["callTool"]>>) =>
  JSON.parse((r.content as Array<{ text: string }>)[0]!.text);

describe("mcp-m365 server", () => {
  it("lists the four read-only tools with strict-able schemas", async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_document",
      "list_documents",
      "list_libraries",
      "search_documents",
    ]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("list_libraries returns drive ids", async () => {
    const r = text(
      await (
        await connect()
      ).callTool({ name: "list_libraries", arguments: {} }),
    );
    expect(r).toEqual([
      expect.objectContaining({ drive_id: DRIVE, name: "Documents" }),
    ]);
  });

  it("list_documents marks folders and files", async () => {
    const r = text(
      await (
        await connect()
      ).callTool({ name: "list_documents", arguments: { drive_id: DRIVE } }),
    );
    expect(r).toEqual([
      expect.objectContaining({
        kind: "file",
        name: "sb-2026-11-awning-motor.md",
        drive_id: DRIVE,
      }),
    ]);
  });

  it("get_document downloads and extracts text", async () => {
    const r = text(
      await (
        await connect()
      ).callTool({
        name: "get_document",
        arguments: { drive_id: DRIVE, item_id: ITEM },
      }),
    );
    expect(r.name).toBe("sb-2026-11-awning-motor.md");
    expect(r.truncated).toBe(false);
    expect(r.text).toContain("AWN-1200-H2");
  });

  it("search_documents searches every library when drive_id is omitted", async () => {
    calls.length = 0;
    const r = await (
      await connect()
    ).callTool({
      name: "search_documents",
      arguments: { query: "awning motor" },
    });
    expect(calls.filter((c) => c.includes("/search("))).toHaveLength(1);
    expect(text(r)).toEqual([
      expect.objectContaining({ id: ITEM, kind: "file" }),
    ]);
  });

  it("search_documents falls back to file names when Graph search is down", async () => {
    const r = text(
      await (
        await connect()
      ).callTool({ name: "search_documents", arguments: { query: "awning" } }),
    );
    expect(r.note).toContain("Graph 500 generalException");
    expect(r.results).toEqual([expect.objectContaining({ id: ITEM })]);
  });

  it("search_documents on one library returns files", async () => {
    const r = text(
      await (
        await connect()
      ).callTool({
        name: "search_documents",
        arguments: { query: "awning motor", drive_id: DRIVE },
      }),
    );
    expect(r).toEqual([expect.objectContaining({ id: ITEM, kind: "file" })]);
  });

  it("refuses drives outside the site and ids that could rewrite the URL", async () => {
    calls.length = 0;
    const client = await connect();
    const foreign = await client.callTool({
      name: "get_document",
      arguments: { drive_id: "b!someOtherTenantDrive", item_id: ITEM },
    });
    expect(foreign.isError).toBe(true);
    const traversal = await client.callTool({
      name: "get_document",
      arguments: { drive_id: DRIVE, item_id: "../../users/ceo/drive/root:" },
    });
    expect(traversal.isError).toBe(true);
    expect(calls.filter((c) => c.includes("/items/"))).toHaveLength(0);
  });

  it("unknown items surface Graph's error", async () => {
    const r = await (
      await connect()
    ).callTool({
      name: "get_document",
      arguments: { drive_id: DRIVE, item_id: "nope" },
    });
    expect(r.isError).toBe(true);
  });
});

describe("query_semantic_model", () => {
  const dax =
    'EVALUATE SUMMARIZECOLUMNS(dealers[name], "Claims", [Claim Count])';

  it("is offered only when Power BI is configured", async () => {
    const { tools } = await (await connect(powerBi)).listTools();
    expect(tools.map((t) => t.name)).toContain("query_semantic_model");
    expect(tools).toHaveLength(5);
    expect(
      tools.find((t) => t.name === "query_semantic_model")?.annotations
        ?.readOnlyHint,
    ).toBe(true);
  });

  it("runs a single EVALUATE and returns rows", async () => {
    const r = text(
      await (
        await connect(powerBi)
      ).callTool({ name: "query_semantic_model", arguments: { dax } }),
    );
    expect(r.rowCount).toBe(2);
    expect(r.truncated).toBe(false);
    expect(r.rows[0]).toEqual({
      "dealers[name]": "Blue Ridge RV",
      "[Claims]": 6,
    });
  });

  it("refuses anything but one EVALUATE without calling Power BI", async () => {
    const client = await connect(powerBi);
    for (const bad of [
      `DEFINE MEASURE claims[x] = 1 ${dax}`,
      "SELECT 1",
      `${dax} ${dax}`,
      "",
    ]) {
      calls.length = 0;
      const r = await client.callTool({
        name: "query_semantic_model",
        arguments: { dax: bad || "x" },
      });
      expect(r.isError).toBe(true);
      expect(calls).toEqual([]);
    }
  });

  it("surfaces DAX errors as tool errors", async () => {
    const r = await (
      await connect(powerBi)
    ).callTool({
      name: "query_semantic_model",
      arguments: { dax: "EVALUATE BAD" },
    });
    expect(r.isError).toBe(true);
    expect((r.content as Array<{ text: string }>)[0]!.text).toBe(
      "DatasetExecuteQueriesError: Query (1, 10) The syntax for 'BAD' is incorrect.",
    );
  });
});

describe("http transport", () => {
  it("rejects requests without an accepted bearer token", async () => {
    const app = createApp(graph, SITE, async () => {
      throw new Error("Role not allowed");
    });
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(res.status).toBe(401);
      expect(
        ((await res.json()) as { error: { message: string } }).error.message,
      ).toBe("Role not allowed");
      expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    } finally {
      server.close();
    }
  });

  it("serves tools/list over streamable HTTP once the token verifies", async () => {
    const app = createApp(graph, SITE, async () => ({ roles: ["Thor.Admin"] }));
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer any",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('"name":"list_libraries"');
    } finally {
      server.close();
    }
  });
});
