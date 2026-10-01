param location string
@secure()
param adminPassword string
param adminLogin string = 'portal'
param databaseName string = 'dealer_portal'

// Burstable B1ms, 32 GB: the smallest Flexible Server. Public endpoint; firewall rules for the App Service and
// Functions outbound IPs live in postgres-firewall.bicep (they depend on the apps). CI and the Fabric copy
// pipeline open a temporary rule for themselves.
resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'psql-dealer-portal-${uniqueString(resourceGroup().id)}'
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '17'
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    storage: { storageSizeGB: 32, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    authConfig: { activeDirectoryAuth: 'Disabled', passwordAuth: 'Enabled' }
  }
}

// pgvector must be allowlisted before `CREATE EXTENSION vector` works.
resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'azure.extensions'
  properties: { value: 'VECTOR', source: 'user-override' }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
  dependsOn: [extensions]
}

output serverName string = server.name
output host string = server.properties.fullyQualifiedDomainName
output adminLogin string = adminLogin
output databaseName string = databaseName
