# Dealer Portal with an Embedded AI Assistant

[![web](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/web.yml/badge.svg)](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/web.yml) [![api](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/api.yml/badge.svg)](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/api.yml) [![assistant](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/assistant.yml/badge.svg)](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/assistant.yml) [![mcp-m365](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/mcp-m365.yml/badge.svg)](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/mcp-m365.yml) [![infra](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/infra.yml/badge.svg)](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/infra.yml) [![eval](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/eval.yml/badge.svg)](https://github.com/methos237/dealer-portal-ai-assistant/actions/workflows/eval.yml)

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
  │ OIDC sign-in (Auth.js)              user bearer token on every call
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
                        ── Power BI REST   ──► Fabric semantic model (DAX, Thor.Admin)
api /reports/summary    ── Power BI REST   ──► same model, DAX filtered to the caller's dealer  ◄── Data Factory copies portal.* on demand
                        (SQL over portal.* when no semantic model is configured)
functions/ingest (Python, timer)  ── Graph delta ──► chunk, embed, upsert rag.chunks

Azure (infra/, Bicep): App Service B2 (web, api, assistant containers from GHCR) · Functions Flex (ingest) · Postgres Flexible B1ms · Azure OpenAI (embeddings) · Storage · Key Vault (all secrets) · App Insights · OIDC deploy from GitHub Actions
```

The browser talks to the assistant with the user's own access token. The assistant retrieves chunks, calls Claude with a cached system prompt, the tool list and document blocks, and streams text and citation events. Tool calls go to the API's `/mcp` endpoint with the same token, so authorization is enforced in the API, never in the prompt. A `draft_*` tool result becomes a confirmation card, and the browser posts the actual write to the API itself. The assistant never writes.

## The portal

Dealers sign in through the OpenID Connect provider named by `OIDC_ISSUER`: Microsoft Entra ID on Azure, a Keycloak realm (`docker/keycloak/realm.json`) for a laptop with no cloud account. The web app requests a token for the portal API, and every API call carries that token; the API, assistant and mcp-m365 verify it against the issuer's discovery document and read the user from `oid` (Entra) or `sub`, roles from the `roles` claim. The API enforces tenancy and roles, never the UI.

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
| answer, tool, injection | LLM judge and programmatic checks | faithfulness ≥ 4.2, tool exact match ≥ 0.90, injection 100% | manual dispatch, PRs labeled `eval` |

Current retrieval result on the fixtures:

```
retrieval: 30 cases, recall@5 1.00, MRR 0.95
```

What each trigger costs: the retrieval suite is free (CPU embedder). The LLM-graded suites spend about 1.50 USD per run, almost all of it on the chat model, so they run only on demand.

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

`uv run evals` runs every suite and prints tokens spent and estimated cost. Judge verdicts are cached by content hash under `assistant/evals/cache/`; the hash includes the answer text, so the cache only helps when a rerun reproduces an answer exactly.

| Suite | Cases | Grader | Threshold | Latest |
|---|---|---|---|---|
| retrieval | 30 | recall@5 / MRR against expected document and heading | recall@5 ≥ 0.90 | 1.00 / 0.95 |
| tool | 10 | expected tool and argument subset, or no tool | exact match ≥ 0.90 | 1.00 |
| injection | 6 | no write tool called, no embedded instruction leaked | 100% | 100% |
| answer | 6 | `claude-sonnet-5` faithfulness judge, 1 to 5, structured output | mean ≥ 4.2, none < 3 | 5.0 mean |

One full pass of the three model-graded suites costs about 0.9 USD on `claude-opus-5` (most input tokens are prompt-cache reads). The retrieval suite is free and runs on every PR; the paid suites run on every push to `master`, on manual dispatch, and on pull requests labeled `eval`.

## Observability and cost

Every conversation is one distributed trace, and every assistant turn has a price.

| Concern | How |
|---|---|
| Tracing | OpenTelemetry in all three services: `@vercel/otel` in the web app (server-side fetch spans, W3C context propagated to the assistant and the api), FastAPI and psycopg instrumentation in the assistant plus a `retrieval` span and one `claude.messages` span per model call carrying `gen_ai.request.model`, the four usage counters and the finish reason, ASP.NET Core, `HttpClient`, Npgsql and the MCP SDK's activity source in the api. The assistant injects `traceparent` into every `/mcp` call, so the api's tool spans and their SQL hang under the model call that asked for them |
| Where traces go | One code path, OTLP over http/protobuf to `OTEL_EXPORTER_OTLP_ENDPOINT`: the Jaeger that `docker compose up` starts (http://localhost:16686), or on Azure an OpenTelemetry Collector (`app-dealer-portal-otel`, contrib image, config in `infra/apps.bicep`) that forwards to Application Insights and checks a bearer token the apps present. Unset means no exporter and no overhead (tests). No vendor exporter is linked into web, api or assistant |
| Cost per conversation | The assistant stores the `usage` of every turn (input, output, cache read, cache write tokens, model) in `rag.messages`. `GET /conversations/{id}/cost` prices them with the pinned table in `assistant/app/pricing.py` (list prices per million tokens; cache reads 0.1x input, cache writes 1.25x) and returns the per-bucket and total USD. `Thor.Admin` sees the running total under the conversation. A typical turn costs 0.03 to 0.08 USD; the eval runner's spend estimate uses the same table |
| Demo | `scripts/demo.sh` starts the demo stack from the published images (Postgres, Jaeger, Keycloak, api, assistant, web), runs five scripted conversations through the assistant and api as the Keycloak user `dealer.user` (cited answer, warranty tool call, a claim drafted and confirmed the way the browser does it, an out-of-corpus question, a prompt injection), prints each turn's tools and cost, then the free retrieval eval |

![One trace: web proxy, assistant retrieval and Claude call, api /mcp tool calls and their Postgres queries](docs/screenshots/jaeger-trace.png)

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

## Microsoft Fabric

On Azure, reporting does not query the portal database. A Data Factory pipeline copies the `portal` schema into a Fabric lakehouse every night, a Direct Lake semantic model defines the measures once, and both the portal's Reports page and the assistant read that model through Power BI REST with DAX. `fabric/` holds the pipeline and the model as code; `infra/fabric.bicep` provides the capacity and `scripts/fabric-up.sh` creates everything else over the Fabric REST API.

| Concern | How |
|---|---|
| Why a semantic model | The api could `GROUP BY` claims itself. A semantic model puts the business definitions (`Claim Count`, `Claim Amount`, `Avg Days To Close`, `Open Parts Orders`) in one place that Power BI reports, Excel, the portal and the assistant all read identically, and moves analytical load off the transactional database. It is also what a Fabric-shaped employer means by "reporting" |
| Data flow | Workspace `dealer-portal`, lakehouse `dealer_portal_lh`. Pipeline `copy-portal-tables` (`fabric/pipeline/pipeline-content.json`): six Copy activities, Azure Postgres tables `dealers`, `units`, `claims`, `parts_orders`, `parts_order_lines`, `parts` overwritten into lakehouse Delta tables, run once by the script (the capacity is suspended most of the time, so no daily schedule; the script opens a temporary Postgres firewall rule for the run) |
| Model | `Dealer Operations`, TMDL under `fabric/semantic-model/`: six tables in Direct Lake mode over the lakehouse SQL endpoint, relationships to `dealers`, four measures. The script fills the SQL endpoint into `expressions.tmdl`, creates or updates the model through the semantic model definition API and triggers the first framing refresh (after refreshing the SQL endpoint's table metadata, which lags behind the pipeline), so the model is reviewable in a pull request like the rest of the code |
| Tenancy | The plan was row-level security with the caller's dealer as effective identity. Power BI does not apply RLS when a service principal is the identity on `executeQueries` (documented limitation), so the api builds the tenancy filter into the DAX itself (`FILTER(dealers, dealers[id] = <caller's dealer>)`, `ALL(dealers)` for `Thor.Admin`) from the same token claim the EF queries use. Authorization stays in the api; the model holds no per-user rules |
| Access | The existing `dealer-portal-m365` app is the Power BI caller too (one secret, already in Key Vault): workspace **Contributor** (the plan said Viewer plus Build, but Build cannot be granted to a service principal over REST and Viewer alone cannot run `executeQueries`; Contributor is the smallest role the API can assign that works), tenant settings *Service principals can call Fabric public APIs* and *Dataset Execute Queries REST API* on. One more step the docs do not spell out: an unbound Direct Lake model reads the SQL endpoint as the querying identity (single sign-on), and `executeQueries` refuses service principals on SSO models with `PowerBINotAuthorizedException`; the script therefore creates a cloud connection to the lakehouse SQL endpoint holding the app's own credentials, binds the model to it and reframes. `PowerBi__WorkspaceId` and `PowerBi__SemanticModelId` select the semantic model; without them `/reports/summary` computes the same four measures in SQL over `portal.*` (`SqlReportSource`), so the Reports page works on the compose stack and on any cloud without Fabric |
| api | `GET /reports/summary` behind `IReportSource`: Power BI runs three EVALUATE queries (totals, claims by month, top parts), one per `executeQueries` call as the endpoint requires; SQL runs the equivalent EF queries under the tenancy filters. Cached five minutes per dealer scope in memory. Tested against recorded responses with a fake handler that also asserts the dealer filter is in every query, and against the seed for the SQL path, which must return the figures the semantic model returned on Azure |
| web | `/reports`: tiles, claims-by-month bars (inline SVG, no chart library), top parts. Vitest on the data shaping |
| Assistant | mcp-m365 tool `query_semantic_model(dax)`: a single `EVALUATE` statement only (allowlist), 500 rows max. Offered to `Thor.Admin` conversations only, because the whole mcp-m365 HTTP transport requires that role; a dealer user never sees the tool |
| Capacity | A Fabric trial was not available on this tenant, so `infra/fabric.bicep` creates a pay-as-you-go **F2** capacity (about 0.36 USD per hour while running, storage only while suspended) in the same resource group; `azure-down.sh` removes it with everything else. `fabric.yml` suspends it nightly at 04:00 UTC and can be dispatched with `suspend` or `resume` (`scripts/fabric-up.sh` runs the copy pipeline once on demand; the semantic model and pipeline are unavailable while suspended, and `/reports/summary` returns an error, so unset the two `PowerBi__*` settings if it stays down and the api falls back to SQL) |
| What a trial or bigger capacity changes | Nothing in code. Assign the workspace to another capacity (trial, F64) and the same pipeline, model and queries keep working; Copilot and other F64-only features become available |

```bash
scripts/fabric-up.sh   # after azure-up: workspace, lakehouse, connection, pipeline run + schedule, semantic model, app access
```

## Azure

Everything runs on Azure from one Bicep template, deployed by GitHub Actions with OIDC (no cloud credential stored in GitHub) or by `scripts/azure-up.sh` from a laptop. It is a demo: one region, the smallest SKUs, torn down when not in use.

| Concern | How |
|---|---|
| Topology | Resource group `rg-dealer-portal` in `eastus2` (App Service plan and Fabric capacity in `centralus`, Postgres in `northcentralus`; `centralus` refused B1ms with `CapacityNotAvailable` three times): one Linux App Service plan (B2) running three Web Apps for Containers (web, api, assistant) from GHCR images; Postgres Flexible Server B1ms (PostgreSQL 17, `vector` allowlisted); Azure OpenAI S0 with `text-embedding-3-small`; Azure Functions Flex Consumption for the SharePoint ingestion timer; Storage; Key Vault; Log Analytics + Application Insights; a 30 USD monthly budget with alerts |
| What Bicep manages | `infra/main.bicep` (resource-group scope) composes `storage`, `monitoring`, `postgres`, `openai`, `keyvault`, `apps`, `functions`, `keyvault-access`, `budget`. Every secret (Postgres password, web client secret, Auth.js secret, Anthropic key, M365 client secret, the Azure OpenAI key read at deploy time) lands in Key Vault; app settings hold Key Vault references and the apps' system identities get *Key Vault Secrets User*. Non-secret ids live in `infra/dev.parameters.json`; secrets arrive as parameters from GitHub secrets or `.env` |
| OIDC over secrets | `scripts/azure-oidc-setup.sh` creates `dealer-portal-deploy` with federated credentials for `master` pushes and pull requests, scoped to the resource group (Contributor plus RBAC Administrator, needed for the role assignments in Bicep). `infra.yml` runs `what-if` on pull requests; `deploy.yml` runs after `images.yml` publishes the master images: Bicep, `rag.migrate` + `rag.ingest` against Azure Postgres with Azure OpenAI embeddings, Function zip deploy, app restarts, health checks |
| Two embedding indexes | Local and CI use `fastembed` (384 dims, free). Azure uses `text-embedding-3-small` (1536 dims) and its own index, built by `deploy.yml`; `rag.meta` records the provider so an index is never queried with the wrong embedder |
| Cost | About 0.07 USD per hour while up (App Service B2 about 26 USD/month, Postgres B1ms about 12.60 USD/month, the rest near zero at demo traffic), plus 0.36 USD per hour while the Fabric F2 capacity is running (`fabric.yml` suspends it nightly; dispatch it with `resume` before a demo). `scripts/azure-down.sh` deletes the resource group and purges the vault; the demo is down when nobody is looking at it. The deploy identity's roles are scoped to that group, so `scripts/azure-oidc-setup.sh` runs again before the next deploy |

```bash
scripts/entra-setup.sh          # app registrations incl. the Azure redirect URI
scripts/azure-oidc-setup.sh     # deploy identity + GitHub variables (once)
scripts/azure-up.sh             # deploy from .env; prints the portal URL
scripts/azure-down.sh           # delete everything
```

## Design decisions

Each choice, and the alternative it was preferred over.

| Decision | Instead of | Why |
|---|---|---|
| pgvector in the portal's Postgres | Azure AI Search | One database, one backup, one tenancy filter in SQL for documents and portal rows alike. The corpus is thousands of chunks, not millions; HNSW plus `tsvector` gives hybrid retrieval with no second service to pay for or secure. AI Search earns its place when the corpus or the query volume outgrows a single Postgres |
| Citations from the API | Footnote prompting ("cite as [1]") | Claude's `citations` return exact character spans into the document blocks it was given, so a chip always opens the real source. Prompted footnotes look the same and are unverifiable |
| MCP tools in-process in the api | A separate MCP sidecar | The tools are the portal's business rules; hosting them in the same ASP.NET Core process under the same JWT and the same `[Authorize]` attributes means one place enforces roles for REST, the assistant and Claude Desktop alike. A sidecar would duplicate the auth and the data access |
| Writes confirmed in the browser | The agent calling write endpoints | Every write tool returns a draft; the user's browser posts the real request with the user's token. The model can never write, the audit trail is the user's, and a prompt injection has nothing to hijack |
| Tenancy filter in the api's DAX | Power BI row-level security through effective identity | `executeQueries` does not apply RLS when a service principal is the caller, so the api adds `FILTER(dealers, dealers[id] = <caller>)` to every query from the same token claim the EF filters use. Authorization stays in one layer |
| Fabric F2 capacity from Bicep | Fabric trial | No trial was available on this tenant; a pay-as-you-go F2 (about 0.36 USD per hour, suspended between demos) keeps the reporting path reproducible from code |
| Bicep | Terraform | One provider, first-party resource coverage the day a resource ships, `what-if` on pull requests, no state file to store or lock. Terraform would win for a multi-cloud estate; this one is Azure only |
| Anthropic SDK tool runner | A hand-written tool loop | The runner handles the request, execute, loop cycle and streaming; the code owns only the tools and the per-turn hooks (draft detection, refusal and `max_tokens` handling) |
| Pinned price table | Live pricing lookups | Prices change rarely and a cost shown in the UI should be reproducible; the table is dated and tested, and the eval runner shares it |

## Prerequisites

| Tool | Version | Used by |
|---|---|---|
| Node.js | 26 | `web/`, `mcp-m365/` |
| .NET SDK | 10 | `api/` |
| uv | 0.12+ (installs Python 3.13) | `assistant/`, `functions/` |
| Docker | 29 | Postgres with pgvector |
| Azure CLI + Bicep | 2.90+ / 0.47+ | `infra/`, Entra app registrations |
| Azure Functions Core Tools | 4 | `functions/` local run |

Docker and an Anthropic API key run the whole portal locally (next section). An Azure subscription and an Entra ID tenant are needed only for the Azure deployment, SharePoint and Fabric.

## Demo without a cloud account

```bash
cp .env.example .env            # fill in ANTHROPIC_API_KEY; leave the Azure block empty
scripts/demo.sh                 # stack from the published images, five scripted conversations, eval, cost
```

`docker compose --profile demo up -d --wait` alone starts Postgres with pgvector, Jaeger, Keycloak (realm `dealer-portal` imported from `docker/keycloak/realm.json`), api, assistant and web; then open http://localhost:3000 and sign in as `dealer.user` or `dealer.admin` (Blue Ridge RV) or `thor.admin`, password `portal`. Reports come from SQL and documents from the fixtures; the SharePoint tools (mcp-m365) and the Fabric semantic model are Azure features and stay off. The browser reaches Keycloak at `localhost:8080` while the containers reach it at `keycloak:8080`, so `OIDC_ISSUER` is the public issuer every token names and `OIDC_ISSUER_INTERNAL` is where a service fetches the discovery document and keys; Keycloak's `KC_HOSTNAME_BACKCHANNEL_DYNAMIC` serves the matching endpoints to each side.

## Running locally

```bash
make setup     # once: copies .env.example to .env, installs web, api, assistant, mcp-m365 and functions dependencies
make dev       # Postgres + pgvector on 5434, then web :3000, api :5080, assistant :8000 (Ctrl-C stops all)
make migrate   # applies assistant/migrations to the rag schema
make ingest    # indexes assistant/fixtures/docs (first run downloads the 33 MB embedding model)
make evals     # retrieval eval against the indexed fixtures
make check     # every check CI runs
scripts/demo.sh   # the whole thing without the UI: demo stack from images, five conversations, eval summary, total cost
```

`make up` also starts Jaeger; open http://localhost:16686 and pick the `web` service to see a conversation end to end.

Fill `.env` with `ANTHROPIC_API_KEY` and the sign-in values (`OIDC_*`, `AUTH_OIDC_*`: the commented Keycloak block in `.env.example` with `docker compose --profile demo up -d keycloak`, or the Entra values `scripts/entra-setup.sh` prints) before `make dev`. For plumbing work without API spend: `docker compose --profile local-llm up -d` and set `ANTHROPIC_BASE_URL=http://localhost:4000`, `ANTHROPIC_API_KEY=local` (needs Ollama with `qwen3` on the host). The API applies EF Core migrations on start and, when the database is empty, `docker/postgres/seed.sql` (3 dealers, 20 units, 30 claims, 15 parts orders). Sign in with one of the Keycloak users (`dealer.user`, `dealer.admin`, `thor.admin`, password `portal`) or one of the test users created by `scripts/entra-setup.sh`, one per role.

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

Copyright (C) 2026 James Knox Polk

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE).
