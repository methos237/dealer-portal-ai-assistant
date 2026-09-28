import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

test("serves an installable manifest and registers the service worker", async ({
  page,
  context,
}) => {
  await signInAs(context, ["Dealer.User"]);
  await page.goto("/dashboard");
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const manifest = await (await page.request.get(manifestHref!)).json();
  expect(manifest.display).toBe("standalone");
  expect(
    manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512"),
  ).toBe(true);
  await page.waitForFunction(
    async () =>
      (await navigator.serviceWorker.ready).active?.state === "activated",
  );
});

test("claim drafted offline is saved and replayed when back online", async ({
  page,
  context,
}) => {
  await signInAs(context, ["Dealer.User"]);
  await page.goto("/claims/new");
  await page
    .getByLabel("Unit")
    .selectOption({ label: "1THRS36X4RN000004 · Summit 36" });
  await page
    .getByLabel("Description")
    .fill("Furnace sail switch fault while offline");
  await page.getByLabel("Amount (USD)").fill("19.95");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Submit claim" }).click();
  await expect(page.getByRole("status")).toContainText("saved on this device");

  await context.setOffline(false);
  await expect(
    page.getByRole("status").filter({ hasText: "Sent 1 claim" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.goto("/claims");
  await expect(
    page.getByTestId("claim-row").filter({ hasText: "while offline" }),
  ).toContainText("Open");
});
