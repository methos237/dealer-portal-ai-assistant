using DealerPortal.Api.Auth;
using DealerPortal.Api.Data;
using DealerPortal.Api.Endpoints;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();
builder.Services.AddProblemDetails();
builder.Services.AddValidation();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
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

app.Run();

// Exposes the entry point to WebApplicationFactory in the test project.
public partial class Program;
