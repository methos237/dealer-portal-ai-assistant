using DealerPortal.Api.Auth;
using Microsoft.EntityFrameworkCore;

namespace DealerPortal.Api.Data;

public class PortalDbContext(DbContextOptions<PortalDbContext> options, CurrentUser currentUser) : DbContext(options)
{
    public DbSet<Dealer> Dealers => Set<Dealer>();
    public DbSet<AppUser> AppUsers => Set<AppUser>();
    public DbSet<Unit> Units => Set<Unit>();
    public DbSet<Claim> Claims => Set<Claim>();
    public DbSet<Part> Parts => Set<Part>();
    public DbSet<PartsOrder> PartsOrders => Set<PartsOrder>();
    public DbSet<Document> Documents => Set<Document>();

    // Every decimal in the model is money.
    protected override void ConfigureConventions(ModelConfigurationBuilder c) =>
        c.Properties<decimal>().HaveColumnType("numeric(12,2)");

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema("portal");

        b.Entity<Dealer>().HasIndex(d => d.Code).IsUnique();
        b.Entity<AppUser>().HasIndex(u => u.ObjectId).IsUnique();
        b.Entity<Unit>().HasIndex(u => u.Vin).IsUnique();
        b.Entity<Part>().HasKey(p => p.Sku);
        b.Entity<PartsOrderLine>().ToTable("parts_order_lines");

        b.Entity<Claim>().Property(c => c.Status).HasConversion<string>();
        b.Entity<PartsOrder>().Property(o => o.Status).HasConversion<string>();
        b.Entity<Document>().Property(d => d.Kind).HasConversion<string>();

        // Tenancy: Dealer.* roles see their own dealer only; Thor.Admin (DealerId null) sees all.
        b.Entity<Unit>().HasQueryFilter(u => currentUser.IsThorAdmin || u.DealerId == currentUser.DealerId);
        b.Entity<Claim>().HasQueryFilter(c => currentUser.IsThorAdmin || c.DealerId == currentUser.DealerId);
        b.Entity<PartsOrder>().HasQueryFilter(o => currentUser.IsThorAdmin || o.DealerId == currentUser.DealerId);
    }
}
