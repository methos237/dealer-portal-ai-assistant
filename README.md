# Dealer Portal with an Embedded AI Assistant

A B2B dealer portal for an RV manufacturer, with a Claude-powered assistant built into the product rather than bolted on the side.

Dealers manage units, warranty claims, and parts orders in a Next.js front end backed by an ASP.NET Core API. The assistant answers questions from owner manuals and service bulletins with real citations (hybrid retrieval over pgvector), drafts claims and orders through tool calls that the user confirms before anything is written, and is held to an evaluation suite that fails CI when retrieval, faithfulness, tool accuracy, or injection resistance regress. The same portal tools are served over the Model Context Protocol, so Claude Desktop and Claude Code can use them too. A second MCP server connects SharePoint document libraries and a Microsoft Fabric semantic model. Everything deploys to Azure from Bicep.

Built in phases, each tracked as a GitHub issue. See the issues list for progress.

## Components

| Directory | Stack | Role |
|---|---|---|
| `web/` | Next.js, TypeScript, Auth.js, PWA | Portal UI and assistant panel |
| `api/` | ASP.NET Core, EF Core, PostgreSQL | Portal API and MCP endpoint (`/mcp`) |
| `assistant/` | Python, FastAPI, Anthropic SDK, pgvector | Retrieval, agent loop, evaluation runner |
| `mcp-m365/` | TypeScript, MCP SDK, Microsoft Graph | SharePoint and Fabric connector |
| `functions/` | Azure Functions (Python) | Document ingestion from SharePoint |
| `infra/` | Bicep | Azure resources |

## Status

Phase 0 in progress. Run instructions land with it.

## License

MIT
