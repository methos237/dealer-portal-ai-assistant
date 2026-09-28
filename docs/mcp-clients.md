# Using the portal tools from Claude Desktop and Claude Code

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

## 2. Claude Code

```bash
claude mcp add --transport http dealer-portal http://localhost:5080/mcp \
  --header "Authorization: Bearer $PORTAL_TOKEN"
```

Then in a session: "Use dealer-portal to look up unit 1THRA24X0RN000001." Remove with `claude mcp remove dealer-portal`.

## 3. Claude Desktop

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

Restart Claude Desktop. The tools panel lists `get_unit`, `search_units`, `check_warranty`, `list_claims`, `get_claim`, `draft_claim`, `draft_parts_order`, and `approve_claim` for `Thor.Admin`. Ask "Is unit 1THRA24X0RN000001 still under warranty?" and Claude calls `check_warranty`.

![Claude Desktop listing the portal tools](screenshots/claude-desktop-tools.png)

## What you cannot do from an MCP client

Write tools return drafts. `draft_claim` validates the unit and warranty window and returns the request the portal would send; nothing is saved. Filing, ordering and approving happen only when a signed-in user confirms in the portal, with their own token.
