// One firewall rule per outbound IP of the apps and the function app. Separate module because the
// apps need the server host (through Key Vault) before their IPs exist.
param serverName string
param allowedIps array

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: serverName
}

@batchSize(1) // Flexible Server rejects concurrent operations on one server
resource rules 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = [for (ip, i) in allowedIps: {
  parent: server
  name: 'app-${i}'
  properties: { startIpAddress: ip, endIpAddress: ip }
}]
