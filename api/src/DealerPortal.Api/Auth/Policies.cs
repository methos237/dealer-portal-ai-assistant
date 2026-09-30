using Microsoft.AspNetCore.Authorization;

namespace DealerPortal.Api.Auth;

public static class Policies
{
    public const string DealerUser = "DealerUser";
    public const string ThorAdmin = "ThorAdmin";

    public static AuthorizationBuilder AddPortalPolicies(this AuthorizationBuilder auth) => auth
        .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
        .AddPolicy(DealerUser, p => p.RequireAssertion(c =>
            c.User.HasRole(CurrentUser.DealerUserRole) || c.User.HasRole(CurrentUser.DealerAdminRole) || c.User.HasRole(CurrentUser.ThorAdminRole)))
        .AddPolicy(ThorAdmin, p => p.RequireAssertion(c => c.User.HasRole(CurrentUser.ThorAdminRole)));
}
