#!/usr/bin/env bash
# Deletes the whole demo: resource group and everything in it. Key Vault is purged too so the name
# can be reused. Entra app registrations and GitHub secrets are untouched.
set -euo pipefail
RG=${AZURE_RESOURCE_GROUP:-rg-dealer-portal}
KV=$(az keyvault list -g "$RG" --query '[0].name' -o tsv 2>/dev/null || true)
echo "==> deleting resource group $RG" >&2
az group delete -n "$RG" --yes
if [ -n "$KV" ]; then
  echo "==> purging soft-deleted key vault $KV" >&2
  az keyvault purge -n "$KV" || true
fi
echo "done; monthly cost is now zero" >&2
echo "note: the deploy identity's roles were scoped to $RG and went with it; run scripts/azure-oidc-setup.sh before the next deploy.yml" >&2
