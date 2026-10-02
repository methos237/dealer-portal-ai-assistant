using System.Security.Claims;
using System.Text.Encodings.Web;
using DealerPortal.Api.Reports;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Testcontainers.PostgreSql;

namespace DealerPortal.Api.Tests;

/// <summary>One Postgres container per test class, migrated and seeded from docker/postgres/seed.sql.</summary>
public sealed class PortalFixture : IAsyncLifetime
{
    readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("pgvector/pgvector:pg17").Build();
    WebApplicationFactory<Program>? _factory;

    public WebApplicationFactory<Program> Factory => _factory ?? throw new InvalidOperationException("not initialized");

    /// <summary>Recorded Power BI responses; tests read the DAX the api sent from <see cref="FakePowerBi.Queries"/>.</summary>
    public FakePowerBi PowerBi { get; } = new();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:Portal", _postgres.GetConnectionString());
            b.UseSetting("PowerBi:WorkspaceId", "ws-1");
            b.UseSetting("PowerBi:SemanticModelId", "model-1");
            b.ConfigureTestServices(services =>
            {
                services.AddSingleton<PowerBiToken>(_ => Task.FromResult("fake-powerbi-token"));
                services.AddHttpClient<PowerBiClient>().ConfigurePrimaryHttpMessageHandler(() => PowerBi);
                services.AddAuthentication(TestAuthHandler.SchemeName)
                    .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
            });
        });
        _ = Factory.Server;   // boots the app: migrate + seed
    }

    public async Task DisposeAsync()
    {
        if (_factory is not null)
        {
            await _factory.DisposeAsync();
        }

        await _postgres.DisposeAsync();
    }

    /// <summary>Client acting as the given oid (or sub, for non-Entra providers) with the given app roles.</summary>
    public HttpClient ClientAs(string oid, params string[] roles) => Client(TestAuthHandler.OidHeader, oid, roles);

    /// <summary>Client whose token carries only <c>sub</c>, as any non-Entra OIDC provider issues.</summary>
    public HttpClient ClientAsSub(string sub, params string[] roles) => Client(TestAuthHandler.SubHeader, sub, roles);

    HttpClient Client(string idHeader, string id, string[] roles)
    {
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Add(idHeader, id);
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, string.Join(",", roles));
        return client;
    }
}

/// <summary>Replaces JWT validation in tests: identity comes from two request headers.</summary>
public sealed class TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string OidHeader = "X-Test-Oid";
    public const string SubHeader = "X-Test-Sub";
    public const string RolesHeader = "X-Test-Roles";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new List<System.Security.Claims.Claim>();
        if (Request.Headers.TryGetValue(OidHeader, out var oid))
        {
            claims.Add(new("oid", oid.ToString()));
        }

        if (Request.Headers.TryGetValue(SubHeader, out var sub))
        {
            claims.Add(new("sub", sub.ToString()));
        }

        if (claims.Count == 0)
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        claims.AddRange(Request.Headers[RolesHeader].ToString()
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(r => new System.Security.Claims.Claim("roles", r)));
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
    }
}
