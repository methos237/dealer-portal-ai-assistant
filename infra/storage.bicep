@description('Azure region for the storage account.')
param location string

// Exists for the Function App (AzureWebJobsStorage and its deployment container, see functions.bicep).
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stdp${uniqueString(resourceGroup().id)}'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

output storageAccountName string = storageAccount.name
