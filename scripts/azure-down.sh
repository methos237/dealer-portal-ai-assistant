#!/usr/bin/env bash
# Deletes the whole demo: resource group and everything in it. Key Vault is purged too so the name
# can be reused. Entra app registrations and GitHub secrets are untouched.
set -euo pipefail
RG=${AZURE_RESOURCE_GROUP:-rg-dealer-portal}
KV=$(az keyvault list -g "$RG" --query '[0].name' -o tsv 2>/dev/null || true)
OAI=$(az cognitiveservices account list -g "$RG" --query '[0].{n:name,l:location}' -o tsv 2>/dev/null || true)
if [ "${1:-}" != "--yes" ]; then
  az resource list -g "$RG" -o table >&2
  read -r -p "Type '$RG' to delete everything above: " answer
  [ "$answer" = "$RG" ] || { echo "aborted" >&2; exit 1; }
fi
echo "==> deleting resource group $RG" >&2
az group delete -n "$RG" --yes
if [ -n "$KV" ]; then
  echo "==> purging soft-deleted key vault $KV" >&2
  az keyvault purge -n "$KV" || true
fi
if [ -n "$OAI" ]; then
  # Azure OpenAI accounts are soft-deleted for 48 hours and block a redeploy under the same name.
  echo "==> purging soft-deleted Azure OpenAI account ${OAI%%	*}" >&2
  az cognitiveservices account purge -g "$RG" -n "${OAI%%	*}" -l "${OAI##*	}" || true
fi
echo "done; monthly cost is now zero" >&2
echo "note: the deploy identity's roles were scoped to $RG and went with it; run scripts/azure-oidc-setup.sh before the next deploy.yml" >&2
