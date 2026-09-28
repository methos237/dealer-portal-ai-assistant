import type { BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

export const E2E_SECRET = "e2e-secret-not-for-production-0000000000";

/** Auth.js session cookie for a signed-in test user; the API token is fake because the mock API ignores it. */
export async function signInAs(
  context: BrowserContext,
  roles: string[],
  name = "Dana Ulrich",
) {
  const value = await encode({
    token: {
      name,
      email: "dealer.user@example.com",
      accessToken: "test-token",
      roles,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
    secret: E2E_SECRET,
    salt: "authjs.session-token",
  });
  await context.addCookies([
    {
      name: "authjs.session-token",
      value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
