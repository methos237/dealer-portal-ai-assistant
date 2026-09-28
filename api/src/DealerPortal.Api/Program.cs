var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();

var app = builder.Build();

app.MapHealthChecks("/health");

app.Run();

// Exposes the entry point to WebApplicationFactory in the test project.
public partial class Program;
