param location string
param storageAccountName string
param appInsightsConnectionString string
param keyVaultName string
param openAiEndpoint string
param openAiDeployment string
param m365TenantId string
param m365ClientId string
param m365Site string
param m365Library string

var kv = 'Microsoft.KeyVault(VaultName=${keyVaultName};SecretName='
var deploymentContainer = 'functions-deploy'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource deployContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storageAccountName}/default/${deploymentContainer}'
}

// Flex Consumption: pay per execution, scales to zero; fine for a 15-minute timer.
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-dealer-portal-func'
  location: location
  kind: 'functionapp'
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  properties: { reserved: true }
}

resource func 'Microsoft.Web/sites@2024-04-01' = {
  name: 'func-dealer-portal-ingest'
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainer}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      runtime: { name: 'python', version: '3.13' }
      scaleAndConcurrency: { maximumInstanceCount: 40, instanceMemoryMB: 2048 }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storageAccountName }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'DATABASE_URL', value: '@${kv}database-url)' }
        { name: 'AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
        { name: 'AZURE_OPENAI_API_KEY', value: '@${kv}openai-api-key)' }
        { name: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT', value: openAiDeployment }
        { name: 'M365_TENANT_ID', value: m365TenantId }
        { name: 'M365_CLIENT_ID', value: m365ClientId }
        { name: 'M365_CLIENT_SECRET', value: '@${kv}m365-client-secret)' }
        { name: 'M365_SITE', value: m365Site }
        { name: 'M365_LIBRARY', value: m365Library }
      ]
    }
  }
  dependsOn: [deployContainer]
}

// The identity needs blob data access for deployment packages and the timer's host storage.
var blobOwner = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, func.id, blobOwner)
  properties: { roleDefinitionId: blobOwner, principalId: func.identity.principalId, principalType: 'ServicePrincipal' }
}

output principalId string = func.identity.principalId
output name string = func.name
