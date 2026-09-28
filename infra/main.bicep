// Resource-group scope: scripts/azure-up.sh and deploy.yml create rg-dealer-portal first, so the deploy
// identity needs rights on one resource group only.
@description('Azure region for every resource except Postgres.')
param location string = resourceGroup().location
@description('Region for Postgres and the App Service plan. This free-trial subscription has no capacity for either in eastus2; centralus accepts B1 and B1ms.')
param computeLocation string = 'centralus'
@description('Container registry namespace the App Service images are pulled from.')
param imageRegistry string = 'ghcr.io/methos237'
param imageTag string = 'latest'

// Entra (scripts/entra-setup.sh)
param entraTenantId string
param apiClientId string
param webClientId string
param entraApiScope string
// Microsoft 365 (mcp-m365, ingestion Function)
param m365TenantId string
param m365ClientId string
param m365Site string
param m365Library string = 'Documents'
@description('Budget alerts go here.')
param budgetEmail string

@secure()
param postgresAdminPassword string
@secure()
param webClientSecret string
@secure()
param authSecret string
@secure()
param anthropicApiKey string
@secure()
param m365ClientSecret string

module storage 'storage.bicep' = {
  name: 'storage'
  params: { location: location }
}

module monitoring 'monitoring.bicep' = {
  name: 'monitoring'
  params: { location: location }
}

module postgres 'postgres.bicep' = {
  name: 'postgres'
  params: { location: computeLocation, adminPassword: postgresAdminPassword }
}

module openai 'openai.bicep' = {
  name: 'openai'
  params: { location: location }
}

module keyvault 'keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    openAiAccountName: openai.outputs.accountName
    secrets: {
      'postgres-password': postgresAdminPassword
      'web-client-secret': webClientSecret
      'auth-secret': authSecret
      'anthropic-api-key': anthropicApiKey
      'm365-client-secret': m365ClientSecret
    }
  }
}

module apps 'apps.bicep' = {
  name: 'apps'
  params: {
    location: computeLocation
    imageRegistry: imageRegistry
    imageTag: imageTag
    appInsightsConnectionString: monitoring.outputs.connectionString
    entraTenantId: entraTenantId
    apiClientId: apiClientId
    webClientId: webClientId
    entraApiScope: entraApiScope
    postgresHost: postgres.outputs.host
    postgresDatabase: postgres.outputs.databaseName
    postgresAdminLogin: postgres.outputs.adminLogin
    openAiEndpoint: openai.outputs.endpoint
    openAiDeployment: openai.outputs.deploymentName
    m365TenantId: m365TenantId
    m365ClientId: m365ClientId
    m365Site: m365Site
    m365Library: m365Library
    keyVaultName: keyvault.outputs.vaultName
  }
}

module functions 'functions.bicep' = {
  name: 'functions'
  params: {
    location: location
    storageAccountName: storage.outputs.storageAccountName
    appInsightsConnectionString: monitoring.outputs.connectionString
    keyVaultName: keyvault.outputs.vaultName
    postgresHost: postgres.outputs.host
    postgresDatabase: postgres.outputs.databaseName
    postgresAdminLogin: postgres.outputs.adminLogin
    openAiEndpoint: openai.outputs.endpoint
    openAiDeployment: openai.outputs.deploymentName
    m365TenantId: m365TenantId
    m365ClientId: m365ClientId
    m365Site: m365Site
    m365Library: m365Library
  }
}

module keyvaultAccess 'keyvault-access.bicep' = {
  name: 'keyvault-access'
  params: {
    vaultName: keyvault.outputs.vaultName
    readerPrincipalIds: concat(apps.outputs.principalIds, [functions.outputs.principalId])
  }
}

module budget 'budget.bicep' = {
  name: 'budget'
  params: { contactEmail: budgetEmail }
}

output storageAccountName string = storage.outputs.storageAccountName
output webUrl string = 'https://${apps.outputs.webHost}'
output apiUrl string = 'https://${apps.outputs.apiHost}'
output assistantUrl string = 'https://${apps.outputs.assistantHost}'
output postgresHost string = postgres.outputs.host
output openAiEndpoint string = openai.outputs.endpoint
output openAiAccountName string = openai.outputs.accountName
output keyVaultName string = keyvault.outputs.vaultName
output functionAppName string = functions.outputs.name
