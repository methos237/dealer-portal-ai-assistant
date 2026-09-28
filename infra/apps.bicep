param location string
param imageRegistry string
param imageTag string
param appInsightsConnectionString string
param entraTenantId string
param apiClientId string
param webClientId string
param entraApiScope string
param openAiEndpoint string
param openAiDeployment string
param m365TenantId string
param m365ClientId string
param m365Site string
param m365Library string
@description('Key Vault name; secrets referenced by name so App Service resolves them with the app identity.')
param keyVaultName string

var names = { web: 'app-dealer-portal-web', api: 'app-dealer-portal-api', assistant: 'app-dealer-portal-assistant' }
var kv = 'Microsoft.KeyVault(VaultName=${keyVaultName};SecretName='
var hosts = { web: '${names.web}.azurewebsites.net', api: '${names.api}.azurewebsites.net', assistant: '${names.assistant}.azurewebsites.net' }

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-dealer-portal'
  location: location
  kind: 'linux'
  // B1 (1 core, 1.75 GB) sat at 90 % CPU with the three containers and restart-looped the api; B2 is the
  // smallest size that holds them.
  sku: { name: 'B2', tier: 'Basic' }
  properties: { reserved: true }
}

var common = {
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  WEBSITES_CONTAINER_START_TIME_LIMIT: '600' // api migrates and seeds before it listens; B1 cold starts are slow
  WEBSITES_ENABLE_APP_SERVICE_STORAGE: 'false'
  DOCKER_ENABLE_CI: 'true'
}

var settings = {
  web: union(common, {
    WEBSITES_PORT: '3000'
    AUTH_URL: 'https://${hosts.web}'
    AUTH_TRUST_HOST: 'true'
    AUTH_SECRET: '@${kv}auth-secret)'
    AUTH_MICROSOFT_ENTRA_ID_ID: webClientId
    AUTH_MICROSOFT_ENTRA_ID_SECRET: '@${kv}web-client-secret)'
    AUTH_MICROSOFT_ENTRA_ID_ISSUER: '${environment().authentication.loginEndpoint}${entraTenantId}/v2.0'
    ENTRA_API_SCOPE: entraApiScope
    PORTAL_API_URL: 'https://${hosts.api}'
    ASSISTANT_URL: 'https://${hosts.assistant}'
  })
  api: union(common, {
    WEBSITES_PORT: '5080'
    ASPNETCORE_ENVIRONMENT: 'Production'
    ConnectionStrings__Portal: '@${kv}postgres-connection-api)'
    Database__MigrateOnStart: 'true'
    Database__SeedOnStart: 'true'
    AzureAd__TenantId: entraTenantId
    AzureAd__ClientId: apiClientId
  })
  assistant: union(common, {
    WEBSITES_PORT: '8000'
    DATABASE_URL: '@${kv}database-url)'
    PORTAL_API_URL: 'https://${hosts.api}'
    AzureAd__TenantId: entraTenantId
    AzureAd__ClientId: apiClientId
    ANTHROPIC_API_KEY: '@${kv}anthropic-api-key)'
    AZURE_OPENAI_ENDPOINT: openAiEndpoint
    AZURE_OPENAI_API_KEY: '@${kv}openai-api-key)'
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: openAiDeployment
    M365_TENANT_ID: m365TenantId
    M365_CLIENT_ID: m365ClientId
    M365_CLIENT_SECRET: '@${kv}m365-client-secret)'
    M365_SITE: m365Site
    M365_LIBRARY: m365Library
  })
}

resource site 'Microsoft.Web/sites@2024-04-01' = [for app in ['web', 'api', 'assistant']: {
  name: names[app]
  location: location
  kind: 'app,linux,container'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${imageRegistry}/dealer-portal-${app}:${imageTag}'
      alwaysOn: true
      healthCheckPath: '/health'
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [for key in objectKeys(settings[app]): { name: key, value: settings[app][key] }]
    }
  }
}]

output principalIds string[] = [for i in range(0, 3): site[i].identity.principalId]
output webHost string = hosts.web
output apiHost string = hosts.api
output assistantHost string = hosts.assistant
