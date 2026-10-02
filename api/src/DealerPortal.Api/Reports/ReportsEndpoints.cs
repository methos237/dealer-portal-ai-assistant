using DealerPortal.Api.Auth;
using DealerPortal.Api.Endpoints;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Caching.Memory;

namespace DealerPortal.Api.Reports;

public static class ReportsEndpoints
{
    public static void MapReports(this IEndpointRouteBuilder app) =>
        app.MapGet("/reports/summary", Summary).RequireAuthorization(Policies.DealerUser);

    static async Task<Results<Ok<ReportSummaryDto>, ProblemHttpResult>> Summary(
        CurrentUser me, IReportSource source, IMemoryCache cache, CancellationToken ct)
    {
        // One cache entry per dealer scope; Thor.Admin (null dealer) shares the unfiltered entry.
        try
        {
            var summary = await cache.GetOrCreateAsync($"reports:{me.DealerId}", e =>
            {
                e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
                return source.SummaryAsync(me.DealerId, ct);
            });
            return TypedResults.Ok(summary!);
        }
        catch (Exception e) when (e is HttpRequestException or Microsoft.Identity.Client.MsalException)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status502BadGateway, title: "Power BI unavailable", detail: e.Message);
        }
    }
}
