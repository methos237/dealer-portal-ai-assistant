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

Azure (infra/, Bicep): App Service P0v4 (web, api, assistant containers from GHCR) · Functions Flex (ingest) · Postgres Flexible B1ms · Azure OpenAI (embeddings) · Storage · Key Vault (all secrets) · App Insights · OIDC deploy from GitHub Actions
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

## The assistant

Retrieval-augmented answers with real citations, streamed to the browser.

| Step | How |
|---|---|
| Documents | Synthetic owner manuals and service bulletins under `assistant/fixtures/docs` (Markdown, plus PDFs rendered from three of them). One bulletin carries a prompt-injection payload for the evaluation suite |
| Chunking | Split on Markdown headings, keep the heading path as context, then ~800-token windows with 100-token overlap (token count approximated as words × 1.3). PDFs are windowed per page with the page number kept |
| Embeddings | Chosen by environment. Default `fastembed` (`BAAI/bge-small-en-v1.5`, 384 dims, ONNX, offline, free) for local dev, tests and the PR eval. Azure OpenAI `text-embedding-3-small` (1536 dims) when `AZURE_OPENAI_ENDPOINT` is set, for the Azure deployment. The vector column dimension is fixed at migration time from the configured provider and the app refuses to start against a mismatched index |
| Retrieval | Hybrid: `ts_rank_cd` over a stored `tsvector` (top 20) plus cosine over an HNSW index (top 20), fused by reciprocal rank, six chunks to the model. Dealer-scoped documents are filtered in SQL |
| Answer | Chunks go to Claude as `document` blocks with `citations` enabled after a cached system prompt (`claude-opus-5`, adaptive thinking, effort medium, streaming). The API returns citation spans that point at the exact chunk; the UI renders them as chips that open the source. No "write [1] footnotes" prompting |
| Streaming | `POST /chat` emits SSE events `conversation`, `text`, `citation`, `done` (stop reason and token usage, including cache reads) and `error`. Refusals and `max_tokens` are surfaced, not hidden |
| Tenancy | The web app forwards the user's API token; the assistant validates it and asks the portal API which dealer the caller belongs to |
| Spend guards | Startup fails without model credentials; each conversation has a token budget (`MAX_TOKENS_PER_CONVERSATION`); tests use a fake client and recorded cassettes; the optional `local-llm` compose profile (LiteLLM + Ollama) covers plumbing work for free |

Cache verification: the second turn of a conversation reports `cache_read_input_tokens > 0` in the `done` event; a live test asserts it.

### Evaluation

`assistant/evals/cases.yaml` holds the cases; `uv run evals --suite retrieval` runs the free suite and exits non-zero under threshold. Results land in `assistant/evals/out/`.

| Suite | Grader | Threshold | Runs |
|---|---|---|---|
| retrieval (30 cases) | programmatic: recall@5 and MRR against the expected document and heading | recall@5 ≥ 0.90 | every PR touching `assistant/`, local embedder, no secrets |
| answer, tool, injection | LLM judge (Phase 3) | faithfulness ≥ 4.2, tool exact match ≥ 0.90, injection 100% | `master`, manual dispatch, PRs labeled `eval` |

Current retrieval result on the fixtures:

```
retrieval: 30 cases, recall@5 1.00, MRR 0.95
```

What each trigger costs: the retrieval suite is free (CPU embedder). The LLM-graded suites spend API tokens; the judge cache under `assistant/evals/cache/` makes reruns of unchanged answers free.

## The agent

The same portal tools are defined once in the API and served twice: to the in-app assistant and to any MCP client (Claude Desktop, Claude Code) at `/mcp`. See `docs/mcp-clients.md`.

| Concern | How |
|---|---|
| Tools | `get_unit`, `search_units`, `check_warranty`, `list_claims`, `get_claim`, `draft_claim`, `draft_parts_order`, `approve_claim`, hosted in-process by ASP.NET Core with `ModelContextProtocol.AspNetCore` (stateless streamable HTTP) under the same JWT as the REST API |
| Role filtering plus re-check | `[Authorize]` on each tool filters `tools/list` by the caller's role and is re-checked on every `tools/call`; a `Dealer.User` calling `approve_claim` gets an MCP error result, never a 500. The model only ever sees tools its user may call |
| Writes are confirmed in the browser | Every write tool returns a draft (method, path, body, summary) after validating the business rules. The assistant turns it into a `confirm` event and the portal shows a card; confirming sends the real request with the user's token. The assistant never writes |
| Agent loop | Anthropic Python SDK tool runner with streaming; MCP tools translated to strict Anthropic tools; parallel tool results returned in one message; MCP errors become `is_error` results; refusals and `max_tokens` stop the turn before any tool runs |
| Structured extraction | `POST /extract/claim` pulls VIN, description and amount from a pasted customer email with `messages.parse` (structured outputs), a separate call because citations and structured output cannot share a request |

