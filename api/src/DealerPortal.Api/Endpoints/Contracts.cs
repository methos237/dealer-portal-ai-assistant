using System.ComponentModel.DataAnnotations;
using DealerPortal.Api.Data;

namespace DealerPortal.Api.Endpoints;

public record DealerDto(int Id, string Code, string Name);
public record MeDto(DealerDto? Dealer, string[] Roles);
public record UnitDto(int Id, string Vin, string Model, DateOnly DeliveryDate, bool InWarranty);
public record ClaimDto(int Id, int UnitId, string Vin, string Description, decimal Amount, ClaimStatus Status, DateTimeOffset CreatedAt, DateTimeOffset? ApprovedAt);
public record PartsOrderLineDto(string Sku, int Quantity, decimal UnitPrice);
public record PartsOrderDto(int Id, int? UnitId, PartsOrderStatus Status, decimal Total, DateTimeOffset CreatedAt, List<PartsOrderLineDto> Lines);
public record DocumentDto(int Id, string Title, DocumentKind Kind, string Path, string? Model, DateOnly PublishedOn);
public record PartDto(string Sku, string Name, decimal UnitPrice);

public record CreateClaimRequest(
    [Range(1, int.MaxValue)] int UnitId,
    [Required, StringLength(2000, MinimumLength = 5)] string Description,
    [Range(0.01, 999_999_999.99)] decimal Amount);

public record CreatePartsOrderRequest(
    int? UnitId,
    [Required, MinLength(1)] List<PartsOrderLineRequest> Lines);

public record PartsOrderLineRequest(
    [Required, StringLength(32)] string Sku,
    [Range(1, 10_000)] int Quantity);

public record ReportTotalsDto(int ClaimCount, decimal ClaimAmount, decimal? AvgDaysToClose, int OpenPartsOrders);
public record ClaimsMonthDto(string Month, int Count, decimal Amount);
public record TopPartDto(string Sku, string Name, int Quantity);
public record ReportSummaryDto(int? DealerId, ReportTotalsDto Totals, List<ClaimsMonthDto> ClaimsByMonth, List<TopPartDto> TopParts);
