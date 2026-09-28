namespace DealerPortal.Api.Auth;

/// <summary>Tenancy context for one request. Resolved from the bearer token by <see cref="CurrentUserMiddleware"/>.</summary>
public class CurrentUser
{
    public const string ThorAdminRole = "Thor.Admin";
    public const string DealerAdminRole = "Dealer.Admin";
    public const string DealerUserRole = "Dealer.User";

    public Guid ObjectId { get; set; }
    public bool IsThorAdmin { get; set; }

    /// <summary>Null for Thor.Admin (sees every dealer) and for unauthenticated requests.</summary>
    public int? DealerId { get; set; }
}
