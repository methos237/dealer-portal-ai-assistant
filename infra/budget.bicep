param amount int = 30
param contactEmail string
param startDate string = '${substring(utcNow(), 0, 7)}-01'

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'budget-dealer-portal'
  properties: {
    category: 'Cost'
    amount: amount
    timeGrain: 'Monthly'
    timePeriod: { startDate: startDate }
    notifications: {
      at80: { enabled: true, operator: 'GreaterThan', threshold: 80, contactEmails: [contactEmail], thresholdType: 'Actual' }
      at100: { enabled: true, operator: 'GreaterThan', threshold: 100, contactEmails: [contactEmail], thresholdType: 'Forecasted' }
    }
  }
}
