using DealerPortal.Api.Auth;
using DealerPortal.Api.Data;
using DealerPortal.Api.Endpoints;
using DealerPortal.Api.Mcp;
using DealerPortal.Api.Reports;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;
using ModelContextProtocol.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();
builder.Services.AddProblemDetails();
builder.Services.AddValidation();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddScoped<CurrentUser>();
// History table schema-qualified: unqualified it follows search_path ("$user", public), and a DB login
// named like the model schema ("portal" on Azure) made EF look at an empty portal.__EFMigrationsHistory.
builder.Services.AddDbContext<PortalDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Portal"),
            n => n.MigrationsHistoryTable("__EFMigrationsHistory", "public"))
        .UseSnakeCaseNamingConvention());

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));
builder.Services.AddAuthorizationBuilder().AddPortalPolicies();

// Reports come from the Fabric semantic model over Power BI REST, as the dealer-portal-m365 app (same
// credentials as mcp-m365), cached five minutes per dealer scope. Unconfigured = 503 from /reports/summary.
builder.Services.AddMemoryCache();
builder.Services.Configure<PowerBiOptions>(builder.Configuration.GetSection("PowerBi"));
builder.Services.AddSingleton(PowerBiClient.ClientCredentials(builder.Configuration));
builder.Services.AddHttpClient<PowerBiClient>(c => c.BaseAddress = new Uri("https://api.powerbi.com/v1.0/myorg/"));

// Same tools for the in-app assistant and any MCP client (Claude Desktop, Claude Code). Stateless
// streamable HTTP under the same JWT; [Authorize] on tools filters tools/list and re-checks on call.
builder.Services.AddMcpServer()
    .WithHttpTransport(o => o.SessionMode = HttpServerSessionMode.Stateless)
    .WithTools(PortalTools.All())
    .AddAuthorizationFilters();

var app = builder.Build();

if (app.Configuration.GetValue<bool>("Database:MigrateOnStart"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<PortalDbContext>();
    await db.Database.MigrateAsync();
    if (app.Configuration.GetValue<bool>("Database:SeedOnStart"))
    {
        await SeedData.ApplyIfEmptyAsync(db);
    }
}

app.UseStatusCodePages();   // 401/403 from the auth middleware become RFC 9457 problem details
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<CurrentUserMiddleware>();

app.MapHealthChecks("/health").AllowAnonymous();
app.MapPortal();
app.MapReports();
app.MapMcp("/mcp").RequireAuthorization(Policies.DealerUser);

app.Run();

// Exposes the entry point to WebApplicationFactory in the test project.
public partial class Program;
