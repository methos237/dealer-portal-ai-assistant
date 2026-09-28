#!/usr/bin/env bash
# Creates a cloud-only Global Administrator in the Entra tenant, for tasks the external
# (Microsoft-account) owner cannot do, such as starting a Microsoft 365 trial in the admin center.
#
#   ADMIN_UPN_PREFIX  local part of the user name (default: admin)
#   ADMIN_PASSWORD    initial password (default: generated); change forced at first sign-in
#
# Idempotent: user and role assignment are looked up and reused. Requires: az login as a Global Administrator.
set -euo pipefail

GRAPH=https://graph.microsoft.com/v1.0
GLOBAL_ADMIN_TEMPLATE=62e90394-69f5-4237-9190-012177145e10
PREFIX=${ADMIN_UPN_PREFIX:-admin}
PASSWORD=${ADMIN_PASSWORD:-$(openssl rand -base64 18)}

log() { echo "==> $*" >&2; }

TENANT_DOMAIN=$(az rest --method GET --url "$GRAPH/domains" --query "value[?isDefault].id | [0]" -o tsv)
UPN="$PREFIX@$TENANT_DOMAIN"

USER_ID=$(az ad user show --id "$UPN" --query id -o tsv 2>/dev/null || true)
if [ -z "$USER_ID" ]; then
  log "creating $UPN"
  USER_ID=$(az ad user create --display-name "$PREFIX" --user-principal-name "$UPN" \
    --password "$PASSWORD" --force-change-password-next-sign-in true --query id -o tsv)
else
  log "$UPN exists; resetting password"
  az ad user update --id "$USER_ID" --password "$PASSWORD" --force-change-password-next-sign-in true
fi

# Global Administrator role object (activated from its template on first use)
ROLE_ID=$(az rest --method GET --url "$GRAPH/directoryRoles" \
  --query "value[?roleTemplateId=='$GLOBAL_ADMIN_TEMPLATE'].id | [0]" -o tsv)
if [ -z "$ROLE_ID" ]; then
  ROLE_ID=$(az rest --method POST --url "$GRAPH/directoryRoles" \
    --body "{\"roleTemplateId\": \"$GLOBAL_ADMIN_TEMPLATE\"}" --query id -o tsv)
fi
if az rest --method GET --url "$GRAPH/directoryRoles/$ROLE_ID/members" \
     --query "value[?id=='$USER_ID'] | [0].id" -o tsv | grep -q .; then
  log "$UPN already Global Administrator"
else
  log "assigning Global Administrator to $UPN"
  az rest --method POST --url "$GRAPH/directoryRoles/$ROLE_ID/members/\$ref" \
    --body "{\"@odata.id\": \"$GRAPH/directoryObjects/$USER_ID\"}"
fi

cat <<OUT

Sign in at https://admin.microsoft.com (choose "Work or school account"):
  user:     $UPN
  password: $PASSWORD   (change required at first sign-in; enable MFA when prompted)
OUT
