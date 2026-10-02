using DealerPortal.Api.Auth;
using DealerPortal.Api.Data;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace DealerPortal.Api.Endpoints;

public static class PortalEndpoints
{
    /// <summary>Warranty covers a unit for 36 months after delivery.</summary>
    public const int WarrantyMonths = 36;

    /// <summary>Claims above this amount need Thor.Admin approval.</summary>
    public const decimal ApprovalThreshold = 5_000.00m;

    public static void MapPortal(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("").RequireAuthorization(Policies.DealerUser);

        g.MapGet("/dealers/me", Me);
        g.MapGet("/units", ListUnits);
        g.MapGet("/units/{vin}", GetUnit);
        g.MapGet("/claims", ListClaims);
        g.MapPost("/claims", CreateClaim);
        g.MapPost("/claims/{id:int}/approve", ApproveClaim).RequireAuthorization(Policies.ThorAdmin);
        g.MapGet("/parts-orders", ListPartsOrders);
        g.MapPost("/parts-orders", CreatePartsOrder);
        g.MapGet("/parts", ListParts);
        g.MapGet("/documents", ListDocuments);
    }

    static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);
    static bool InWarranty(DateOnly delivered) => delivered.AddMonths(WarrantyMonths) >= Today;

    static async Task<MeDto> Me(CurrentUser me, PortalDbContext db, HttpContext http)
    {
        var dealer = me.DealerId is int id
            ? await db.Dealers.Where(d => d.Id == id).Select(d => new DealerDto(d.Id, d.Code, d.Name)).FirstOrDefaultAsync()
            : null;
        // Roles arrive in the "roles" claim; the standard role claim is accepted too.
        var roles = http.User.FindAll("roles").Concat(http.User.FindAll(System.Security.Claims.ClaimTypes.Role))
            .Select(c => c.Value).Distinct().ToArray();
        return new MeDto(dealer, roles);
    }

    static Task<List<UnitDto>> ListUnits(PortalDbContext db, string? q) =>
        db.Units
            .Where(u => q == null || EF.Functions.ILike(u.Vin, $"%{q}%") || EF.Functions.ILike(u.Model, $"%{q}%"))
            .OrderBy(u => u.Vin)
            .Select(u => new UnitDto(u.Id, u.Vin, u.Model, u.DeliveryDate, u.DeliveryDate.AddMonths(WarrantyMonths) >= Today))
            .ToListAsync();

    static async Task<Results<Ok<UnitDto>, NotFound>> GetUnit(PortalDbContext db, string vin)
    {
        var u = await db.Units.FirstOrDefaultAsync(u => u.Vin == vin);
        return u is null ? TypedResults.NotFound() : TypedResults.Ok(ToDto(u));
    }

    static Task<List<ClaimDto>> ListClaims(PortalDbContext db, ClaimStatus? status) =>
        db.Claims
            .Where(c => status == null || c.Status == status)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new ClaimDto(c.Id, c.UnitId, c.Unit!.Vin, c.Description, c.Amount, c.Status, c.CreatedAt, c.ApprovedAt))
            .ToListAsync();

    static async Task<Results<Created<ClaimDto>, NotFound, ValidationProblem, ProblemHttpResult>> CreateClaim(
        CreateClaimRequest req, CurrentUser me, PortalDbContext db)
    {
        if (me.DealerId is not int dealerId)
        {
            return NoDealerContext();
        }

        if (decimal.Round(req.Amount, 2) != req.Amount)
        {
            return TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { ["Amount"] = ["Amount has at most two decimals."] });
        }

        var unit = await db.Units.FirstOrDefaultAsync(u => u.Id == req.UnitId);
        if (unit is null)
        {
            return TypedResults.NotFound();
        }

        if (!InWarranty(unit.DeliveryDate))
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status422UnprocessableEntity,
                title: "Unit is out of warranty",
                detail: $"Unit {unit.Vin} was delivered on {unit.DeliveryDate:yyyy-MM-dd}; warranty covers {WarrantyMonths} months.");
        }

        var claim = new Claim
        {
            DealerId = dealerId,
            UnitId = unit.Id,
            Description = req.Description,
            Amount = req.Amount,
            Status = req.Amount > ApprovalThreshold ? ClaimStatus.PendingApproval : ClaimStatus.Open,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Claims.Add(claim);
        await db.SaveChangesAsync();
        return TypedResults.Created($"/claims/{claim.Id}", ToDto(claim, unit.Vin));
    }

    static async Task<Results<Ok<ClaimDto>, NotFound, ProblemHttpResult>> ApproveClaim(int id, PortalDbContext db)
    {
        // One conditional UPDATE: two admins approving at once cannot both win.
        var approved = await db.Claims
            .Where(c => c.Id == id && c.Status == ClaimStatus.PendingApproval)
            .ExecuteUpdateAsync(s => s
                .SetProperty(c => c.Status, ClaimStatus.Approved)
                .SetProperty(c => c.ApprovedAt, DateTimeOffset.UtcNow));
        var claim = await db.Claims.Include(c => c.Unit).FirstOrDefaultAsync(c => c.Id == id);
        if (claim is null)
        {
            return TypedResults.NotFound();
        }

        if (approved == 0)
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Claim is not pending approval",
                detail: $"Claim {id} is {claim.Status}.");
        }

        return TypedResults.Ok(ToDto(claim, claim.Unit!.Vin));
    }

    static Task<List<PartsOrderDto>> ListPartsOrders(PortalDbContext db) =>
        db.PartsOrders
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new PartsOrderDto(o.Id, o.UnitId, o.Status, o.Total, o.CreatedAt,
                o.Lines.Select(l => new PartsOrderLineDto(l.Sku, l.Quantity, l.UnitPrice)).ToList()))
            .ToListAsync();

    static async Task<Results<Created<PartsOrderDto>, NotFound, ValidationProblem, ProblemHttpResult>> CreatePartsOrder(
        CreatePartsOrderRequest req, CurrentUser me, PortalDbContext db)
    {
        if (me.DealerId is not int dealerId)
        {
            return NoDealerContext();
        }

        if (req.Lines.Any(l => l is null))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["Lines"] = ["Lines must not contain null."] });
        }

        if (req.UnitId is int unitId && !await db.Units.AnyAsync(u => u.Id == unitId))
        {
            return TypedResults.NotFound();
        }

        var skus = req.Lines.Select(l => l.Sku).Distinct().ToList();
        var parts = await db.Parts.Where(p => skus.Contains(p.Sku)).ToDictionaryAsync(p => p.Sku);
        var unknown = skus.Where(s => !parts.ContainsKey(s)).ToArray();
        if (unknown.Length > 0)
        {
            return TypedResults.ValidationProblem(
                new Dictionary<string, string[]> { ["Lines"] = unknown.Select(s => $"Unknown SKU '{s}'.").ToArray() },
                title: "Unknown SKU");
        }

        var order = new PartsOrder
        {
            DealerId = dealerId,
            UnitId = req.UnitId,
            Status = PartsOrderStatus.Submitted,
            CreatedAt = DateTimeOffset.UtcNow,
            Lines = req.Lines.Select(l => new PartsOrderLine { Sku = l.Sku, Quantity = l.Quantity, UnitPrice = parts[l.Sku].UnitPrice }).ToList(),
        };
        order.Total = order.Lines.Sum(l => l.Quantity * l.UnitPrice);
        db.PartsOrders.Add(order);
        await db.SaveChangesAsync();
        return TypedResults.Created($"/parts-orders/{order.Id}", ToDto(order));
    }

    static Task<List<PartDto>> ListParts(PortalDbContext db) =>
        db.Parts.OrderBy(p => p.Sku).Select(p => new PartDto(p.Sku, p.Name, p.UnitPrice)).ToListAsync();

    static Task<List<DocumentDto>> ListDocuments(PortalDbContext db) =>
        db.Documents.OrderByDescending(d => d.PublishedOn)
            .Select(d => new DocumentDto(d.Id, d.Title, d.Kind, d.Path, d.Model, d.PublishedOn))
            .ToListAsync();

    static ProblemHttpResult NoDealerContext() => TypedResults.Problem(
        statusCode: StatusCodes.Status403Forbidden,
        title: "No dealer context",
        detail: "Thor.Admin accounts are not attached to a dealer and cannot file claims or orders.");

    static UnitDto ToDto(Unit u) => new(u.Id, u.Vin, u.Model, u.DeliveryDate, InWarranty(u.DeliveryDate));
    static ClaimDto ToDto(Claim c, string vin) => new(c.Id, c.UnitId, vin, c.Description, c.Amount, c.Status, c.CreatedAt, c.ApprovedAt);
    static PartsOrderDto ToDto(PartsOrder o) => new(o.Id, o.UnitId, o.Status, o.Total, o.CreatedAt,
        o.Lines.Select(l => new PartsOrderLineDto(l.Sku, l.Quantity, l.UnitPrice)).ToList());
}
