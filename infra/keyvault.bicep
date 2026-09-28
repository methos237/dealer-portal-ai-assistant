param location string
@description('Secret name to value. Values arrive from the deploy pipeline, never from a parameters file.')
@secure()
param secrets object
@description('Azure OpenAI account whose key is stored as openai-api-key.')
param openAiAccountName string

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: openAiAccountName
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-dp-${uniqueString(resourceGroup().id)}'
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

resource secret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = [for name in objectKeys(secrets): {
  parent: vault
  name: name
  properties: { value: secrets[name] }
}]

resource openAiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'openai-api-key'
  properties: { value: openAi.listKeys().key1 }
}

output vaultName string = vault.name
