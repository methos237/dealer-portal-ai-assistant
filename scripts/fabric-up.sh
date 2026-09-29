#!/usr/bin/env bash
# Fabric side of the demo, from the definitions in fabric/: workspace, lakehouse, Postgres connection,
# copy pipeline (run once + daily schedule), Direct Lake semantic model, service-principal access.
# Idempotent; rerun after editing fabric/.
#
# Requires:
#   - a Fabric trial started in the browser (roadmap 6.1) by a member account of the tenant
#   - that account signed in to a second az profile:  AZURE_CONFIG_DIR=$HOME/.azure-fabric az login --allow-no-subscriptions
#     (the default az profile stays on the subscription owner and is used for Postgres lookups)
#   - Azure up (scripts/azure-up.sh or deploy.yml): the pipeline reads Azure Postgres
#   - .env: AZURE_POSTGRES_PASSWORD, M365_CLIENT_ID (the dealer-portal-m365 app doubles as the Power BI caller)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

RG=${AZURE_RESOURCE_GROUP:-rg-dealer-portal}
WS_NAME=${FABRIC_WORKSPACE:-dealer-portal}
LH_NAME=dealer_portal_lh
PIPELINE_NAME=copy-portal-tables
MODEL_NAME="Dealer Operations"
CONN_NAME=dealer-portal-postgres
FABRIC=https://api.fabric.microsoft.com/v1
PBI=https://api.powerbi.com/v1.0/myorg
AZF=${FABRIC_AZ_CONFIG_DIR:-$HOME/.azure-fabric}
log() { echo "==> $*" >&2; }
die() { echo "error: $*" >&2; exit 1; }

# Fabric caller: the trial user's az profile when it exists, otherwise the dealer-portal-m365 app itself
# (needs the workspace created in the portal with the app as Admin, and the tenant setting
# "Service principals can create workspaces, connections, and deployment pipelines" for the connection).
sp_token() {
  curl -sS -X POST "https://login.microsoftonline.com/$M365_TENANT_ID/oauth2/v2.0/token" \
    -d "client_id=$M365_CLIENT_ID" -d "client_secret=$M365_CLIENT_SECRET" -d grant_type=client_credentials -d "scope=$1/.default" | jq -r .access_token
}
if [ -d "$AZF" ] && AZURE_CONFIG_DIR=$AZF az account show >/dev/null 2>&1; then
  log "calling Fabric as the az profile in $AZF"
  FT=$(AZURE_CONFIG_DIR=$AZF az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv)
  PT=$(AZURE_CONFIG_DIR=$AZF az account get-access-token --resource https://analysis.windows.net/powerbi/api --query accessToken -o tsv)
else
  log "calling Fabric as dealer-portal-m365 (client credentials)"
  FT=$(sp_token https://api.fabric.microsoft.com); PT=$(sp_token https://analysis.windows.net/powerbi/api)
fi
[ -n "$FT" ] && [ "$FT" != null ] || die "no Fabric token"

# call METHOD URL [json-body]  -> body on stdout; status in $STATUS, Location header in $LOCATION
call() {
  local method=$1 url=$2 body=${3:-} hdr; hdr=$(mktemp)
  case $url in http*) ;; *) url="$FABRIC$url" ;; esac
  local token=$FT; [[ $url == $PBI* ]] && token=$PT
  curl -sS -X "$method" "$url" -D "$hdr" -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
    ${body:+--data "$body"} -o /tmp/fabric-body.json -w '' || true
  STATUS=$(head -1 "$hdr" | awk '{print $2}')
  LOCATION=$(awk 'tolower($1)=="location:"{print $2}' "$hdr" | tr -d '\r')
  RETRY=$(awk 'tolower($1)=="retry-after:"{print $2}' "$hdr" | tr -d '\r')
  rm -f "$hdr"
  cat /tmp/fabric-body.json
}
ok() { [[ $STATUS == 2* ]] || die "$1 -> HTTP $STATUS: $(cat /tmp/fabric-body.json)"; }
# Long-running operation: follow Location until Succeeded, then fetch the result.
lro() {
  local what=$1
  [[ $STATUS == 202 ]] || { ok "$what"; return; }
  local op=$LOCATION
  while :; do
    sleep "${RETRY:-5}"
    local s; s=$(call GET "$op" | jq -r .status)
    case $s in
      Succeeded) call GET "$op/result"; return ;;
      Failed|Cancelled) die "$what: operation $s: $(cat /tmp/fabric-body.json)" ;;
      *) log "$what: $s" ;;
    esac
  done
}
b64() { base64 < "$1" | tr -d '\n'; }
part() { printf '{"path":"%s","payload":"%s","payloadType":"InlineBase64"}' "$1" "$(b64 "$2")"; }

