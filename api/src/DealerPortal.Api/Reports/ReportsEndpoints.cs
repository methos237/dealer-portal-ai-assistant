using DealerPortal.Api.Auth;
using DealerPortal.Api.Endpoints;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace DealerPortal.Api.Reports;

public static class ReportsEndpoints
{
    public static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(5);

    public static IEndpointRouteBuilder MapReports(this IEndpointRouteBuilder app)
    {
        app.MapGet("/reports/summary", Summary).RequireAuthorization(Policies.DealerUser);
        return app;
    }

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
        var summary = await cache.GetOrCreateAsync($"reports:{me.DealerId}", e =>
        {
            e.AbsoluteExpirationRelativeToNow = CacheFor;
            return powerBi.SummaryAsync(me.DealerId, ct);
        });
        return TypedResults.Ok(summary!);
    }
}
