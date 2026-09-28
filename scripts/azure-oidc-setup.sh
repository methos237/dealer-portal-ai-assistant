#!/usr/bin/env bash
# Deploy identity for GitHub Actions: an app registration with two federated credentials (master pushes
# and pull requests) and Contributor plus RBAC Administrator on the resource group, so deploy.yml can
# run Bicep (including role assignments) with OIDC and no stored cloud secret. Writes the ids GitHub
# needs as repository variables with `gh`. Idempotent.
#
#   GITHUB_REPO   owner/name (default: from `gh repo view`)
set -euo pipefail

GRAPH=https://graph.microsoft.com/v1.0
RG=${AZURE_RESOURCE_GROUP:-rg-dealer-portal}
LOCATION=${AZURE_LOCATION:-eastus2}
REPO=${GITHUB_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
APP_NAME=dealer-portal-deploy

log() { echo "==> $*" >&2; }

SUB_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
az group create -n "$RG" -l "$LOCATION" -o none

APP_ID=$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)
if [ -z "$APP_ID" ]; then
  log "creating $APP_NAME"
  APP_ID=$(az ad app create --display-name "$APP_NAME" --sign-in-audience AzureADMyOrg --query appId -o tsv)
fi
APP_OBJ=$(az ad app show --id "$APP_ID" --query id -o tsv)
SP_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query '[0].id' -o tsv)
[ -n "$SP_ID" ] || SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)

ensure_fic() {  # name subject
  if ! az rest --method GET --url "$GRAPH/applications/$APP_OBJ/federatedIdentityCredentials" --query "value[?name=='$1'] | length(@)" -o tsv | grep -q '^[1-9]'; then
    log "federated credential $1 -> $2"
    az rest --method POST --url "$GRAPH/applications/$APP_OBJ/federatedIdentityCredentials" --body "{
      \"name\": \"$1\", \"issuer\": \"https://token.actions.githubusercontent.com\",
      \"subject\": \"$2\", \"audiences\": [\"api://AzureADTokenExchange\"]}" -o none
  fi
}
ensure_fic github-master "repo:$REPO:ref:refs/heads/master"
ensure_fic github-pull-request "repo:$REPO:pull_request"

SCOPE="/subscriptions/$SUB_ID/resourceGroups/$RG"
for role in "Contributor" "Role Based Access Control Administrator"; do
  log "assigning '$role' on $RG"
  az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
    --role "$role" --scope "$SCOPE" -o none
done

log "setting GitHub repository variables"
gh variable set AZURE_CLIENT_ID --body "$APP_ID" -R "$REPO"
gh variable set AZURE_TENANT_ID --body "$TENANT_ID" -R "$REPO"
gh variable set AZURE_SUBSCRIPTION_ID --body "$SUB_ID" -R "$REPO"
gh variable set AZURE_RESOURCE_GROUP --body "$RG" -R "$REPO"

cat <<OUT

Deploy identity ready: $APP_NAME ($APP_ID), Contributor + RBAC Administrator on $RG.
Still needed for deploy.yml, from .env (scripts/azure-up.sh --github-secrets does this):
  variables: WEB_CLIENT_ID ENTRA_API_SCOPE M365_SITE BUDGET_EMAIL
  secrets:   POSTGRES_PASSWORD WEB_CLIENT_SECRET AUTH_SECRET ANTHROPIC_API_KEY M365_CLIENT_SECRET
OUT
