/**
 * Bearer auth for the HTTP transport. The assistant forwards the user's dealer-portal-api token;
 * we verify it against Entra (same tenant and audience as the api) and require an allowed app role,
 * so app-only Graph access is never reachable without a portal identity that may use it.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface AuthConfig {
  tenantId: string;
  audience: string;
  allowedRoles: string[];
}

export function authFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const tenantId = env.AzureAd__TenantId;
  const audience = env.AzureAd__ClientId;
  if (!tenantId || !audience)
    throw new Error("AzureAd__TenantId and AzureAd__ClientId are required");
  return {
    tenantId,
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
  const issuer = `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`;
  const jwks = createRemoteJWKSet(
    new URL(
      `https://login.microsoftonline.com/${cfg.tenantId}/discovery/v2.0/keys`,
    ),
  );
  return async (authorization) => {
    if (!authorization?.startsWith("Bearer "))
      throw new Error("Missing bearer token");
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer,
      audience: cfg.audience,
    });
    const roles = (payload.roles as string[] | undefined) ?? [];
    if (!roles.some((r) => cfg.allowedRoles.includes(r)))
      throw new Error("Role not allowed");
    return payload;
  };
}
