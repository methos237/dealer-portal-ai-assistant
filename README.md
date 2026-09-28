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

## The portal

Dealers sign in with their Microsoft Entra ID work account. The web app requests a token for the portal API, and every API call carries that token; the API enforces tenancy and roles, never the UI.

| Role | Sees | Can do |
|---|---|---|
| `Dealer.User` | Own dealer's units, claims, parts orders, all documents | File claims and parts orders |
| `Dealer.Admin` | Same as `Dealer.User` | Same, plus dealer administration (later phase) |
| `Thor.Admin` | Every dealer | Approve claims over the threshold; cannot file claims (no dealer context) |

| Rule | Behaviour |
|---|---|
| Tenancy | Every unit, claim and parts order carries `dealer_id`; EF Core global query filters scope reads to the caller's dealer, so another dealer's unit is a 404 |
| Warranty window | A claim needs a unit delivered within the last 36 months, otherwise 422 |
| Approval threshold | A claim over 5,000.00 lands in `PendingApproval`; only `Thor.Admin` can approve it |
| Parts catalog | A parts order with an unknown SKU is rejected with a validation problem listing the SKUs |
| Money | `numeric(12,2)` in Postgres, `decimal` in .NET |
| Errors | 401, 403, 404, 409, 422 and validation failures are RFC 9457 problem details |

The web app is an installable PWA. A claim drafted while offline is stored in IndexedDB and sent automatically when the connection returns.

![Dashboard](docs/screenshots/dashboard.png)

![Claims](docs/screenshots/claims.png)

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
make setup     # once: copies .env.example to .env, installs web, api and assistant dependencies
make dev       # Postgres + pgvector on 5434, then web :3000, api :5080, assistant :8000 (Ctrl-C stops all)
make migrate   # applies assistant/migrations to the rag schema
make check     # every check CI runs
```

Fill `.env` with the Azure and Entra values below before `make dev`. The API applies EF Core migrations on start and, when the database is empty, `docker/postgres/seed.sql` (3 dealers, 20 units, 30 claims, 15 parts orders). Sign in with one of the test users created by `scripts/entra-setup.sh` (one per role).

Health checks: `web/health`, `api/health`, `assistant/health`.

Azure and Entra setup, once per subscription:

```bash
az login
az deployment sub create --location eastus2 --template-file infra/main.bicep   # resource group + document storage
scripts/entra-setup.sh                    # app registrations, roles, test users; prints .env lines
```

## Deliberately out of scope

- Real manufacturer documents. Manuals and bulletins are synthetic fixtures written for this project, including one with a prompt-injection payload used by the evaluation suite.
- Production hardening beyond the demo: single region, single App Service plan, no high availability, budget-capped Azure spend.
- Writes performed by the assistant. Drafting is a tool; committing is always a user action in the browser.
- Multi-tenant SaaS concerns (billing, tenant provisioning), payments, shipping, and a native mobile app.

## License

MIT
