// Microsoft Fabric capacity for the semantic model and the copy pipeline. Pay-as-you-go F2 (about 0.36 USD
// per hour while running); suspend it when nobody is looking:
//   az resource invoke-action --action suspend --ids <capacityId>   (resume: --action resume)
// A Fabric trial was not available on this tenant, so this replaces the planned 60-day trial capacity.
param location string
@description('Entra UPNs that administer the capacity (member accounts of the tenant, not guests).')
param adminUpns array

resource capacity 'Microsoft.Fabric/capacities@2023-11-01' = {
  name: 'fabdealerportal${uniqueString(resourceGroup().id)}'
  location: location
  sku: { name: 'F2', tier: 'Fabric' }
  properties: { administration: { members: adminUpns } }
}

output capacityId string = capacity.id
output capacityName string = capacity.name
