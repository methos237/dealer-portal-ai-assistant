import { defineConfig } from "@playwright/test";
import { E2E_SECRET } from "./e2e/session";

const port = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      url: "http://localhost:5081/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run build && npx next start -p ${port}`,
      url: `http://localhost:${port}/health`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        AUTH_SECRET: E2E_SECRET,
        AUTH_TRUST_HOST: "true",
        AUTH_OIDC_ID: "e2e",
        AUTH_OIDC_SECRET: "e2e",
        OIDC_ISSUER: "http://localhost:8080/realms/e2e",
        OIDC_API_SCOPE: "",
        PORTAL_API_URL: "http://localhost:5081",
      },
    },
  ],
});
