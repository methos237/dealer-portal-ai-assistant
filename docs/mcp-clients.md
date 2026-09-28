# Using the portal tools from Claude Code and Claude Desktop

The API serves its tools over the Model Context Protocol at `http://localhost:5080/mcp` (streamable HTTP). The same tools power the in-app assistant. Any MCP client can use them with a user token for the `dealer-portal-api` app; the API filters `tools/list` by the caller's role and re-checks every call.

## 1. Get a dev token

Azure CLI is pre-authorized on the API scope by `scripts/entra-setup.sh`, so a signed-in tenant user can mint a token:

```bash
az login --tenant <tenant-id> --scope "api://<api-client-id>/.default"   # once, interactive
export PORTAL_TOKEN=$(az account get-access-token --resource "api://<api-client-id>" --query accessToken -o tsv)
```

The account needs one of the app roles (`Dealer.User`, `Dealer.Admin`, `Thor.Admin`) and, for dealer roles, a row in `portal.app_users`. The seed maps the tenant owner to dealer 1. Tokens last about an hour.

Check it works:

```bash
curl -s http://localhost:5080/mcp -H "Authorization: Bearer $PORTAL_TOKEN" \
  -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 2. Claude Code (verified)

```bash
claude mcp add --transport http --scope local dealer-portal http://localhost:5080/mcp \
  --header "Authorization: Bearer $PORTAL_TOKEN"
claude mcp list          # dealer-portal: http://localhost:5080/mcp (HTTP) - ✔ Connected
```

`--scope local` keeps the token in your private `~/.claude.json` entry for this project; never put it in the committed `.mcp.json`. Rerun `claude mcp add` (after `claude mcp remove dealer-portal -s local`) when the token expires.

Headless check against the local API, as a `Dealer.User`:

```
$ claude -p "Use the dealer-portal MCP server: call check_warranty for VIN 1THRA24X2RN000001 \
    and report the result in two lines." --allowedTools mcp__dealer-portal__check_warranty
VIN 1THRA24X2RN000001 in warranty. Delivered 2025-09-28, ends 2028-09-28.
Months remaining: 24.
```

The same session lists `check_warranty`, `draft_claim`, `draft_parts_order`, `get_claim`, `get_unit`, `list_claims` and `search_units`; `approve_claim` appears only for `Thor.Admin` tokens. In an interactive session, `/mcp` shows the server and its tools.

## 3. Claude Desktop (not verified here)

Claude Desktop connects to remote servers through its Connectors UI (OAuth). For a bearer token in local development, bridge through `mcp-remote` in `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "dealer-portal": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "http://localhost:5080/mcp",
        "--header", "Authorization:${PORTAL_AUTH}",
        "--allow-http"
      ],
      "env": { "PORTAL_AUTH": "Bearer <paste token>" }
    }
  }
}
```

## 4. mcp-m365 (SharePoint) in Claude Desktop and Claude Code

`mcp-m365/` is the second server: it reads a SharePoint site's document libraries with an app-only Graph credential, so it needs the `M365_*` values from `scripts/entra-setup.sh` rather than a user token. Build once (`cd mcp-m365 && npm ci && npm run build`), then:

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dealer-portal-m365": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-m365/dist/stdio.js"],
      "env": {
        "M365_TENANT_ID": "<tenant id>",
        "M365_CLIENT_ID": "<dealer-portal-m365 app id>",
        "M365_CLIENT_SECRET": "<secret>",
        "M365_SITE": "yourtenant.sharepoint.com:/sites/dealer-docs"
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add --scope local dealer-portal-m365 \
  -e M365_TENANT_ID=... -e M365_CLIENT_ID=... -e M365_CLIENT_SECRET=... -e M365_SITE=... \
  -- node /absolute/path/to/mcp-m365/dist/stdio.js
```

Tools: `list_libraries`, `list_documents`, `get_document`, `search_documents`. All read-only; the app registration has no write permission.

## What you cannot do from an MCP client

Write tools return drafts. `draft_claim` validates the unit and warranty window and returns the request the portal would send; nothing is saved. Filing, ordering and approving happen only when a signed-in user confirms in the portal, with their own token.
