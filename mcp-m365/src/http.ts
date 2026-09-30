/** Streamable HTTP entry point on :8100 for the assistant. Stateless: one server per request. */
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer, type Server } from "node:http";
import { resolve } from "node:path";
import { authFromEnv, makeVerifier, type Verifier } from "./auth.js";
import { Graph } from "./graph.js";
import { PowerBi } from "./powerbi.js";
import { createServer } from "./server.js";

export function createApp(
  graph: Graph,
  site: string,
  verify: Verifier,
  powerBi?: PowerBi,
): Server {
  return createHttpServer(async (req, res) => {
    const json = (status: number, body: unknown) =>
      res
        .writeHead(status, { "content-type": "application/json" })
        .end(JSON.stringify(body));
    const rpcError = (status: number, code: number, message: string) =>
      json(status, { jsonrpc: "2.0", error: { code, message }, id: null });
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/health") return json(200, { status: "ok" });
    if (path !== "/mcp") return rpcError(404, -32000, "Not found.");
    if (req.method !== "POST")
      return rpcError(405, -32000, "Method not allowed.");
    try {
      await verify(req.headers.authorization);
    } catch (e) {
      return rpcError(401, -32001, (e as Error).message);
    }
    const server = createServer(graph, site, powerBi);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res); // SDK reads and size-limits the body itself
  });
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const site = process.env.M365_SITE;
  if (!site) throw new Error("M365_SITE is not set");
  const port = Number(process.env.PORT ?? 8100);
  createApp(
    Graph.fromEnv(),
    site,
    makeVerifier(authFromEnv()),
    PowerBi.fromEnv(),
  ).listen(port, () => {
    console.error(`mcp-m365 listening on http://localhost:${port}/mcp`);
  });
}
