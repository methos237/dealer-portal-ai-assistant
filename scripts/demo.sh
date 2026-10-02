#!/usr/bin/env bash
# End-to-end demo without the UI, in under ten minutes from a cold start and with no cloud account:
#   1. docker compose --profile demo: Postgres, Jaeger, Keycloak (realm from docker/keycloak), api (migrates +
#      seeds), assistant (rag schema + fixture ingestion), web from the published images
#   2. five scripted conversations through the assistant and api as the Keycloak user dealer.user (dealer 1)
#   3. the free retrieval eval, then the total model cost of the conversations
# Requires: docker, uv, python3, .env with ANTHROPIC_API_KEY (the five conversations cost about 0.40 USD).
# Traces: http://localhost:16686; the browser demo is http://localhost:3000 (dealer.user / portal).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
log() { echo "==> $*" >&2; }

ISSUER=${OIDC_ISSUER:-http://localhost:8080/realms/dealer-portal}

log "starting the stack (docker compose --profile demo)"
docker compose --profile demo up -d --wait --quiet-pull 2>&1 | tail -1
for url in http://localhost:5080/health http://localhost:8000/health "$ISSUER/.well-known/openid-configuration"; do
  for _ in $(seq 1 60); do curl -sf -o /dev/null "$url" && break; sleep 5; done
  curl -sf -o /dev/null "$url" || { echo "$url not healthy" >&2; exit 1; }
done

log "portal token for dealer.user from $ISSUER"
PORTAL_TOKEN=$(curl -sf "$ISSUER/protocol/openid-connect/token" \
  -d "grant_type=password&scope=openid&client_id=${AUTH_OIDC_ID:-dealer-portal-web}&client_secret=${AUTH_OIDC_SECRET:-dealer-portal-web-secret}" \
  -d "username=${DEMO_USER:-dealer.user}&password=${DEMO_PASSWORD:-portal}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

export DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5434/dealer_portal}   # the compose Postgres

log "five scripted conversations"
(cd assistant && PORTAL_TOKEN="$PORTAL_TOKEN" uv run --env-file ../.env python -m evals.demo)

log "retrieval eval (local embedder, free)"
(cd assistant && uv run --env-file ../.env evals --suite retrieval | tail -4)
