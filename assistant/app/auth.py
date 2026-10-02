"""Caller identity for the assistant.

The web app forwards the user's access token for the portal api. We validate it here (signature,
issuer, audience) against whatever OpenID Connect provider OIDC_ISSUER names (Entra ID on Azure,
Keycloak in the local demo) and ask the portal API who the caller is, so tenancy decisions are made
by the API's own rules rather than duplicated in the assistant.
"""

import os
from dataclasses import dataclass
from functools import lru_cache

import httpx2 as httpx
import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWKClient


@dataclass
class User:
    oid: str
    roles: list[str]
    dealer_id: int | None
    token: str

    @property
    def is_thor_admin(self) -> bool:
        return "Thor.Admin" in self.roles


def issuer() -> str:
    return os.environ["OIDC_ISSUER"].rstrip("/")


def discovery_url() -> str:
    """Discovery document location: the issuer, or OIDC_ISSUER_INTERNAL when the issuer's public
    hostname is not reachable from here (compose: localhost:8080 outside, keycloak:8080 inside)."""
    base = os.environ.get("OIDC_ISSUER_INTERNAL", issuer()).rstrip("/")
    return f"{base}/.well-known/openid-configuration"


def audience() -> str:
    return os.environ["OIDC_AUDIENCE"]


def portal_api_url() -> str:
    return os.environ.get("PORTAL_API_URL", "http://localhost:5080")


@lru_cache
def _jwks() -> PyJWKClient:
    discovery = httpx.get(discovery_url(), timeout=30)
    discovery.raise_for_status()
    return PyJWKClient(discovery.json()["jwks_uri"])


def decode_token(token: str) -> dict:
    key = _jwks().get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience=audience(),
        issuer=issuer(),
    )


def dealer_for(token: str) -> int | None:
    """Ask the portal API which dealer the caller belongs to (403 there means unmapped)."""
    res = httpx.get(
        f"{portal_api_url()}/dealers/me", headers={"authorization": f"Bearer {token}"}, timeout=30
    )
    if res.status_code in (401, 403):
        raise HTTPException(res.status_code, "Portal API rejected the token")
    res.raise_for_status()
    dealer = res.json().get("dealer")
    return dealer["id"] if dealer else None


def bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    return header.removeprefix("Bearer ")


def current_user(token: str = Depends(bearer)) -> User:
    try:
        claims = decode_token(token)
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid token: {e}") from e
    roles = claims.get("roles", [])
    dealer_id = None if "Thor.Admin" in roles else dealer_for(token)
    # Entra puts the directory object id in oid; every other provider identifies the user by sub.
    oid = claims.get("oid") or claims["sub"]
    return User(oid=oid, roles=roles, dealer_id=dealer_id, token=token)
