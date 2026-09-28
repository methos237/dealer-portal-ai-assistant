param location string
param embeddingDeploymentName string = 'text-embedding-3-small'

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'oai-dealer-portal-${uniqueString(resourceGroup().id)}'
  location: location
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'oai-dealer-portal-${uniqueString(resourceGroup().id)}'
    publicNetworkAccess: 'Enabled'
  }
}

resource embedding 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: embeddingDeploymentName
  sku: { name: 'Standard', capacity: 50 }
  properties: {
    model: { format: 'OpenAI', name: 'text-embedding-3-small', version: '1' }
  }
}

output endpoint string = account.properties.endpoint
output accountName string = account.name
output deploymentName string = embedding.name
