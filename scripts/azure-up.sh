#!/usr/bin/env bash
# Full deploy from a clean subscription, using the values in .env. Idempotent; rerun after changes.
#
#   scripts/azure-up.sh                 deploy infra, database, function code; print the portal URL
#   scripts/azure-up.sh --github-secrets   also push the .env values deploy.yml needs to the GitHub repo
#
# Requires: az login, docker images published to ghcr.io/methos237 (CI does this on master),
# Entra apps from scripts/entra-setup.sh, deploy identity from scripts/azure-oidc-setup.sh (for CI only).
# Cost while up: about 0.07 USD per hour (App Service B2 + Postgres B1ms). scripts/azure-down.sh removes it.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

RG=${AZURE_RESOURCE_GROUP:-rg-dealer-portal}
LOCATION=${AZURE_LOCATION:-eastus2}
TAG=${IMAGE_TAG:-latest}
log() { echo "==> $*" >&2; }

if [ "${1:-}" = "--github-secrets" ]; then
  log "pushing deploy variables and secrets to GitHub"
  gh variable set WEB_CLIENT_ID --body "$AUTH_MICROSOFT_ENTRA_ID_ID"
  gh variable set ENTRA_API_SCOPE --body "$ENTRA_API_SCOPE"
  gh variable set M365_SITE --body "$M365_SITE"
  gh variable set BUDGET_EMAIL --body "$AZURE_BUDGET_EMAIL"
  gh secret set POSTGRES_PASSWORD --body "$AZURE_POSTGRES_PASSWORD"
  gh secret set WEB_CLIENT_SECRET --body "$AUTH_MICROSOFT_ENTRA_ID_SECRET"
  gh secret set AUTH_SECRET --body "$AUTH_SECRET"
  gh secret set ANTHROPIC_API_KEY --body "$ANTHROPIC_API_KEY"
  gh secret set M365_CLIENT_SECRET --body "$M365_CLIENT_SECRET"
fi

log "resource group $RG in $LOCATION"
az group create -n "$RG" -l "$LOCATION" -o none

log "bicep deployment (10 to 15 minutes on first run; Postgres is the slow part)"
az deployment group create -g "$RG" -n dealer-portal --template-file infra/main.bicep \
  --parameters infra/dev.parameters.json \
  --parameters imageTag="$TAG" webClientId="$AUTH_MICROSOFT_ENTRA_ID_ID" entraApiScope="$ENTRA_API_SCOPE" \
    m365Site="$M365_SITE" budgetEmail="$AZURE_BUDGET_EMAIL" \
    powerBiWorkspaceId="${PowerBi__WorkspaceId:-}" powerBiSemanticModelId="${PowerBi__SemanticModelId:-}" \
    postgresAdminPassword="$AZURE_POSTGRES_PASSWORD" webClientSecret="$AUTH_MICROSOFT_ENTRA_ID_SECRET" \
    authSecret="$AUTH_SECRET" anthropicApiKey="$ANTHROPIC_API_KEY" m365ClientSecret="$M365_CLIENT_SECRET" \
  --query properties.outputs -o json > /tmp/dealer-portal-outputs.json
out() { python3 -c "import json;print(json.load(open('/tmp/dealer-portal-outputs.json'))['$1']['value'])"; }
PG_HOST=$(out postgresHost); OAI=$(out openAiEndpoint); OAI_NAME=$(out openAiAccountName); FUNC=$(out functionAppName)
WEB_URL=$(out webUrl); API_URL=$(out apiUrl); ASSISTANT_URL=$(out assistantUrl)

log "rag schema and fixtures on Azure Postgres (Azure OpenAI embeddings)"
MY_IP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create -g "$RG" -s "${PG_HOST%%.*}" -n local-deploy \
  --start-ip-address "$MY_IP" --end-ip-address "$MY_IP" -o none
trap 'az postgres flexible-server firewall-rule delete -g "$RG" -s "${PG_HOST%%.*}" -n local-deploy -y -o none' EXIT
(
  cd assistant
  export DATABASE_URL="postgresql://portal:$AZURE_POSTGRES_PASSWORD@$PG_HOST:5432/dealer_portal?sslmode=require"
  export AZURE_OPENAI_ENDPOINT="$OAI" AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
  # the deploying identity has no Key Vault data role; read the key from the account itself
  export AZURE_OPENAI_API_KEY=$(az cognitiveservices account keys list -g "$RG" -n "$OAI_NAME" --query key1 -o tsv)
  uv run python -c "import psycopg,os; c=psycopg.connect(os.environ['DATABASE_URL']); c.execute('CREATE EXTENSION IF NOT EXISTS vector'); c.commit()"
  uv run python -m rag.migrate
  uv run python -m rag.ingest fixtures/docs
)

log "function code"
(
  cd functions
  uv export --no-dev --no-hashes --no-emit-project --no-emit-package assistant -o requirements.txt
  rm -rf rag migrations; cp -r ../assistant/rag ../assistant/migrations .
  rm -f ../functions.zip
  zip -qr ../functions.zip . -x '.venv/*' '__pycache__/*' 'uv.lock' 'pyproject.toml' '.gitignore' 'local.settings.json*'
  rm -rf rag migrations requirements.txt
)
az functionapp deployment source config-zip -g "$RG" -n "$FUNC" --src functions.zip -o none
rm -f functions.zip

log "restarting apps so Key Vault references resolve"
for app in app-dealer-portal-api app-dealer-portal-assistant app-dealer-portal-web; do
  az webapp restart -g "$RG" -n "$app" -o none
done
for url in "$API_URL" "$ASSISTANT_URL" "$WEB_URL"; do
  for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$url/health" || true); [ "$code" = 200 ] && break; sleep 10
  done
  echo "$url/health -> $code"
done

cat <<OUT

Portal:    $WEB_URL
API:       $API_URL   (MCP at $API_URL/mcp)
Assistant: $ASSISTANT_URL
Add $WEB_URL/api/auth/callback/microsoft-entra-id to the dealer-portal-web redirect URIs (scripts/entra-setup.sh does this when WEB_REDIRECT_URIS includes it).
Tear down: scripts/azure-down.sh
OUT