# ---------------------------------------------------------------- capacity + workspace
CAP_ID=$(call GET /capacities | jq -r '[.value[] | select(.state=="Active")] | (map(select(.sku|startswith("FT"))) + .) | .[0].id // empty')
log "capacity ${CAP_ID:-none visible to this caller}"

WS_ID=$(call GET /workspaces | jq -r --arg n "$WS_NAME" '.value[] | select(.displayName==$n) | .id')
if [ -z "$WS_ID" ]; then
  log "creating workspace $WS_NAME"
  WS_ID=$(call POST /workspaces "$(jq -n --arg n "$WS_NAME" --arg c "$CAP_ID" '{displayName:$n, description:"Dealer portal reporting (Fabric trial)"} + (if $c=="" then {} else {capacityId:$c} end)')" | jq -r .id)
  [[ $STATUS == 2* ]] || die "create workspace -> HTTP $STATUS: $(cat /tmp/fabric-body.json). As a service principal: create workspace '$WS_NAME' on the trial capacity in the Fabric portal and add dealer-portal-m365 as Admin, then rerun."
elif [ -n "$CAP_ID" ] && [ "$(call GET "/workspaces/$WS_ID" | jq -r .capacityId)" != "$CAP_ID" ]; then
  call POST "/workspaces/$WS_ID/assignToCapacity" "{\"capacityId\":\"$CAP_ID\"}" >/dev/null; ok "assign capacity"
fi
log "workspace $WS_ID"

# ---------------------------------------------------------------- lakehouse (+ SQL endpoint)
LH_ID=$(call GET "/workspaces/$WS_ID/lakehouses" | jq -r --arg n "$LH_NAME" '.value[] | select(.displayName==$n) | .id')
if [ -z "$LH_ID" ]; then
  log "creating lakehouse $LH_NAME"
  call POST "/workspaces/$WS_ID/lakehouses" "{\"displayName\":\"$LH_NAME\"}" >/dev/null
  LH_ID=$(lro "create lakehouse" | jq -r .id)
fi
for _ in $(seq 1 40); do
  LH=$(call GET "/workspaces/$WS_ID/lakehouses/$LH_ID")
  [ "$(jq -r .properties.sqlEndpointProperties.provisioningStatus <<<"$LH")" = Success ] && break
  log "waiting for the SQL analytics endpoint"; sleep 15
done
SQL_ENDPOINT=$(jq -r .properties.sqlEndpointProperties.connectionString <<<"$LH")
SQL_ENDPOINT_ID=$(jq -r .properties.sqlEndpointProperties.id <<<"$LH")
[ -n "$SQL_ENDPOINT" ] && [ "$SQL_ENDPOINT" != null ] || die "lakehouse SQL endpoint not provisioned"
log "lakehouse $LH_ID ($SQL_ENDPOINT)"

