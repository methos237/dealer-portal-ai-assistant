#!/usr/bin/env bash
# End-to-end demo without the UI, in under ten minutes from a cold start:
#   1. docker compose --profile full: Postgres, Jaeger, api (migrates + seeds), assistant (rag schema +
#      fixture ingestion), web, mcp-m365 from the published images
#   2. five scripted conversations through the assistant and api as the signed-in az user (dealer 1)
#   3. the free retrieval eval, then the total model cost of the conversations
# Requires: docker, uv, az login as a user that scripts/entra-setup.sh mapped to a dealer, .env filled
# (ANTHROPIC_API_KEY; the five conversations cost about 0.40 USD). Traces: http://localhost:16686
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
log() { echo "==> $*" >&2; }

log "starting the stack (docker compose --profile full)"
docker compose --profile full up -d --wait --quiet-pull 2>&1 | tail -1
for url in http://localhost:5080/health http://localhost:8000/health; do
  for _ in $(seq 1 60); do curl -sf -o /dev/null "$url" && break; sleep 5; done
  curl -sf -o /dev/null "$url" || { echo "$url not healthy" >&2; exit 1; }
done

log "portal token for $(az account show --query user.name -o tsv)"
PORTAL_TOKEN=$(az account get-access-token --resource "${OIDC_API_SCOPE%/*}" --query accessToken -o tsv)

log "five scripted conversations"
(cd assistant && PORTAL_TOKEN="$PORTAL_TOKEN" uv run --env-file ../.env python -m evals.demo)

log "retrieval eval (local embedder, free)"
(cd assistant && uv run --env-file ../.env evals --suite retrieval | tail -4)