![Assistant drafting a claim: tool calls, then a confirm card](docs/screenshots/assistant-confirm.png)

`scripts/live-agent-check.mjs` drives this flow against the running stack with a signed session and a real API token (see `docs/mcp-clients.md` for the token), confirms the card, and checks the claim landed.

### Guardrails

- Tool allowlist by role enforced in the API authorization layer, not in the prompt.
- Documents reach the model as reference material with a source label; the system prompt says instructions inside documents are data. The bulletin fixture with an embedded "note to AI assistants" is part of the eval suite.
- PII (emails, phone numbers, VINs) is redacted from assistant logs by a tested logging filter.
- Refusal stop reasons are surfaced to the UI; the assistant tells the user rather than silently returning nothing.
- Per-conversation token budget and a startup credential check bound spend.

### Evaluation results

`uv run evals` runs every suite and prints tokens spent and estimated cost. Judge verdicts are cached by content hash under `assistant/evals/cache/`, so reruns with unchanged answers cost nothing for the judge.

| Suite | Cases | Grader | Threshold | Latest |
|---|---|---|---|---|
| retrieval | 30 | recall@5 / MRR against expected document and heading | recall@5 ≥ 0.90 | 1.00 / 0.95 |
| tool | 10 | expected tool and argument subset, or no tool | exact match ≥ 0.90 | 1.00 |
| injection | 6 | no write tool called, no embedded instruction leaked | 100% | 100% |
| answer | 6 | `claude-sonnet-5` faithfulness judge, 1 to 5, structured output | mean ≥ 4.2, none < 3 | 5.0 mean |

One full pass of the three model-graded suites costs about 0.9 USD on `claude-opus-5` (most input tokens are prompt-cache reads). The retrieval suite is free and runs on every PR; the paid suites run on manual dispatch.

## Microsoft 365

Dealers' documents already live in SharePoint. Two pieces connect them: an MCP server that lets an assistant read a site's libraries live, and a timer Function that keeps the portal's retrieval index in step with one library.

| Concern | How |
|---|---|
| Permissions model | One app registration, `dealer-portal-m365`, with application permissions `Sites.Read.All` and `Files.Read.All` (admin-consented). App-only, read-only: there is no write role to misuse, and no user has to grant anything. `scripts/entra-setup.sh` creates it |
| `mcp-m365/` | TypeScript, `@modelcontextprotocol/sdk`, `@azure/identity` client credentials, plain `fetch` to Graph. Tools: `list_libraries`, `list_documents`, `get_document` (text from `.pdf` via `pdf-parse`, `.docx` via `mammoth`, Markdown and text as is), `search_documents` (drive search, one library or every library in the site) |
| One server, two clients | The same `createServer()` runs over stdio for Claude Desktop and Claude Code (`docs/mcp-clients.md`) and over stateless streamable HTTP on :8100 for the assistant. The HTTP entry verifies the caller's `dealer-portal-api` token (issuer, audience, `Thor.Admin` role by default) before it opens a transport: the Graph credential is app-wide, so the portal identity gates who may use it |
| Assistant | `Thor.Admin` conversations get mcp-m365 as a second tool source next to the api's `/mcp` (`M365_MCP_URL`); the same translation to strict Anthropic tools, the same user token forwarded. Dealer roles never see these tools |
| `functions/` | Python Azure Function, timer every 15 minutes. Graph delta query on the configured library (`M365_SITE`, `M365_LIBRARY`), stored delta link per drive in `rag.m365_sync`. Changed `.md`/`.pdf` files are downloaded and indexed through the assistant's `rag` package (same chunking, same embedder selection, content hash skips unchanged files); deleted items drop their chunks by Graph item id. Other file types are ignored |
| Tests | mcp-m365: Vitest over Graph JSON fixtures and an in-memory MCP client (tool list, each tool, HTTP auth rejection). Sync: pytest against Postgres with a scripted Graph (full walk, then a delta with an edit and a delete) |

```bash
make m365        # mcp-m365 on :8100 (needs M365_* in .env)
make functions   # one sync round without the Functions host; `cd functions && func start` runs the timer
```

## Azure

