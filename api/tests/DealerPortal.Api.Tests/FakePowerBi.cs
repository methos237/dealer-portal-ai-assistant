using System.Net;
using System.Text.Json;

namespace DealerPortal.Api.Tests;

/// <summary>
/// Stands in for api.powerbi.com executeQueries. Response bodies are the shape the real endpoint returns for the
/// three summary queries (recorded against the Dealer Operations model); the DAX decides which one comes back.
/// </summary>
public sealed class FakePowerBi : HttpMessageHandler
{
    public List<string> Queries { get; } = [];

    const string Totals = """{"results":[{"tables":[{"rows":[{"[ClaimCount]":7,"[ClaimAmount]":32580.5,"[AvgDaysToClose]":3.0,"[OpenPartsOrders]":2}]}]}]}""";
    const string ByMonth = """{"results":[{"tables":[{"rows":[{"[Month]":"2026-04","[Count]":2,"[Amount]":6020.5},{"[Month]":"2026-07","[Count]":1,"[Amount]":12400.0}]}]}]}""";
    const string TopParts = """{"results":[{"tables":[{"rows":[{"parts[sku]":"AWN-1200-H2","parts[name]":"Awning motor, 12 V","[Quantity]":6},{"parts[sku]":"WH-IGN-2","parts[name]":"Water heater igniter","[Quantity]":3}]}]}]}""";
    const string DaxError = """{"error":{"code":"DatasetExecuteQueriesError","message":"DAX query failure","details":[{"code":"Query","message":"The syntax for 'BAD' is incorrect."}]}}""";

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        Assert.Equal("Bearer fake-powerbi-token", req.Headers.Authorization?.ToString());
        Assert.Equal("https://api.powerbi.com/v1.0/myorg/groups/ws-1/datasets/model-1/executeQueries", req.RequestUri?.ToString());
        var body = JsonDocument.Parse(await req.Content!.ReadAsStringAsync(ct));
        var dax = body.RootElement.GetProperty("queries")[0].GetProperty("query").GetString()!;
        Queries.Add(dax);
        var (status, json) = dax switch
        {
            _ when dax.Contains("BAD") => (HttpStatusCode.BadRequest, DaxError),
            _ when dax.Contains("ROW(") => (HttpStatusCode.OK, Totals),
            _ when dax.Contains("GROUPBY(") => (HttpStatusCode.OK, ByMonth),
            _ => (HttpStatusCode.OK, TopParts),
        };
        return new HttpResponseMessage(status) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
    }
}