# ---------------------------------------------------------------- Postgres connection
PG_HOST=$(az postgres flexible-server list -g "$RG" --query '[0].fullyQualifiedDomainName' -o tsv)
[ -n "$PG_HOST" ] || die "no Postgres server in $RG; bring Azure up first"
PG_CONNECTION_ID=$(call GET /connections | jq -r --arg n "$CONN_NAME" '.value[] | select(.displayName==$n) | .id')
if [ -z "$PG_CONNECTION_ID" ]; then
  log "creating connection $CONN_NAME -> $PG_HOST"
  PG_CONNECTION_ID=$(call POST /connections "$(jq -n --arg n "$CONN_NAME" --arg h "$PG_HOST" --arg p "$AZURE_POSTGRES_PASSWORD" '{
    connectivityType: "ShareableCloud", displayName: $n,
    connectionDetails: { type: "PostgreSQL", creationMethod: "PostgreSQL",
      parameters: [ {dataType:"Text", name:"server", value:$h}, {dataType:"Text", name:"database", value:"dealer_portal"} ] },
    privacyLevel: "Organizational",
    credentialDetails: { singleSignOnType: "None", connectionEncryption: "Encrypted", skipTestConnection: false,
      credentials: { credentialType: "Basic", username: "portal", password: $p } } }')" | jq -r .id)
  [[ $STATUS == 2* ]] || { log "supported PostgreSQL connection types:"; call GET "/connections/supportedConnectionTypes?showAllCreationMethods=true" | jq '.value[] | select(.type|test("postgre";"i"))' >&2; die "create connection -> HTTP $STATUS: $(cat /tmp/fabric-body.json)"; }
fi
log "connection $PG_CONNECTION_ID"

# ---------------------------------------------------------------- copy pipeline: create/update, run once, schedule daily
sed -e "s/\${PG_CONNECTION_ID}/$PG_CONNECTION_ID/g" -e "s/\${WORKSPACE_ID}/$WS_ID/g" -e "s/\${LAKEHOUSE_ID}/$LH_ID/g" \
  fabric/pipeline/pipeline-content.json > /tmp/pipeline-content.json
PIPE_DEF="{\"parts\":[$(part pipeline-content.json /tmp/pipeline-content.json)]}"
PIPE_ID=$(call GET "/workspaces/$WS_ID/dataPipelines" | jq -r --arg n "$PIPELINE_NAME" '.value[] | select(.displayName==$n) | .id')
if [ -z "$PIPE_ID" ]; then
  log "creating pipeline $PIPELINE_NAME"
  call POST "/workspaces/$WS_ID/dataPipelines" "{\"displayName\":\"$PIPELINE_NAME\",\"definition\":$PIPE_DEF}" >/dev/null
  PIPE_ID=$(lro "create pipeline" | jq -r .id)
else
  log "updating pipeline $PIPELINE_NAME"
  call POST "/workspaces/$WS_ID/dataPipelines/$PIPE_ID/updateDefinition" "{\"definition\":$PIPE_DEF}" >/dev/null
  lro "update pipeline" >/dev/null
fi

log "running the pipeline once"
call POST "/workspaces/$WS_ID/items/$PIPE_ID/jobs/Pipeline/instances" >/dev/null; ok "run pipeline"
JOB=$LOCATION
while :; do
  sleep "${RETRY:-20}"
  s=$(call GET "$JOB" | jq -r .status)
  case $s in
    Completed) log "pipeline run completed"; break ;;
    Failed|Cancelled|Deduped) die "pipeline run $s: $(jq -c .failureReason /tmp/fabric-body.json)" ;;
    *) log "pipeline run: $s" ;;
  esac
done

if [ "$(call GET "/workspaces/$WS_ID/items/$PIPE_ID/jobs/Pipeline/schedules" | jq '.value | length')" = 0 ]; then
  log "daily schedule at 03:00 UTC"
  call POST "/workspaces/$WS_ID/items/$PIPE_ID/jobs/Pipeline/schedules" "$(jq -n \
    --arg s "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg e "$(date -u -v+60d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+60 days' +%Y-%m-%dT%H:%M:%SZ)" \
    '{enabled:true, configuration:{type:"Daily", startDateTime:$s, endDateTime:$e, localTimeZoneId:"UTC", times:["03:00"]}}')" >/dev/null
  ok "create schedule"
fi

