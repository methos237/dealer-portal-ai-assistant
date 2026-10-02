import NextAuth from "next-auth";

/**
 * Any OpenID Connect provider: endpoints come from OIDC_ISSUER's discovery document, the client is
 * AUTH_OIDC_ID / AUTH_OIDC_SECRET (read by Auth.js from the provider id). OIDC_API_SCOPE is the extra
 * scope that makes the access token valid for the api (Entra: api://<api-client-id>/access_as_user;
 * Keycloak puts the api audience in every token, so it stays empty).
 */
const issuer = process.env.OIDC_ISSUER?.replace(/\/$/, "");
const apiScope = process.env.OIDC_API_SCOPE ?? "";
const scope = `openid profile email offline_access ${apiScope}`.trim();

declare module "next-auth" {
  interface Session {
    accessToken: string;
    roles: string[];
  }
}

type PortalToken = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // unix seconds
  roles?: string[];
  error?: "RefreshFailed";
};

/** Roles live in the API access token, not the id token; decode without verifying (the API verifies). */
export function rolesFromAccessToken(
  accessToken: string | undefined,
): string[] {
  if (!accessToken) return [];
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString(),
    );
    return Array.isArray(payload.roles) ? payload.roles : [];
  } catch {
    return [];
  }
}

let tokenEndpoint: string | undefined;

async function refresh(token: PortalToken): Promise<PortalToken> {
  tokenEndpoint ??= (
    await (await fetch(`${issuer}/.well-known/openid-configuration`)).json()
  ).token_endpoint;
  const res = await fetch(tokenEndpoint!, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.AUTH_OIDC_ID ?? "",
      client_secret: process.env.AUTH_OIDC_SECRET ?? "",
      refresh_token: token.refreshToken ?? "",
      scope,
    }),
  });
  if (!res.ok) return { ...token, error: "RefreshFailed" };
  const data = await res.json();
  return {
    ...token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? token.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in),
    roles: rolesFromAccessToken(data.access_token),
    error: undefined,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "oidc",
      name: "Single sign-on",
      type: "oidc",
      issuer,
      authorization: { params: { scope } },
    },
  ],
  callbacks: {
    async jwt({ token, account }) {
      const t = token as typeof token & PortalToken;
      if (account) {
        return {
          ...t,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          roles: rolesFromAccessToken(account.access_token),
        };
      }
      if (
        t.expiresAt &&
        Date.now() / 1000 > t.expiresAt - 60 &&
        t.refreshToken
      ) {
        return refresh(t);
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as PortalToken;
      session.accessToken = t.accessToken ?? "";
      session.roles = t.roles ?? [];
      return session;
    },
  },
});