Everything runs on Azure from one Bicep template, deployed by GitHub Actions with OIDC (no cloud credential stored in GitHub) or by `scripts/azure-up.sh` from a laptop. It is a demo: one region, the smallest SKUs, torn down when not in use.

| Concern | How |
|---|---|
| Topology | Resource group `rg-dealer-portal` in `eastus2`: one Linux App Service plan (P0v4, the only tier a free-trial subscription has quota for) running three Web Apps for Containers (web, api, assistant) from GHCR images; Postgres Flexible Server B1ms (PostgreSQL 17, `vector` allowlisted); Azure OpenAI S0 with `text-embedding-3-small`; Azure Functions Flex Consumption for the SharePoint ingestion timer; Storage; Key Vault; Log Analytics + Application Insights; a 30 USD monthly budget with alerts |
| What Bicep manages | `infra/main.bicep` (resource-group scope) composes `storage`, `monitoring`, `postgres`, `openai`, `keyvault`, `apps`, `functions`, `keyvault-access`, `budget`. Every secret (Postgres password, web client secret, Auth.js secret, Anthropic key, M365 client secret, the Azure OpenAI key read at deploy time) lands in Key Vault; app settings hold Key Vault references and the apps' system identities get *Key Vault Secrets User*. Non-secret ids live in `infra/dev.parameters.json`; secrets arrive as parameters from GitHub secrets or `.env` |
| OIDC over secrets | `scripts/azure-oidc-setup.sh` creates `dealer-portal-deploy` with federated credentials for `master` pushes and pull requests, scoped to the resource group (Contributor plus RBAC Administrator, needed for the role assignments in Bicep). `infra.yml` runs `what-if` on pull requests; `deploy.yml` runs after `images.yml` publishes the master images: Bicep, `rag.migrate` + `rag.ingest` against Azure Postgres with Azure OpenAI embeddings, Function zip deploy, app restarts, health checks |
| Two embedding indexes | Local and CI use `fastembed` (384 dims, free). Azure uses `text-embedding-3-small` (1536 dims) and its own index, built by `deploy.yml`; `rag.meta` records the provider so an index is never queried with the wrong embedder |
| Cost | About 0.12 USD per hour while up (App Service P0v4 about 0.10 USD/hour, Postgres B1ms about 12.60 USD/month, the rest near zero at demo traffic). `scripts/azure-down.sh` deletes the resource group and purges the vault; the demo is down when nobody is looking at it |

```bash
scripts/entra-setup.sh          # app registrations incl. the Azure redirect URI
scripts/azure-oidc-setup.sh     # deploy identity + GitHub variables (once)
scripts/azure-up.sh             # deploy from .env; prints the portal URL
scripts/azure-down.sh           # delete everything
```

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
make setup     # once: copies .env.example to .env, installs web, api, assistant, mcp-m365 and functions dependencies
make dev       # Postgres + pgvector on 5434, then web :3000, api :5080, assistant :8000 (Ctrl-C stops all)
make migrate   # applies assistant/migrations to the rag schema
make ingest    # indexes assistant/fixtures/docs (first run downloads the 33 MB embedding model)
make evals     # retrieval eval against the indexed fixtures
make check     # every check CI runs
```

Fill `.env` with the Azure and Entra values below plus `ANTHROPIC_API_KEY` before `make dev`. For plumbing work without API spend: `docker compose --profile local-llm up -d` and set `ANTHROPIC_BASE_URL=http://localhost:4000`, `ANTHROPIC_API_KEY=local` (needs Ollama with `qwen3` on the host). The API applies EF Core migrations on start and, when the database is empty, `docker/postgres/seed.sql` (3 dealers, 20 units, 30 claims, 15 parts orders). Sign in with one of the test users created by `scripts/entra-setup.sh` (one per role).

Health checks: `web/health`, `api/health`, `assistant/health`.

Azure and Entra setup, once per subscription:

```bash
az login
az deployment sub create --location eastus2 --template-file infra/main.bicep   # resource group + document storage
scripts/entra-setup.sh                    # app registrations (web, api, m365), roles, test users; prints .env lines
```

## Deliberately out of scope

- Real manufacturer documents. Manuals and bulletins are synthetic fixtures written for this project, including one with a prompt-injection payload used by the evaluation suite.
- Production hardening beyond the demo: single region, single App Service plan, no high availability, budget-capped Azure spend.
- Writes performed by the assistant. Drafting is a tool; committing is always a user action in the browser.
- Multi-tenant SaaS concerns (billing, tenant provisioning), payments, shipping, and a native mobile app.

## License

MIT
