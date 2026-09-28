import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Graph } from "../src/graph.js";
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
const calls: string[] = [];
const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace("/v1.0", "");
  calls.push(path);
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

async function connect() {
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await createServer(graph, SITE).connect(serverEnd);
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
