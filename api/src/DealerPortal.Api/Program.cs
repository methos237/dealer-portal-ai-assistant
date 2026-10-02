using DealerPortal.Api.Auth;
using DealerPortal.Api.Data;
using DealerPortal.Api.Endpoints;
using DealerPortal.Api.Mcp;
using DealerPortal.Api.Reports;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ModelContextProtocol.AspNetCore;
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

// Any OpenID Connect provider: tokens must name OIDC_ISSUER and carry OIDC_AUDIENCE; keys come from the discovery
// document, fetched from OIDC_ISSUER_INTERNAL when the issuer's public hostname is not reachable from here (the
// compose demo's Keycloak is localhost:8080 for the browser and keycloak:8080 for the containers). Entra ID is
// https://login.microsoftonline.com/<tenant>/v2.0 and the api client id. Plain http is allowed for that Keycloak.
var issuer = builder.Configuration["OIDC_ISSUER"];
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = issuer;
        o.MetadataAddress = $"{builder.Configuration["OIDC_ISSUER_INTERNAL"] ?? issuer}/.well-known/openid-configuration";
        o.TokenValidationParameters.ValidIssuer = issuer;
        o.Audience = builder.Configuration["OIDC_AUDIENCE"];
        o.RequireHttpsMetadata = false;
        o.MapInboundClaims = false;   // keep oid, sub and roles under their wire names
    });
builder.Services.AddAuthorizationBuilder().AddPortalPolicies();

// Reports come from the Fabric semantic model over Power BI REST when PowerBi__* is set (as the dealer-portal-m365
// app, same credentials as mcp-m365), otherwise from SQL over portal.*; cached five minutes per dealer scope.
builder.Services.AddMemoryCache();
builder.Services.Configure<PowerBiOptions>(builder.Configuration.GetSection("PowerBi"));
builder.Services.AddSingleton(PowerBiClient.ClientCredentials(builder.Configuration));
builder.Services.AddHttpClient<PowerBiClient>(c => c.BaseAddress = new Uri("https://api.powerbi.com/v1.0/myorg/"));
builder.Services.AddScoped<SqlReportSource>();
builder.Services.AddScoped<IReportSource>(sp => sp.GetRequiredService<IOptions<PowerBiOptions>>().Value.Configured
    ? sp.GetRequiredService<PowerBiClient>()
    : sp.GetRequiredService<SqlReportSource>());

// Tracing is on only when OTEL_EXPORTER_OTLP_ENDPOINT names a destination (Jaeger in compose, the collector on
// Azure). Unset (tests, plain `dotnet run`) means no exporter and no overhead.
if (builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"] is not null)
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService("api"))
        .WithTracing(t =>
        {
            t.AddAspNetCoreInstrumentation(o => o.Filter = ctx => ctx.Request.Path != "/health")
             .AddHttpClientInstrumentation()
             .AddNpgsql()
             .AddSource("Experimental.ModelContextProtocol")
             .AddOtlpExporter(o => o.Protocol = OtlpExportProtocol.HttpProtobuf);
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
