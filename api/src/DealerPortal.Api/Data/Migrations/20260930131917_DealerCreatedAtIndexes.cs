using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DealerPortal.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DealerCreatedAtIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_parts_orders_dealer_id_created_at",
                schema: "portal",
                table: "parts_orders",
                columns: new[] { "dealer_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_claims_dealer_id_created_at",
                schema: "portal",
                table: "claims",
                columns: new[] { "dealer_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_parts_orders_dealer_id_created_at",
                schema: "portal",
                table: "parts_orders");

            migrationBuilder.DropIndex(
                name: "ix_claims_dealer_id_created_at",
                schema: "portal",
                table: "claims");
        }
    }
}
