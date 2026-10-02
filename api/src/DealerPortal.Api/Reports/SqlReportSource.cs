using DealerPortal.Api.Data;
using DealerPortal.Api.Endpoints;
using Microsoft.EntityFrameworkCore;

namespace DealerPortal.Api.Reports;

/// <summary>Where the summary comes from: the Fabric semantic model when PowerBi__* is set, otherwise SQL.</summary>
public interface IReportSource
{
    Task<ReportSummaryDto> SummaryAsync(int? dealerId, CancellationToken ct = default);
}

/// <summary>
/// The semantic model's four measures computed over portal.* for environments without Fabric (compose demo,
/// other clouds). Tenancy comes from the EF query filters, the same rule every other endpoint applies.
/// </summary>
public class SqlReportSource(PortalDbContext db) : IReportSource
{
    const int TopParts = 5;

    public async Task<ReportSummaryDto> SummaryAsync(int? dealerId, CancellationToken ct = default)
    {
        var totals = await db.Claims
            .GroupBy(_ => 1)
            .Select(g => new { Count = g.Count(), Amount = g.Sum(c => c.Amount) })
            .FirstOrDefaultAsync(ct);
        // Avg Days To Close = AVERAGEX over approved claims of DATEDIFF(created_at, approved_at, DAY): calendar days.
        var closed = await db.Claims.Where(c => c.ApprovedAt != null)
            .Select(c => new { c.CreatedAt, ApprovedAt = c.ApprovedAt!.Value })
            .ToListAsync(ct);
        decimal? avgDays = closed.Count == 0
            ? null
            : Math.Round((decimal)closed.Average(c => (c.ApprovedAt.UtcDateTime.Date - c.CreatedAt.UtcDateTime.Date).Days), 1);
        var open = await db.PartsOrders.CountAsync(o => o.Status == PartsOrderStatus.Submitted, ct);
        var byMonth = await db.Claims
            .GroupBy(c => new { c.CreatedAt.Year, c.CreatedAt.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Count(), Amount = g.Sum(c => c.Amount) })
            .OrderBy(m => m.Year).ThenBy(m => m.Month)
            .ToListAsync(ct);
        var parts = await db.PartsOrders.SelectMany(o => o.Lines)
            .Join(db.Parts, l => l.Sku, p => p.Sku, (l, p) => new { l.Sku, p.Name, l.Quantity })
            .GroupBy(x => new { x.Sku, x.Name })
            .Select(g => new { g.Key.Sku, g.Key.Name, Quantity = g.Sum(x => x.Quantity) })
            .OrderByDescending(p => p.Quantity).ThenBy(p => p.Sku)
            .Take(TopParts)
            .Select(p => new TopPartDto(p.Sku, p.Name, p.Quantity))
            .ToListAsync(ct);
        return new ReportSummaryDto(
            dealerId,
            new ReportTotalsDto(totals?.Count ?? 0, totals?.Amount ?? 0m, avgDays, open),
            byMonth.Select(m => new ClaimsMonthDto($"{m.Year:D4}-{m.Month:D2}", m.Count, m.Amount)).ToList(),
            parts);
    }
}
