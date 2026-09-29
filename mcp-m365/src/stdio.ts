/** Entry point for Claude Desktop and other stdio MCP clients. Logs go to stderr; stdout is the protocol. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Graph } from "./graph.js";
import { PowerBi } from "./powerbi.js";
import { createServer } from "./server.js";

const site = process.env.M365_SITE;
if (!site) {
  console.error(
    "M365_SITE is not set (a Graph site id or hostname:/sites/name)",
  );
  process.exit(1);
}
await createServer(Graph.fromEnv(), site, PowerBi.fromEnv()).connect(
  new StdioServerTransport(),
);
