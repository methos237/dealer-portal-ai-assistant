#!/usr/bin/env bash
# Creates the Entra ID app registrations and test users for the dealer portal.
#
#   dealer-portal-api  exposes scope access_as_user and app roles
#                      Dealer.User, Dealer.Admin, Thor.Admin
#   dealer-portal-web  Auth.js confidential client, redirect to localhost:3000
#   three test users   one per role, assigned to the api app
#
# Idempotent: apps and users are looked up by name and reused. The web client
# secret and the test user password are rotated on every run (or pass
# TEST_USER_PASSWORD to keep one). Prints the resulting .env lines to stdout.
# Requires: az login as a tenant admin. dealer-portal-m365 is created in Phase 4.
set -euo pipefail

GRAPH=https://graph.microsoft.com/v1.0
WEB_REDIRECT_URI=${WEB_REDIRECT_URI:-http://localhost:3000/api/auth/callback/microsoft-entra-id}
TEST_USER_PASSWORD=${TEST_USER_PASSWORD:-$(openssl rand -base64 18)}

TENANT_ID=$(az account show --query tenantId -o tsv)
TENANT_DOMAIN=$(az rest --method GET --url "$GRAPH/domains" --query "value[?isDefault].id | [0]" -o tsv)

log() { echo "==> $*" >&2; }
app_by_name() { az ad app list --display-name "$1" --query '[0].appId' -o tsv; }
object_id() { az ad app show --id "$1" --query id -o tsv; }
ensure_sp() {
  local sp
  sp=$(az ad sp list --filter "appId eq '$1'" --query '[0].id' -o tsv)
  [ -n "$sp" ] || sp=$(az ad sp create --id "$1" --query id -o tsv)
  echo "$sp"
}
uuid() { uuidgen | tr '[:upper:]' '[:lower:]'; }

# ---------------------------------------------------------------- api app
API_APP_ID=$(app_by_name dealer-portal-api)
if [ -z "$API_APP_ID" ]; then
  log "creating dealer-portal-api"
  API_APP_ID=$(az ad app create --display-name dealer-portal-api \
    --sign-in-audience AzureADMyOrg --query appId -o tsv)
  API_OBJ_ID=$(object_id "$API_APP_ID")
  SCOPE_ID=$(uuid)
  # identifierUris must exist before the scope that lives under it
  az rest --method PATCH --url "$GRAPH/applications/$API_OBJ_ID" --body "{
    \"identifierUris\": [\"api://$API_APP_ID\"],
    \"api\": {\"requestedAccessTokenVersion\": 2}
  }"
  az rest --method PATCH --url "$GRAPH/applications/$API_OBJ_ID" --body "{
    \"api\": {\"oauth2PermissionScopes\": [{
      \"id\": \"$SCOPE_ID\", \"value\": \"access_as_user\", \"type\": \"User\", \"isEnabled\": true,
      \"adminConsentDisplayName\": \"Access Dealer Portal API\",
      \"adminConsentDescription\": \"Allows the app to call the Dealer Portal API as the signed-in user.\",
      \"userConsentDisplayName\": \"Access Dealer Portal API\",
      \"userConsentDescription\": \"Allows the app to call the Dealer Portal API on your behalf.\"
    }]},
    \"appRoles\": [
      {\"id\": \"$(uuid)\", \"value\": \"Dealer.User\",  \"displayName\": \"Dealer User\",  \"description\": \"Dealer staff: read units, file claims and parts orders for own dealer.\", \"allowedMemberTypes\": [\"User\"], \"isEnabled\": true},
      {\"id\": \"$(uuid)\", \"value\": \"Dealer.Admin\", \"displayName\": \"Dealer Admin\", \"description\": \"Dealer management: everything Dealer.User plus dealer user administration.\", \"allowedMemberTypes\": [\"User\"], \"isEnabled\": true},
      {\"id\": \"$(uuid)\", \"value\": \"Thor.Admin\",   \"displayName\": \"THOR Admin\",   \"description\": \"Manufacturer staff: all dealers, claim approval, reporting.\", \"allowedMemberTypes\": [\"User\"], \"isEnabled\": true}
    ]
  }"
fi
API_OBJ_ID=$(object_id "$API_APP_ID")
API_SP_ID=$(ensure_sp "$API_APP_ID")
SCOPE_ID=$(az ad app show --id "$API_APP_ID" --query "api.oauth2PermissionScopes[?value=='access_as_user'].id | [0]" -o tsv)

# ---------------------------------------------------------------- web app
WEB_APP_ID=$(app_by_name dealer-portal-web)
if [ -z "$WEB_APP_ID" ]; then
  log "creating dealer-portal-web"
  WEB_APP_ID=$(az ad app create --display-name dealer-portal-web \
    --sign-in-audience AzureADMyOrg \
    --web-redirect-uris "$WEB_REDIRECT_URI" \
    --enable-id-token-issuance true --query appId -o tsv)
  # Microsoft Graph delegated: openid, profile, email, User.Read
  az ad app permission add --id "$WEB_APP_ID" --api 00000003-0000-0000-c000-000000000000 --api-permissions \
    37f7f235-527c-4136-accd-4a02d197296e=Scope \
    14dad69e-099b-42c9-810b-d002981feec1=Scope \
    64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0=Scope \
    e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope >/dev/null
  az ad app permission add --id "$WEB_APP_ID" --api "$API_APP_ID" --api-permissions "$SCOPE_ID=Scope" >/dev/null
fi
ensure_sp "$WEB_APP_ID" >/dev/null
log "granting admin consent for dealer-portal-web"
consented=
for _ in $(seq 1 18); do   # a new service principal takes a minute or two to propagate
  if az ad app permission admin-consent --id "$WEB_APP_ID" 2>/dev/null; then consented=1; break; fi
  sleep 10
done
[ -n "$consented" ] || { log "admin consent still failing after 3 minutes; rerun this script"; exit 1; }
log "rotating dealer-portal-web client secret"
WEB_SECRET=$(az ad app credential reset --id "$WEB_APP_ID" --display-name local --years 1 --query password -o tsv 2>/dev/null)

# ---------------------------------------------------------------- test users
assign_role() {  # upn role
  local user_id role_id existing
  user_id=$(az ad user show --id "$1" --query id -o tsv 2>/dev/null || true)
  if [ -z "$user_id" ]; then
    log "creating user $1"
    user_id=$(az ad user create --display-name "${1%%@*}" --user-principal-name "$1" \
      --password "$TEST_USER_PASSWORD" --force-change-password-next-sign-in false --query id -o tsv)
  else
    az ad user update --id "$user_id" --password "$TEST_USER_PASSWORD" --force-change-password-next-sign-in false
  fi
  role_id=$(az ad app show --id "$API_APP_ID" --query "appRoles[?value=='$2'].id | [0]" -o tsv)
  existing=$(az rest --method GET --url "$GRAPH/users/$user_id/appRoleAssignments" \
    --query "value[?appRoleId=='$role_id' && resourceId=='$API_SP_ID'] | length(@)" -o tsv)
  if [ "$existing" = "0" ]; then
    log "assigning $2 to $1"
    az rest --method POST --url "$GRAPH/users/$user_id/appRoleAssignments" --body \
      "{\"principalId\": \"$user_id\", \"resourceId\": \"$API_SP_ID\", \"appRoleId\": \"$role_id\"}" >/dev/null
  fi
}
assign_role "dealer.user@$TENANT_DOMAIN"  Dealer.User
assign_role "dealer.admin@$TENANT_DOMAIN" Dealer.Admin
assign_role "thor.admin@$TENANT_DOMAIN"   Thor.Admin

# ---------------------------------------------------------------- output
cat <<ENV

# Entra ID (scripts/entra-setup.sh)
AUTH_MICROSOFT_ENTRA_ID_ID=$WEB_APP_ID
AUTH_MICROSOFT_ENTRA_ID_SECRET=$WEB_SECRET
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/$TENANT_ID/v2.0
ENTRA_API_SCOPE=api://$API_APP_ID/access_as_user
AzureAd__TenantId=$TENANT_ID
AzureAd__ClientId=$API_APP_ID
TEST_USER_PASSWORD=$TEST_USER_PASSWORD
TEST_USER_DEALER_USER=dealer.user@$TENANT_DOMAIN
TEST_USER_DEALER_ADMIN=dealer.admin@$TENANT_DOMAIN
TEST_USER_THOR_ADMIN=thor.admin@$TENANT_DOMAIN
ENV
