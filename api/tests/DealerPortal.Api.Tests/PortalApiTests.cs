using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DealerPortal.Api.Endpoints;

namespace DealerPortal.Api.Tests;

public class PortalApiTests(PortalFixture fx) : IClassFixture<PortalFixture>
{
    // Oids from docker/postgres/seed.sql
    const string Dealer1User = "30b994d4-8277-4791-8801-b8553cda8dec";
    const string Dealer1Admin = "c6310899-1869-4f7c-9425-a6aa083999a6";
    const string Dealer2User = "00000000-0000-4000-8000-000000000204";
    const string ThorAdmin = "2bede04d-e740-4fc5-a78f-fb050fb69127";

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };

    [Fact]
    public async Task Health_is_anonymous_and_healthy()
    {
        var res = await fx.Factory.CreateClient().GetAsync("/health");

        res.EnsureSuccessStatusCode();
        Assert.Equal("Healthy", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Anonymous_request_gets_401_problem_details()
    {
        var res = await fx.Factory.CreateClient().GetAsync("/units");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Unmapped_dealer_user_gets_403()
    {
        var res = await fx.ClientAs(Guid.NewGuid().ToString(), "Dealer.User").GetAsync("/units");

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Sub_claim_identifies_the_user_when_oid_is_absent()
    {
        var viaSub = await fx.ClientAsSub(Dealer2User, "Dealer.User").GetFromJsonAsync<List<UnitDto>>("/units", Json);
        var viaOid = await fx.ClientAs(Dealer2User, "Dealer.User").GetFromJsonAsync<List<UnitDto>>("/units", Json);

        Assert.NotEmpty(viaSub!);
        Assert.Equal(viaOid!.Select(u => u.Vin), viaSub!.Select(u => u.Vin));
    }

    [Fact]
    public async Task Dealer_sees_only_its_own_units_and_thor_admin_sees_all()
    {
        var mine = await fx.ClientAs(Dealer1User, "Dealer.User").GetFromJsonAsync<List<UnitDto>>("/units", Json);
        var all = await fx.ClientAs(ThorAdmin, "Thor.Admin").GetFromJsonAsync<List<UnitDto>>("/units", Json);

        Assert.Equal(7, mine!.Count);
        Assert.Equal(20, all!.Count);
    }

    [Fact]
    public async Task Dealer_B_gets_404_on_dealer_A_unit()
    {
        var dealerAUnit = (await fx.ClientAs(Dealer1User, "Dealer.User").GetFromJsonAsync<List<UnitDto>>("/units", Json))![0];

        var res = await fx.ClientAs(Dealer2User, "Dealer.User").GetAsync($"/units/{dealerAUnit.Vin}");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Dealer_B_cannot_see_or_write_against_dealer_A_records()
    {
        var a = fx.ClientAs(Dealer1User, "Dealer.User");
        var b = fx.ClientAs(Dealer2User, "Dealer.User");
        var aUnits = (await a.GetFromJsonAsync<List<UnitDto>>("/units", Json))!.Select(u => u.Vin).ToHashSet();
        var aUnit = await InWarrantyUnit();

        var bClaims = await b.GetFromJsonAsync<List<ClaimDto>>("/claims", Json);
        Assert.NotEmpty(bClaims!);
        Assert.DoesNotContain(bClaims!, c => aUnits.Contains(c.Vin));

        var claim = await b.PostAsJsonAsync("/claims", new CreateClaimRequest(aUnit.Id, "Not my unit", 10m));
        Assert.Equal(HttpStatusCode.NotFound, claim.StatusCode);

        var order = await b.PostAsJsonAsync("/parts-orders", new CreatePartsOrderRequest(aUnit.Id, [new("AWN-1200", 1)]));
        Assert.Equal(HttpStatusCode.NotFound, order.StatusCode);
    }

    [Fact]
    public async Task Claim_amount_with_three_decimals_is_400()
    {
        var unit = await InWarrantyUnit();

        var res = await fx.ClientAs(Dealer1User, "Dealer.User")
            .PostAsJsonAsync("/claims", new CreateClaimRequest(unit.Id, "Sub-cent amount", 100.005m));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Claim_on_in_warranty_unit_is_created_open()
    {
        var unit = await InWarrantyUnit();

        var res = await fx.ClientAs(Dealer1User, "Dealer.User")
            .PostAsJsonAsync("/claims", new CreateClaimRequest(unit.Id, "Awning motor stalls", 420.00m));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var claim = await res.Content.ReadFromJsonAsync<ClaimDto>(Json);
        Assert.Equal(Data.ClaimStatus.Open, claim!.Status);
        Assert.Equal(unit.Vin, claim.Vin);
    }

    [Fact]
    public async Task Claim_on_out_of_warranty_unit_is_rejected_422()
    {
        var units = await fx.ClientAs(Dealer1User, "Dealer.User").GetFromJsonAsync<List<UnitDto>>("/units", Json);
        var expired = units!.First(u => !u.InWarranty);

        var res = await fx.ClientAs(Dealer1User, "Dealer.User")
            .PostAsJsonAsync("/claims", new CreateClaimRequest(expired.Id, "Roof seam sealant", 300.00m));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
    }

    [Fact]
    public async Task Claim_over_threshold_needs_approval_and_only_thor_admin_approves()
    {
        var unit = await InWarrantyUnit();
        var created = await fx.ClientAs(Dealer1User, "Dealer.User")
            .PostAsJsonAsync("/claims", new CreateClaimRequest(unit.Id, "Inverter replacement", 5_000.01m));
        var claim = (await created.Content.ReadFromJsonAsync<ClaimDto>(Json))!;
        Assert.Equal(Data.ClaimStatus.PendingApproval, claim.Status);

        var denied = await fx.ClientAs(Dealer1Admin, "Dealer.Admin").PostAsync($"/claims/{claim.Id}/approve", null);
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        var approved = await fx.ClientAs(ThorAdmin, "Thor.Admin").PostAsync($"/claims/{claim.Id}/approve", null);
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal(Data.ClaimStatus.Approved, (await approved.Content.ReadFromJsonAsync<ClaimDto>(Json))!.Status);

        var again = await fx.ClientAs(ThorAdmin, "Thor.Admin").PostAsync($"/claims/{claim.Id}/approve", null);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Invalid_claim_body_gets_400_validation_problem()
    {
        var res = await fx.ClientAs(Dealer1User, "Dealer.User")
            .PostAsJsonAsync("/claims", new CreateClaimRequest(1, "x", -5m));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Parts_order_with_unknown_sku_is_rejected()
    {
        var res = await fx.ClientAs(Dealer1User, "Dealer.User").PostAsJsonAsync("/parts-orders",
            new CreatePartsOrderRequest(null, [new("AWN-1200", 1), new("NOPE-1", 2)]));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var body = await res.Content.ReadAsStringAsync();
        Assert.Contains("NOPE-1", body);
    }

    [Fact]
    public async Task Parts_order_totals_lines_from_catalog_prices()
    {
        var res = await fx.ClientAs(Dealer1User, "Dealer.User").PostAsJsonAsync("/parts-orders",
            new CreatePartsOrderRequest(null, [new("AWN-1200", 2), new("FRN-SAIL", 1)]));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var order = await res.Content.ReadFromJsonAsync<PartsOrderDto>(Json);
        Assert.Equal(2 * 389.00m + 19.95m, order!.Total);
    }

    [Fact]
    public async Task Thor_admin_cannot_file_claims_without_dealer_context()
    {
        var res = await fx.ClientAs(ThorAdmin, "Thor.Admin")
            .PostAsJsonAsync("/claims", new CreateClaimRequest(1, "Should not work", 10m));

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    async Task<UnitDto> InWarrantyUnit()
    {
        var units = await fx.ClientAs(Dealer1User, "Dealer.User").GetFromJsonAsync<List<UnitDto>>("/units", Json);
        return units!.First(u => u.InWarranty);
    }
}
