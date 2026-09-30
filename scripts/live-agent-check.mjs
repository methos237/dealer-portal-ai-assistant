// Drives the real stack (web :3000, assistant :8000, api :5080) with a signed Auth.js session that
// carries a real api token, so no interactive Entra login is needed. Not part of CI.
// Usage: PORTAL_TOKEN=$(az account get-access-token --resource api://<api-app-id> --query accessToken -o tsv) \
//        node scripts/live-agent-check.mjs            (SCREENSHOTS=1 also refreshes docs/screenshots/*.png)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve("web/package.json"));
const { chromium } = require("playwright");
const { encode } = require("next-auth/jwt");

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Za-z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const token = process.env.PORTAL_TOKEN;
if (!token) throw new Error("PORTAL_TOKEN not set");
const roles = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).roles ?? [];
const VIN = process.env.VIN ?? "1THRA24X2RN000001";
const QUESTION = `Is unit ${VIN} still under warranty, and if so file a claim for a water heater failure, about 850 dollars.`;

const cookie = await encode({
  token: { name: "Dev token", email: "dev@example.com", accessToken: token, roles, expiresAt: Math.floor(Date.now() / 1000) + 3000 },
  secret: env.AUTH_SECRET,
  salt: "authjs.session-token",
});

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: "http://localhost:3000", viewport: { width: 1280, height: 900 } });
await context.addCookies([{ name: "authjs.session-token", value: cookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && console.log("[browser]", m.text()));

await page.goto("/claims");
const before = await page.getByTestId("claim-row").count();
console.log("roles", roles, "claims before", before);

await page.goto("/assistant");
await page.getByLabel("Message").fill(QUESTION);
await page.getByRole("button", { name: "Send" }).click();
try {
  await page.getByTestId("confirm-card").waitFor({ timeout: 180_000 });
} catch (e) {
  await page.screenshot({ path: "/tmp/live-fail.png" });
  console.log("PAGE TEXT:\n" + (await page.getByTestId("messages").innerText()).slice(0, 1500));
  const alert = page.getByRole("alert");
  if (await alert.count()) console.log("ALERT:", await alert.innerText());
  throw e;
}
const tools = await page.getByTestId("tools").last().innerText();
console.log("tools:\n" + tools);
console.log("card:", await page.getByTestId("confirm-card").innerText());
await page.getByTestId("usage").last().waitFor({ timeout: 120_000 });
if (process.env.SCREENSHOTS) await page.screenshot({ path: "docs/screenshots/assistant-confirm.png" });

await page.getByRole("button", { name: "Confirm and send" }).click();
await page.getByText(/Done\./).waitFor({ timeout: 30_000 });
console.log("after confirm:", await page.getByTestId("confirm-card").innerText());

await page.goto("/claims");
const after = await page.getByTestId("claim-row").count();
const row = page.getByTestId("claim-row").filter({ hasText: "ater heater" }).first();
console.log("claims after", after, "| new row:", (await row.innerText()).replace(/\s+/g, " "));
if (process.env.SCREENSHOTS) await page.screenshot({ path: "docs/screenshots/claims-after-confirm.png" });
await browser.close();
if (after !== before + 1) throw new Error(`expected ${before + 1} claims, saw ${after}`);
console.log("OK");
