param amount int = 30
param contactEmail string
// The Consumption API rejected the current month on this (free trial) subscription; start next month.
param startDate string = '${substring(dateTimeAdd(utcNow(), 'P1M'), 0, 7)}-01T00:00:00Z'

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
