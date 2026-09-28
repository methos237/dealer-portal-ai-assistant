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

## Architecture

```
Browser (Next.js, PWA)
  │ Entra ID sign-in (Auth.js)          user bearer token on every call
  ├──────────────► api  (ASP.NET Core)  /dealers /units /claims /parts-orders /documents
  │                 └── /mcp  (MCP streamable HTTP, same JWT, tools filtered by role)
  │                        ▲                           ▲
  └──────────────► assistant (FastAPI)                 │  Claude Desktop / Claude Code
        SSE stream   │  hybrid retrieval (pgvector + tsvector)   (stdio or HTTP MCP client)
                     │  Claude tool runner ── tools from /mcp ───┘
                     │  citations from document blocks
                     │  evals (CI gate)
                     ▼
              Postgres 17 + pgvector  (schemas: portal, rag)

mcp-m365 (TypeScript)  ── Microsoft Graph ──► SharePoint document libraries
                        ── Power BI REST   ──► Fabric semantic model (DAX)
functions/ingest (Python, timer)  ── Graph delta ──► chunk, embed, upsert rag.chunks

Azure: App Service (web, api, assistant) · Functions · Postgres Flexible · Azure OpenAI · Storage · Key Vault · App Insights · Bicep
```

The browser talks to the assistant with the user's own Entra token. The assistant retrieves chunks, calls Claude with a cached system prompt, the tool list and document blocks, and streams text and citation events. Tool calls go to the API's `/mcp` endpoint with the same token, so authorization is enforced in the API, never in the prompt. A `draft_*` tool result becomes a confirmation card, and the browser posts the actual write to the API itself. The assistant never writes.

## Prerequisites

| Tool | Version | Used by |
|---|---|---|
| Node.js | 26 | `web/`, `mcp-m365/` |
| .NET SDK | 10 | `api/` |
| uv | 0.12+ (installs Python 3.13) | `assistant/`, `functions/` |
| Docker | 29 | Postgres with pgvector |
| Azure CLI + Bicep | 2.90+ / 0.47+ | `infra/`, Entra app registrations |
| Azure Functions Core Tools | 4 | `functions/` local run |

An Azure subscription and an Entra ID tenant are needed for sign-in and deployment. Everything else runs locally.

## Running locally

```bash
cp .env.example .env                      # fill in Azure and Entra values, see below
docker compose up -d                      # Postgres + pgvector on localhost:5434

cd web && npm install && npm run dev      # http://localhost:3000
cd api && dotnet run --project src/DealerPortal.Api   # http://localhost:5080
cd assistant && uv sync && uv run python -m rag.migrate && uv run fastapi dev   # http://localhost:8000
```

Health checks: `web/health`, `api/health`, `assistant/health`.

Azure and Entra setup, once per subscription:

```bash
az login
az deployment sub create --location eastus2 --template-file infra/main.bicep   # resource group + document storage
scripts/entra-setup.sh                    # app registrations, roles, test users; prints .env lines
```

Checks that CI runs, per component:

```bash
cd web && npm run lint && npm run typecheck && npm run format:check && npm test
cd api && dotnet format --verify-no-changes && dotnet test
cd assistant && uv run ruff format --check && uv run ruff check && uv run pytest -m "not live"
az bicep build --file infra/main.bicep
```

## Deliberately out of scope

- Real manufacturer documents. Manuals and bulletins are synthetic fixtures written for this project, including one with a prompt-injection payload used by the evaluation suite.
- Production hardening beyond the demo: single region, single App Service plan, no high availability, budget-capped Azure spend.
- Writes performed by the assistant. Drafting is a tool; committing is always a user action in the browser.
- Multi-tenant SaaS concerns (billing, tenant provisioning), payments, shipping, and a native mobile app.

## License

MIT
