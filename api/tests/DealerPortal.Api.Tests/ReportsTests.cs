using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DealerPortal.Api.Endpoints;
using Microsoft.AspNetCore.Mvc.Testing;

namespace DealerPortal.Api.Tests;

public class ReportsTests(PortalFixture fx) : IClassFixture<PortalFixture>
{
    const string Dealer1User = "30b994d4-8277-4791-8801-b8553cda8dec";
    const string ThorAdmin = "2bede04d-e740-4fc5-a78f-fb050fb69127";
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Dealer_summary_is_filtered_to_its_dealer_and_shaped_from_the_three_queries()
    {
        fx.PowerBi.Queries.Clear();

        var s = await fx.ClientAs(Dealer1User, "Dealer.User").GetFromJsonAsync<ReportSummaryDto>("/reports/summary", Json);

        Assert.Equal(1, s!.DealerId);
        Assert.Equal(7, s.Totals.ClaimCount);
        Assert.Equal(32580.5m, s.Totals.ClaimAmount);
        Assert.Equal(3.0m, s.Totals.AvgDaysToClose);
        Assert.Equal(2, s.Totals.OpenPartsOrders);
        Assert.Equal(["2026-04", "2026-07"], s.ClaimsByMonth.Select(m => m.Month));
        Assert.Equal("AWN-1200-H2", s.TopParts[0].Sku);
        Assert.Equal(3, fx.PowerBi.Queries.Count);
        Assert.All(fx.PowerBi.Queries, q => Assert.StartsWith("EVALUATE", q));
        Assert.All(fx.PowerBi.Queries, q => Assert.Contains("FILTER(dealers, dealers[id] = 1)", q));
    }

    [Fact]
    public async Task Thor_admin_summary_is_unfiltered_and_cached()
    {
        fx.PowerBi.Queries.Clear();
        var client = fx.ClientAs(ThorAdmin, "Thor.Admin");

        var first = await client.GetFromJsonAsync<ReportSummaryDto>("/reports/summary", Json);
        var second = await client.GetFromJsonAsync<ReportSummaryDto>("/reports/summary", Json);

        Assert.Null(first!.DealerId);
        Assert.Equal(first.Totals, second!.Totals);
        Assert.Equal(3, fx.PowerBi.Queries.Count);   // second call served from the 5 minute cache
        Assert.All(fx.PowerBi.Queries, q => Assert.Contains("ALL(dealers)", q));
        Assert.All(fx.PowerBi.Queries, q => Assert.DoesNotContain("dealers[id] =", q));
    }

    [Fact]
    public async Task Unconfigured_reporting_is_a_503_problem()
    {
        using var factory = fx.Factory.WithWebHostBuilder(b => b.UseSetting("PowerBi:WorkspaceId", ""));
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.OidHeader, Dealer1User);
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "Dealer.User");

        var res = await client.GetAsync("/reports/summary");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
        Assert.Equal("Reporting not configured", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
    }
}
