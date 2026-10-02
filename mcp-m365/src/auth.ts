/**
 * Bearer auth for the HTTP transport. The assistant forwards the user's portal api token; we verify
 * it against the same OpenID Connect issuer and audience as the api and require an allowed app role,
 * so app-only Graph access is never reachable without a portal identity that may use it.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface AuthConfig {
  issuer: string;
  audience: string;
  allowedRoles: string[];
}

export function authFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const issuer = env.OIDC_ISSUER?.replace(/\/$/, "");
  const audience = env.OIDC_AUDIENCE;
  if (!issuer || !audience)
    throw new Error("OIDC_ISSUER and OIDC_AUDIENCE are required");
  return {
    issuer,
    audience,
    allowedRoles: (env.M365_ALLOWED_ROLES ?? "Thor.Admin")
      .split(",")
      .map((r) => r.trim()),
  };
}

export type Verifier = (
  authorization: string | undefined,
) => Promise<JWTPayload>;

export function makeVerifier(cfg: AuthConfig): Verifier {
  // Key set location comes from the issuer's discovery document, fetched on the first request.
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  const keys = async () => {
    if (!jwks) {
      const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`);
      if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
      const { jwks_uri } = (await res.json()) as { jwks_uri: string };
      jwks = createRemoteJWKSet(new URL(jwks_uri));
    }
    return jwks;
  };
  return async (authorization) => {
    if (!authorization?.startsWith("Bearer "))
      throw new Error("Missing bearer token");
    const { payload } = await jwtVerify(authorization.slice(7), await keys(), {
      issuer: cfg.issuer,
      audience: cfg.audience,
    });
    const roles = (payload.roles as string[] | undefined) ?? [];
    if (!roles.some((r) => cfg.allowedRoles.includes(r)))
      throw new Error("Role not allowed");
    return payload;
  };
}
