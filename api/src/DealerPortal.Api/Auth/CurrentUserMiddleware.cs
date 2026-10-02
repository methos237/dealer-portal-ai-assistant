using System.Security.Claims;
using DealerPortal.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace DealerPortal.Api.Auth;

/// <summary>
/// Fills <see cref="CurrentUser"/> from the validated token. Dealer roles must map to a
/// dealer in portal.app_users (by the Entra oid, or sub for any other OIDC provider); otherwise 403.
/// </summary>
public class CurrentUserMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, CurrentUser current, PortalDbContext db)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var oid = context.User.FindFirstValue("oid") ?? context.User.FindFirstValue("sub");
            current.ObjectId = Guid.TryParse(oid, out var parsed) ? parsed : Guid.Empty;
            current.IsThorAdmin = context.User.HasRole(CurrentUser.ThorAdminRole);

            if (!current.IsThorAdmin)
            {
                current.DealerId = await db.AppUsers.IgnoreQueryFilters()
                    .Where(u => u.ObjectId == current.ObjectId)
                    .Select(u => u.DealerId)
                    .FirstOrDefaultAsync(context.RequestAborted);

                if (current.DealerId is null)
                {
                    await Results.Problem(
                        statusCode: StatusCodes.Status403Forbidden,
                        title: "User is not mapped to a dealer",
                        detail: "Ask a THOR administrator to add this account to portal.app_users.")
                        .ExecuteAsync(context);
                    return;
                }
            }
        }

        await next(context);
    }
}

public static class RoleClaims
{
    /// <summary>Roles arrive in the <c>roles</c> claim (Entra app roles, Keycloak role mapper); tests may use the standard role claim.</summary>
    public static bool HasRole(this ClaimsPrincipal user, string role) =>
        user.HasClaim("roles", role) || user.IsInRole(role);
}
