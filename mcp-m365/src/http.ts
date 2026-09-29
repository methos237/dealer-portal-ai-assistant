/** Streamable HTTP entry point on :8100 for the assistant. Stateless: one server per request. */
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Express } from "express";
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
): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.all("/mcp", async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      });
      return;
    }
    try {
      await verify(req.header("authorization"));
    } catch (e) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: (e as Error).message },
        id: null,
      });
      return;
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
    await transport.handleRequest(req, res, req.body);
  });
  return app;
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
