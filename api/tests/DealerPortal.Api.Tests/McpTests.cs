using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using DealerPortal.Api.Endpoints;

namespace DealerPortal.Api.Tests;

/// <summary>Raw JSON-RPC over stateless streamable HTTP, the way any MCP client talks to /mcp.</summary>
public class McpTests(PortalFixture fx) : IClassFixture<PortalFixture>
{
    const string Dealer1User = "30b994d4-8277-4791-8801-b8553cda8dec";
    const string Dealer2User = "00000000-0000-4000-8000-000000000204";
    const string ThorAdmin = "2bede04d-e740-4fc5-a78f-fb050fb69127";

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };

    static async Task<JsonNode> Rpc(HttpClient client, string method, object? @params = null)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/mcp")
        {
            Content = JsonContent.Create(new { jsonrpc = "2.0", id = 1, method, @params = @params ?? new { } }),
        };
        req.Headers.Accept.ParseAdd("application/json");
        req.Headers.Accept.ParseAdd("text/event-stream");
        var res = await client.SendAsync(req);
        Assert.NotEqual(HttpStatusCode.InternalServerError, res.StatusCode);
        var body = await res.Content.ReadAsStringAsync();
        if (res.Content.Headers.ContentType?.MediaType == "text/event-stream")
        {
            body = string.Join("", body.Split('\n').Where(l => l.StartsWith("data:")).Select(l => l[5..].Trim()));
        }

        return JsonNode.Parse(body)!;
    }

    static string[] ToolNames(JsonNode rpc) =>
        rpc["result"]!["tools"]!.AsArray().Select(t => t!["name"]!.GetValue<string>()).OrderBy(n => n).ToArray();

    [Fact]
    public async Task Anonymous_mcp_request_is_401()
    {
        var res = await fx.Factory.CreateClient().PostAsJsonAsync("/mcp", new { jsonrpc = "2.0", id = 1, method = "tools/list" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Tools_list_differs_by_role_and_schemas_are_strict_ready()
    {
        var dealer = await Rpc(fx.ClientAs(Dealer1User, "Dealer.User"), "tools/list");
        var admin = await Rpc(fx.ClientAs(ThorAdmin, "Thor.Admin"), "tools/list");

        Assert.Equal(
            ["check_warranty", "draft_claim", "draft_parts_order", "get_claim", "get_unit", "list_claims", "search_units"],
            ToolNames(dealer));
        Assert.Contains("approve_claim", ToolNames(admin));

        foreach (var tool in admin["result"]!["tools"]!.AsArray())
        {
            var schema = tool!["inputSchema"]!;
            Assert.Equal("object", schema["type"]!.GetValue<string>());
            Assert.False(schema["additionalProperties"]?.GetValue<bool>() ?? true, $"{tool["name"]} allows additional properties");
        }
    }

    [Fact]
    public async Task Dealer_user_calling_approve_claim_gets_an_mcp_error_not_a_500()
    {
        var rpc = await Rpc(fx.ClientAs(Dealer1User, "Dealer.User"), "tools/call",
            new { name = "approve_claim", arguments = new { id = 1 } });

        var isError = rpc["result"]?["isError"]?.GetValue<bool>() ?? false;
        Assert.True(isError || rpc["error"] is not null, rpc.ToJsonString());
    }

    [Fact]
    public async Task Draft_claim_returns_a_draft_and_writes_nothing()
    {
        var client = fx.ClientAs(Dealer1User, "Dealer.User");
        var before = (await client.GetFromJsonAsync<List<ClaimDto>>("/claims", Json))!.Count;
        var unit = (await client.GetFromJsonAsync<List<UnitDto>>("/units", Json))!.First(u => u.InWarranty);

        var rpc = await Rpc(client, "tools/call", new
        {
            name = "draft_claim",
            arguments = new { vin = unit.Vin, description = "Water heater igniter failed", amount = 6200.00 },
        });

        var result = rpc["result"]!;
        Assert.False(result["isError"]?.GetValue<bool>() ?? false, rpc.ToJsonString());
        var draft = result["structuredContent"] ?? JsonNode.Parse(result["content"]![0]!["text"]!.GetValue<string>())!;
        Assert.Equal("claim", draft["kind"]!.GetValue<string>());
        Assert.Equal("/claims", draft["path"]!.GetValue<string>());
        Assert.Contains("PendingApproval", draft["summary"]!.GetValue<string>());
        Assert.Equal(before, (await client.GetFromJsonAsync<List<ClaimDto>>("/claims", Json))!.Count);
    }

    [Fact]
    public async Task Other_dealers_unit_is_not_found_through_mcp()
    {
        var dealer1Vin = (await fx.ClientAs(Dealer1User, "Dealer.User").GetFromJsonAsync<List<UnitDto>>("/units", Json))![0].Vin;

        var rpc = await Rpc(fx.ClientAs(Dealer2User, "Dealer.User"), "tools/call",
            new { name = "get_unit", arguments = new { vin = dealer1Vin } });

        Assert.True(rpc["result"]?["isError"]?.GetValue<bool>() ?? rpc["error"] is not null, rpc.ToJsonString());
    }

    [Fact]
    public async Task Unknown_sku_in_parts_draft_is_an_mcp_error()
    {
        var rpc = await Rpc(fx.ClientAs(Dealer1User, "Dealer.User"), "tools/call", new
        {
            name = "draft_parts_order",
            arguments = new { lines = new[] { new { sku = "NOPE-1", quantity = 1 } } },
        });

        Assert.True(rpc["result"]?["isError"]?.GetValue<bool>() ?? rpc["error"] is not null);
        Assert.Contains("NOPE-1", rpc.ToJsonString());
    }
}

public class McpContractTests(PortalFixture fx) : IClassFixture<PortalFixture>
{
    const string ThorAdmin = "2bede04d-e740-4fc5-a78f-fb050fb69127";

    /// <summary>
    /// The assistant's tool eval runs against this snapshot of tools/list (as Thor.Admin, every tool),
    /// so the eval never needs a token. Set UPDATE_SNAPSHOTS=1 to rewrite it after changing a tool.
    /// </summary>
    [Fact]
    public async Task Tools_list_matches_the_assistant_eval_fixture()
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/mcp")
        {
            Content = JsonContent.Create(new { jsonrpc = "2.0", id = 1, method = "tools/list", @params = new { } }),
        };
        req.Headers.Accept.ParseAdd("application/json");
        req.Headers.Accept.ParseAdd("text/event-stream");
        var res = await fx.ClientAs(ThorAdmin, "Thor.Admin").SendAsync(req);
        var body = await res.Content.ReadAsStringAsync();
        if (res.Content.Headers.ContentType?.MediaType == "text/event-stream")
        {
            body = string.Join("", body.Split('\n').Where(l => l.StartsWith("data:")).Select(l => l[5..].Trim()));
        }

        var tools = JsonNode.Parse(body)!["result"]!["tools"]!.AsArray()
            .OrderBy(t => t!["name"]!.GetValue<string>())
            .Select(t => new JsonObject
            {
                ["name"] = t!["name"]!.DeepClone(),
                ["description"] = t["description"]!.DeepClone(),
                ["inputSchema"] = t["inputSchema"]!.DeepClone(),
            });
        var rendered = new JsonArray([.. tools]).ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n";

        var path = FindRepoFile(Path.Combine("assistant", "evals", "fixtures", "tools.json"));
        if (Environment.GetEnvironmentVariable("UPDATE_SNAPSHOTS") is not null || !File.Exists(path))
        {
            await File.WriteAllTextAsync(path, rendered);
        }

        Assert.Equal(await File.ReadAllTextAsync(path), rendered);
    }

    static string FindRepoFile(string relative)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "assistant")) && Directory.Exists(Path.Combine(dir.FullName, "api")))
            {
                return Path.Combine(dir.FullName, relative);
            }
        }

        throw new DirectoryNotFoundException("repo root not found above " + AppContext.BaseDirectory);
    }
}
