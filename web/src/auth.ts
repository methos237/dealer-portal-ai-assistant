import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/** Scope of the API token; the same audience carries the app roles. */
const apiScope = process.env.ENTRA_API_SCOPE ?? "";
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

async function refresh(token: PortalToken): Promise<PortalToken> {
  const tenant =
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.match(
      /microsoftonline\.com\/([^/]+)/,
    )?.[1] ?? "common";
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
        client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
        refresh_token: token.refreshToken ?? "",
        scope,
      }),
    },
  );
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
  providers: [MicrosoftEntraID({ authorization: { params: { scope } } })],
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
