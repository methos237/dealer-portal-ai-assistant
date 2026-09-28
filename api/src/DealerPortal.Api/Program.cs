using DealerPortal.Api.Auth;
using DealerPortal.Api.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();
builder.Services.AddProblemDetails();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddDbContext<PortalDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Portal")).UseSnakeCaseNamingConvention());

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));
builder.Services.AddAuthorizationBuilder().AddPortalPolicies();

var app = builder.Build();

if (app.Configuration.GetValue<bool>("Database:MigrateOnStart"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<PortalDbContext>().Database.MigrateAsync();
}

app.UseStatusCodePages();   // 401/403 from the auth middleware become RFC 9457 problem details
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<CurrentUserMiddleware>();

app.MapHealthChecks("/health").AllowAnonymous();

app.Run();

// Exposes the entry point to WebApplicationFactory in the test project.
public partial class Program;
