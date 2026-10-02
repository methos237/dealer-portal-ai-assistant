using DealerPortal.Api.Auth;
using DealerPortal.Api.Data;
using DealerPortal.Api.Endpoints;
using DealerPortal.Api.Mcp;
using DealerPortal.Api.Reports;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.AspNetCore;
using Azure.Monitor.OpenTelemetry.Exporter;
using Npgsql;
using OpenTelemetry.Exporter;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks().AddDbContextCheck<PortalDbContext>();
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

// Any OpenID Connect provider: keys and endpoints come from OIDC_ISSUER's discovery document, the token's
// aud must be OIDC_AUDIENCE. Entra ID is https://login.microsoftonline.com/<tenant>/v2.0 and the api client id;
// the compose demo points at Keycloak over plain http, so https is not required for the metadata fetch.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = builder.Configuration["OIDC_ISSUER"];
        o.Audience = builder.Configuration["OIDC_AUDIENCE"];
        o.RequireHttpsMetadata = false;
        o.MapInboundClaims = false;   // keep oid, sub and roles under their wire names
    });
builder.Services.AddAuthorizationBuilder().AddPortalPolicies();

// Reports come from the Fabric semantic model over Power BI REST, as the dealer-portal-m365 app (same
// credentials as mcp-m365), cached five minutes per dealer scope. Unconfigured = 503 from /reports/summary.
builder.Services.AddMemoryCache();
builder.Services.Configure<PowerBiOptions>(builder.Configuration.GetSection("PowerBi"));
builder.Services.AddSingleton(PowerBiClient.ClientCredentials(builder.Configuration));
builder.Services.AddHttpClient<PowerBiClient>(c => c.BaseAddress = new Uri("https://api.powerbi.com/v1.0/myorg/"));

// Tracing is on only when a destination exists: OTLP (Jaeger in compose) and/or Application Insights (Azure).
// Neither variable set (tests, plain `dotnet run`) means no exporter and no overhead.
var otlp = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
var appInsights = builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"];
if (otlp is not null || appInsights is not null)
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService("api"))
        .WithTracing(t =>
        {
            t.AddAspNetCoreInstrumentation(o => o.Filter = ctx => ctx.Request.Path != "/health")
             .AddHttpClientInstrumentation()
             .AddNpgsql()
             .AddSource("Experimental.ModelContextProtocol");
            if (otlp is not null)
            {
                t.AddOtlpExporter(o => o.Protocol = OtlpExportProtocol.HttpProtobuf);
            }

            if (appInsights is not null)
            {
                t.AddAzureMonitorTraceExporter(o => o.ConnectionString = appInsights);
            }
        });
}

// Same tools for the in-app assistant and any MCP client (Claude Desktop, Claude Code). Stateless
// streamable HTTP under the same JWT; [Authorize] on tools filters tools/list and re-checks on call.
builder.Services.AddMcpServer()
    .WithHttpTransport(o => o.SessionMode = HttpServerSessionMode.Stateless)
    .WithTools(PortalTools.All())
    .AddAuthorizationFilters();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PortalDbContext>();
    await db.Database.MigrateAsync();
    await SeedData.ApplyIfEmptyAsync(db);
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
