using Microsoft.EntityFrameworkCore;

namespace DealerPortal.Api.Data;

/// <summary>Applies docker/postgres/seed.sql once, when the database has no dealers.</summary>
public static class SeedData
{
    public static string FindSeedFile()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "docker", "postgres", "seed.sql");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException("docker/postgres/seed.sql not found above " + AppContext.BaseDirectory);
    }

    public static async Task ApplyIfEmptyAsync(PortalDbContext db, CancellationToken ct = default)
    {
        if (await db.Dealers.AnyAsync(ct))
        {
            return;
        }

        await db.Database.ExecuteSqlRawAsync(await File.ReadAllTextAsync(FindSeedFile(), ct), ct);
    }
}
