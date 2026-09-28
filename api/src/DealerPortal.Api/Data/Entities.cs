namespace DealerPortal.Api.Data;

public class Dealer
{
    public int Id { get; set; }
    public required string Code { get; set; }
    public required string Name { get; set; }
}

/// <summary>Maps an Entra user (oid claim) to a dealer. Thor.Admin users have no dealer.</summary>
public class AppUser
{
    public int Id { get; set; }
    public Guid ObjectId { get; set; }
    public required string Email { get; set; }
    public required string DisplayName { get; set; }
    public int? DealerId { get; set; }
    public Dealer? Dealer { get; set; }
}

public class Unit
{
    public int Id { get; set; }
    public int DealerId { get; set; }
    public Dealer? Dealer { get; set; }
    public required string Vin { get; set; }
    public required string Model { get; set; }
    public DateOnly DeliveryDate { get; set; }
}

public enum ClaimStatus { Open, PendingApproval, Approved, Rejected }

public class Claim
{
    public int Id { get; set; }
    public int DealerId { get; set; }
    public int UnitId { get; set; }
    public Unit? Unit { get; set; }
    public required string Description { get; set; }
    public decimal Amount { get; set; }
    public ClaimStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
}

public class Part
{
    public required string Sku { get; set; }
    public required string Name { get; set; }
    public decimal UnitPrice { get; set; }
}

public enum PartsOrderStatus { Submitted, Shipped, Cancelled }

public class PartsOrder
{
    public int Id { get; set; }
    public int DealerId { get; set; }
    public int? UnitId { get; set; }
    public PartsOrderStatus Status { get; set; }
    public decimal Total { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public List<PartsOrderLine> Lines { get; set; } = [];
}

public class PartsOrderLine
{
    public int Id { get; set; }
    public int PartsOrderId { get; set; }
    public required string Sku { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
}

public enum DocumentKind { OwnerManual, ServiceBulletin }

/// <summary>Manufacturer documents. Global: every dealer reads them.</summary>
public class Document
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public DocumentKind Kind { get; set; }
    public required string Path { get; set; }
    public string? Model { get; set; }
    public DateOnly PublishedOn { get; set; }
}
