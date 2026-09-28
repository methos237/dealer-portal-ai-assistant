targetScope = 'subscription'

@description('Azure region for every resource.')
param location string = 'eastus2'

@description('Resource group that holds the whole demo.')
param resourceGroupName string = 'rg-dealer-portal'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module storage 'storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    location: location
  }
}

output resourceGroupName string = rg.name
output storageAccountName string = storage.outputs.storageAccountName
