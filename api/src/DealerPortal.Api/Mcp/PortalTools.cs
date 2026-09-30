using System.ComponentModel;
using System.Reflection;
using DealerPortal.Api.Auth;
using DealerPortal.Api.Data;
using DealerPortal.Api.Endpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace DealerPortal.Api.Mcp;

/// <summary>
/// Portal tools served over MCP at /mcp. Same rules and tenancy as the REST endpoints: the
/// DbContext query filters scope reads to the caller's dealer, and every write tool returns a
/// draft for the browser to confirm and POST itself. The assistant never writes.
/// </summary>
[McpServerToolType]
public class PortalTools(PortalDbContext db, CurrentUser me)
{
    static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    /// <summary>
    /// Every [McpServerTool] method on this class, built per request from the request's DI scope, with
    /// additionalProperties: false on each input schema so clients can use strict tool definitions.
    /// </summary>
    public static IEnumerable<McpServerTool> All()
    {
        var options = new McpServerToolCreateOptions
        {
            SchemaCreateOptions = new AIJsonSchemaCreateOptions
            {
                TransformOptions = new AIJsonSchemaTransformOptions { DisallowAdditionalProperties = true },
            },
        };
        return typeof(PortalTools)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.GetCustomAttribute<McpServerToolAttribute>() is not null)
            .Select(m => McpServerTool.Create(
                m,
                (RequestContext<CallToolRequestParams> ctx) => ActivatorUtilities.CreateInstance<PortalTools>(ctx.Services!),
                options));
    }

    [McpServerTool(Name = "get_unit"), Description("Look up one unit by VIN: model, delivery date and warranty status.")]
    public async Task<UnitDto> GetUnit([Description("Full 17-character VIN")] string vin)
    {
        var unit = await UnitByVin(vin);
        return ToDto(unit);
    }

    [McpServerTool(Name = "search_units"), Description("Search units by VIN fragment or model name. Returns up to 20.")]
    public Task<List<UnitDto>> SearchUnits([Description("Text to match against VIN or model")] string query) =>
        db.Units
            .Where(u => EF.Functions.ILike(u.Vin, $"%{query}%") || EF.Functions.ILike(u.Model, $"%{query}%"))
            .OrderBy(u => u.Vin).Take(20)
            .Select(u => new UnitDto(u.Id, u.Vin, u.Model, u.DeliveryDate, u.DeliveryDate.AddMonths(PortalEndpoints.WarrantyMonths) >= Today))
            .ToListAsync();

    [McpServerTool(Name = "check_warranty"), Description("Whether a unit is within the 36-month warranty and how many months remain.")]
    public async Task<WarrantyDto> CheckWarranty([Description("Full 17-character VIN")] string vin)
    {
        var unit = await UnitByVin(vin);
        var expires = unit.DeliveryDate.AddMonths(PortalEndpoints.WarrantyMonths);
        var monthsLeft = (expires.Year - Today.Year) * 12 + expires.Month - Today.Month - (expires.Day < Today.Day ? 1 : 0);
        return new WarrantyDto(unit.Vin, unit.DeliveryDate, expires, expires >= Today, Math.Max(monthsLeft, 0));
    }

    [McpServerTool(Name = "list_claims"), Description("List warranty claims, newest first, optionally filtered by status (Open, PendingApproval, Approved, Rejected).")]
    public Task<List<ClaimDto>> ListClaims([Description("Optional status filter")] ClaimStatus? status = null) =>
        db.Claims
            .Where(c => status == null || c.Status == status)
            .OrderByDescending(c => c.CreatedAt).Take(50)
            .Select(c => new ClaimDto(c.Id, c.UnitId, c.Unit!.Vin, c.Description, c.Amount, c.Status, c.CreatedAt, c.ApprovedAt))
            .ToListAsync();

    [McpServerTool(Name = "get_claim"), Description("Get one warranty claim by id.")]
    public async Task<ClaimDto> GetClaim([Description("Claim id")] int id)
    {
        var c = await db.Claims.Include(c => c.Unit).FirstOrDefaultAsync(c => c.Id == id)
                ?? throw new McpException($"No claim {id} is visible to you.");
        return new ClaimDto(c.Id, c.UnitId, c.Unit!.Vin, c.Description, c.Amount, c.Status, c.CreatedAt, c.ApprovedAt);
    }

    [McpServerTool(Name = "draft_claim"), Description(
        "Prepare a warranty claim for the user to confirm. Validates the unit and warranty window and returns a draft; nothing is saved until the user confirms in the portal.")]
    public async Task<Draft> DraftClaim(
        [Description("Full 17-character VIN")] string vin,
        [Description("What failed and what was done, 5 to 2000 characters")] string description,
        [Description("Claim amount in USD, up to two decimals")] decimal amount)
    {
        if (me.DealerId is null)
        {
            throw new McpException("Thor.Admin accounts are not attached to a dealer and cannot file claims.");
        }

        var unit = await UnitByVin(vin);
        if (unit.DeliveryDate.AddMonths(PortalEndpoints.WarrantyMonths) < Today)
        {
            throw new McpException($"Unit {vin} was delivered on {unit.DeliveryDate:yyyy-MM-dd} and is out of the {PortalEndpoints.WarrantyMonths}-month warranty.");
        }

        if (description.Trim().Length is < 5 or > 2000 || amount <= 0 || decimal.Round(amount, 2) != amount)
        {
            throw new McpException("Description must be 5 to 2000 characters and amount a positive value with at most two decimals.");
        }

        var status = amount > PortalEndpoints.ApprovalThreshold ? ClaimStatus.PendingApproval : ClaimStatus.Open;
        return new Draft("claim", "POST", "/claims",
            new CreateClaimRequest(unit.Id, description.Trim(), amount),
            $"File a {status} claim for {amount:N2} USD on {unit.Vin} ({unit.Model}).");
    }

    [McpServerTool(Name = "draft_parts_order"), Description(
        "Prepare a parts order for the user to confirm. Validates SKUs against the catalog and returns a draft with line prices; nothing is ordered until the user confirms.")]
    public async Task<Draft> DraftPartsOrder(
        [Description("Lines to order")] List<PartsOrderLineRequest> lines,
        [Description("Optional VIN the parts are for")] string? vin = null)
    {
        if (me.DealerId is null)
        {
            throw new McpException("Thor.Admin accounts are not attached to a dealer and cannot order parts.");
        }

        if (lines is not { Count: > 0 } || lines.Any(l => l is null || string.IsNullOrWhiteSpace(l.Sku) || l.Quantity is < 1 or > 10_000))
        {
            throw new McpException("Order at least one line; every line needs a SKU and a quantity from 1 to 10000.");
        }

        int? unitId = null;
        if (vin is not null)
        {
            unitId = (await UnitByVin(vin)).Id;
        }

        var skus = lines.Select(l => l.Sku).Distinct().ToList();
        var parts = await db.Parts.Where(p => skus.Contains(p.Sku)).ToDictionaryAsync(p => p.Sku);
        var unknown = skus.Where(s => !parts.ContainsKey(s)).ToList();
        if (unknown.Count > 0)
        {
            throw new McpException($"Unknown SKU(s): {string.Join(", ", unknown)}. Use the parts catalog SKUs only.");
        }

        var total = lines.Sum(l => l.Quantity * parts[l.Sku].UnitPrice);
        return new Draft("parts_order", "POST", "/parts-orders",
            new CreatePartsOrderRequest(unitId, lines),
            $"Order {lines.Count} line(s) totalling {total:N2} USD: " +
            string.Join("; ", lines.Select(l => $"{l.Quantity} × {l.Sku} ({parts[l.Sku].Name})")));
    }

    [McpServerTool(Name = "approve_claim"), Authorize(Policy = Policies.ThorAdmin), Description(
        "Prepare the approval of a claim that is pending approval. Thor.Admin only. Returns a draft; the approval happens when the user confirms.")]
    public async Task<Draft> ApproveClaim([Description("Claim id")] int id)
    {
        var claim = await db.Claims.Include(c => c.Unit).FirstOrDefaultAsync(c => c.Id == id)
                    ?? throw new McpException($"No claim {id} is visible to you.");
        if (claim.Status != ClaimStatus.PendingApproval)
        {
            throw new McpException($"Claim {id} is {claim.Status}, not PendingApproval.");
        }

        return new Draft("approve_claim", "POST", $"/claims/{id}/approve", null,
            $"Approve claim {id} for {claim.Amount:N2} USD on {claim.Unit!.Vin}.");
    }

    async Task<Unit> UnitByVin(string vin) =>
        await db.Units.FirstOrDefaultAsync(u => u.Vin == vin)
        ?? throw new McpException($"No unit with VIN {vin} is visible to you.");

    static UnitDto ToDto(Unit u) => new(u.Id, u.Vin, u.Model, u.DeliveryDate, u.DeliveryDate.AddMonths(PortalEndpoints.WarrantyMonths) >= Today);
}

public record WarrantyDto(string Vin, DateOnly DeliveryDate, DateOnly WarrantyEnds, bool InWarranty, int MonthsRemaining);

/// <summary>A proposed write. The browser shows it as a confirmation card and performs the request itself.</summary>
public record Draft(string Kind, string Method, string Path, object? Body, string Summary);
