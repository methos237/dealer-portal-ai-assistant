import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

test("dealer user loads the dashboard, opens a unit and files a claim", async ({
  page,
  context,
}) => {
  await signInAs(context, ["Dealer.User"]);

  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Blue Ridge RV" }),
  ).toBeVisible();
  await expect(page.getByTestId("tile-Units")).toHaveText("3");
  await page.screenshot({ path: "../docs/screenshots/dashboard.png" });

  await page.getByRole("link", { name: "Units", exact: true }).click();
  await page.getByRole("link", { name: "1THRA24X0RN000001" }).click();
  await expect(page.getByTestId("warranty")).toContainText("In warranty");

  await page.getByRole("link", { name: "File a claim" }).click();
  await page
    .getByLabel("Description")
    .fill("Awning motor stalls at full extension");
  await page.getByLabel("Amount (USD)").fill("420.50");
  await page.getByRole("button", { name: "Submit claim" }).click();

  await expect(page).toHaveURL(/\/claims$/);
  const row = page
    .getByTestId("claim-row")
    .filter({ hasText: "Awning motor stalls" });
  await expect(row).toContainText("Open");
  await page.screenshot({ path: "../docs/screenshots/claims.png" });
});

test("Thor.Admin sees the approvals link and approves a pending claim", async ({
  browser,
}) => {
  const dealer = await browser.newContext();
  await signInAs(dealer, ["Dealer.User"]);
  const dealerPage = await dealer.newPage();
  await dealerPage.goto("/claims/new");
  await dealerPage
    .getByLabel("Unit")
    .selectOption({ label: "1THRA24X0RN000001 · Aria 24" });
  await dealerPage
    .getByLabel("Description")
    .fill("Refrigerator cooling unit replacement");
  await dealerPage.getByLabel("Amount (USD)").fill("6200.00");
  await dealerPage.getByRole("button", { name: "Submit claim" }).click();
  await expect(
    dealerPage
      .getByTestId("claim-row")
      .filter({ hasText: "Refrigerator cooling" }),
  ).toContainText("Pending approval");
  await dealer.close();

  const admin = await browser.newContext();
  await signInAs(admin, ["Thor.Admin"], "Tomas Haring");
  const page = await admin.newPage();
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Approvals" }).click();
  await expect(page).toHaveURL(/status=PendingApproval/);
  const row = page
    .getByTestId("claim-row")
    .filter({ hasText: "Refrigerator cooling" });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toHaveCount(0);
  await page.goto("/claims");
  await expect(
    page.getByTestId("claim-row").filter({ hasText: "Refrigerator cooling" }),
  ).toContainText("Approved");
  await admin.close();
});

test("dealer user does not see the approvals link", async ({
  page,
  context,
}) => {
  await signInAs(context, ["Dealer.User"]);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Approvals" })).toHaveCount(0);
});
