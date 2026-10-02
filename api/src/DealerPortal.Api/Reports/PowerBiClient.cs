using System.Text.Json;
using DealerPortal.Api.Endpoints;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Client;

namespace DealerPortal.Api.Reports;

/// <summary>Fabric semantic model the api reports from. Unset (the default) selects <see cref="SqlReportSource"/>.</summary>
public class PowerBiOptions
{
    public string? WorkspaceId { get; set; }
    public string? SemanticModelId { get; set; }
    public bool Configured => !string.IsNullOrEmpty(WorkspaceId) && !string.IsNullOrEmpty(SemanticModelId);
}

/// <summary>Bearer token for api.powerbi.com. Client credentials in production; a constant in tests.</summary>
public delegate Task<string> PowerBiToken(CancellationToken ct);

/// <summary>
/// Runs DAX against the "Dealer Operations" semantic model through Power BI REST executeQueries. Row-level
/// security cannot be applied through a service principal on that endpoint (documented limitation), so the
/// tenancy filter is built into every query here from the caller's dealer id, as it is for the EF queries.
/// </summary>
public class PowerBiClient(HttpClient http, PowerBiToken token, IOptions<PowerBiOptions> options) : IReportSource
{
    public const string Scope = "https://analysis.windows.net/powerbi/api/.default";
    const int TopParts = 5;

    /// <summary>App-only token for the dealer-portal-m365 registration (M365_* settings), cached by MSAL.</summary>
    public static PowerBiToken ClientCredentials(IConfiguration cfg)
    {
        var app = new Lazy<IConfidentialClientApplication>(() => ConfidentialClientApplicationBuilder
            .Create(cfg["M365_CLIENT_ID"] ?? throw new InvalidOperationException("M365_CLIENT_ID is not set"))
            .WithClientSecret(cfg["M365_CLIENT_SECRET"])
            .WithTenantId(cfg["M365_TENANT_ID"])
            .Build());
        return async ct => (await app.Value.AcquireTokenForClient([Scope]).ExecuteAsync(ct)).AccessToken;
    }

    public async Task<ReportSummaryDto> SummaryAsync(int? dealerId, CancellationToken ct = default)
    {
        // Filter on the one side of the dealers relationships; null (Thor.Admin) leaves the model unfiltered.
        var dealer = dealerId is int d ? $"FILTER(dealers, dealers[id] = {d})" : "ALL(dealers)";
        var totals = (await QueryAsync(
            $"""EVALUATE ROW("ClaimCount", CALCULATE([Claim Count], {dealer}), "ClaimAmount", CALCULATE([Claim Amount], {dealer}), "AvgDaysToClose", CALCULATE([Avg Days To Close], {dealer}), "OpenPartsOrders", CALCULATE([Open Parts Orders], {dealer}))""", ct)).Single();
        var byMonth = await QueryAsync(
            $"""EVALUATE CALCULATETABLE(GROUPBY(ADDCOLUMNS(claims, "Month", FORMAT(claims[created_at], "yyyy-MM")), [Month], "Count", COUNTX(CURRENTGROUP(), claims[id]), "Amount", SUMX(CURRENTGROUP(), claims[amount])), {dealer}) ORDER BY [Month]""", ct);
        var parts = await QueryAsync(
            $"""EVALUATE TOPN({TopParts}, SUMMARIZECOLUMNS(parts[sku], parts[name], {dealer}, "Quantity", SUM(parts_order_lines[quantity])), [Quantity], DESC) ORDER BY [Quantity] DESC""", ct);
        return new ReportSummaryDto(
            dealerId,
            new ReportTotalsDto(
                (int)Num(totals, "[ClaimCount]"),
                Num(totals, "[ClaimAmount]"),
                totals.TryGetProperty("[AvgDaysToClose]", out var avg) && avg.ValueKind == JsonValueKind.Number ? avg.GetDecimal() : null,
                (int)Num(totals, "[OpenPartsOrders]")),
            byMonth.Select(r => new ClaimsMonthDto(r.GetProperty("[Month]").GetString()!, (int)Num(r, "[Count]"), Num(r, "[Amount]"))).ToList(),
            parts.Select(r => new TopPartDto(r.GetProperty("parts[sku]").GetString()!, r.GetProperty("parts[name]").GetString()!, (int)Num(r, "[Quantity]"))).ToList());
    }

    /// <summary>One EVALUATE per call (the endpoint allows one query and one result table per request).</summary>
    async Task<List<JsonElement>> QueryAsync(string dax, CancellationToken ct)
    {
        var o = options.Value;
        using var req = new HttpRequestMessage(HttpMethod.Post, $"groups/{o.WorkspaceId}/datasets/{o.SemanticModelId}/executeQueries")
        {
            Content = JsonContent.Create(new { queries = new[] { new { query = dax } }, serializerSettings = new { includeNulls = true } }),
        };
        req.Headers.Authorization = new("Bearer", await token(ct));
        using var res = await http.SendAsync(req, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Power BI executeQueries returned {(int)res.StatusCode}: {body}", null, res.StatusCode);
        }

        using var doc = JsonDocument.Parse(body);
        var result = doc.RootElement.GetProperty("results")[0];
        if (result.TryGetProperty("error", out var err))
        {
            throw new HttpRequestException($"DAX query failed: {err}");
        }

        return result.GetProperty("tables")[0].GetProperty("rows").EnumerateArray().Select(r => r.Clone()).ToList();
    }

    static decimal Num(JsonElement row, string column) =>
        row.TryGetProperty(column, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;
}
