@description('Azure region for the storage account.')
param location string

@description('Blob container that holds source documents for ingestion.')
param documentsContainerName string = 'documents'

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

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource documents 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: documentsContainerName
}

output storageAccountName string = storageAccount.name