# ---------------------------------------------------------------- semantic model (Direct Lake over the lakehouse)
sed -e "s/\${SQL_ENDPOINT}/$SQL_ENDPOINT/g" -e "s/\${SQL_ENDPOINT_ID}/$SQL_ENDPOINT_ID/g" \
  fabric/semantic-model/definition/expressions.tmdl > /tmp/expressions.tmdl
parts=$(part definition.pbism fabric/semantic-model/definition.pbism)
parts+=",$(part definition/expressions.tmdl /tmp/expressions.tmdl)"
for f in database model relationships; do parts+=",$(part "definition/$f.tmdl" "fabric/semantic-model/definition/$f.tmdl")"; done
for f in fabric/semantic-model/definition/tables/*.tmdl; do parts+=",$(part "definition/tables/$(basename "$f")" "$f")"; done
MODEL_DEF="{\"format\":\"TMDL\",\"parts\":[$parts]}"
MODEL_ID=$(call GET "/workspaces/$WS_ID/semanticModels" | jq -r --arg n "$MODEL_NAME" '.value[] | select(.displayName==$n) | .id')
if [ -z "$MODEL_ID" ]; then
  log "creating semantic model $MODEL_NAME"
  call POST "/workspaces/$WS_ID/semanticModels" "{\"displayName\":\"$MODEL_NAME\",\"definition\":$MODEL_DEF}" >/dev/null
  MODEL_ID=$(lro "create semantic model" | jq -r .id)
else
  log "updating semantic model $MODEL_NAME"
  call POST "/workspaces/$WS_ID/semanticModels/$MODEL_ID/updateDefinition" "{\"definition\":$MODEL_DEF}" >/dev/null
  lro "update semantic model" >/dev/null
fi
log "semantic model $MODEL_ID"

# ---------------------------------------------------------------- dealer-portal-m365 reads the model (api + mcp-m365)
SP_OID=$(az ad sp show --id "$M365_CLIENT_ID" --query id -o tsv)
if ! call GET "/workspaces/$WS_ID/roleAssignments" | jq -e --arg id "$SP_OID" '.value[] | select(.principal.id==$id)' >/dev/null; then
  log "adding dealer-portal-m365 as workspace Viewer"
  call POST "/workspaces/$WS_ID/roleAssignments" "{\"principal\":{\"id\":\"$SP_OID\",\"type\":\"ServicePrincipal\"},\"role\":\"Viewer\"}" >/dev/null
  ok "add role assignment"
fi
# executeQueries needs Build on the model as well as Read. The REST API refuses Build for service principals
# (documented limitation), so try and otherwise say what to click.
call POST "$PBI/groups/$WS_ID/datasets/$MODEL_ID/users" "{\"identifier\":\"$SP_OID\",\"principalType\":\"App\",\"datasetUserAccessRight\":\"ReadExplore\"}" >/dev/null
[[ $STATUS == 2* ]] || log "could not grant Build over REST (HTTP $STATUS). In the Fabric portal: $MODEL_NAME > Manage permissions > Add user > dealer-portal-m365 > Build."

# ---------------------------------------------------------------- verify: one DAX query as the service principal
SP_TOKEN=$(sp_token https://analysis.windows.net/powerbi/api)
log "executeQueries as dealer-portal-m365:"
curl -sS -X POST "$PBI/groups/$WS_ID/datasets/$MODEL_ID/executeQueries" -H "Authorization: Bearer $SP_TOKEN" -H "Content-Type: application/json" \
  -d '{"queries":[{"query":"EVALUATE ROW(\"claims\", [Claim Count], \"amount\", [Claim Amount], \"open_orders\", [Open Parts Orders])"}]}' | jq -c . >&2

gh variable set FABRIC_WORKSPACE_ID --body "$WS_ID" >/dev/null 2>&1 || true
gh variable set FABRIC_SEMANTIC_MODEL_ID --body "$MODEL_ID" >/dev/null 2>&1 || true
cat <<EOF

Add to .env (api and mcp-m365 read these):
PowerBi__WorkspaceId=$WS_ID
PowerBi__SemanticModelId=$MODEL_ID
EOF
