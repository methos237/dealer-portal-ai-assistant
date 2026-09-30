using DealerPortal.Api.Auth;
using DealerPortal.Api.Endpoints;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace DealerPortal.Api.Reports;

public static class ReportsEndpoints
{
    public static void MapReports(this IEndpointRouteBuilder app) =>
        app.MapGet("/reports/summary", Summary).RequireAuthorization(Policies.DealerUser);

    static async Task<Results<Ok<ReportSummaryDto>, ProblemHttpResult>> Summary(
        CurrentUser me, PowerBiClient powerBi, IMemoryCache cache, IOptions<PowerBiOptions> options, CancellationToken ct)
    {
        if (!options.Value.Configured)
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Reporting not configured",
                detail: "Set PowerBi__WorkspaceId and PowerBi__SemanticModelId to the Fabric semantic model (scripts/fabric-up.sh prints them).");
        }

        // One cache entry per dealer scope; Thor.Admin (null dealer) shares the unfiltered entry.
        try
        {
            var summary = await cache.GetOrCreateAsync($"reports:{me.DealerId}", e =>
            {
                e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
                return powerBi.SummaryAsync(me.DealerId, ct);
            });
            return TypedResults.Ok(summary!);
        }
        catch (Exception e) when (e is HttpRequestException or Microsoft.Identity.Client.MsalException)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status502BadGateway, title: "Power BI unavailable", detail: e.Message);
        }
    }
}
