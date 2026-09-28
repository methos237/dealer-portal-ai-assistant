"""Caller identity for the assistant.

The web app forwards the user's Entra access token for dealer-portal-api. We validate it here
(signature, issuer, audience) and ask the portal API who the caller is, so tenancy decisions are
made by the API's own rules rather than duplicated in the assistant.
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


def tenant_id() -> str:
    return os.environ["AzureAd__TenantId"]


def audience() -> str:
    return os.environ["AzureAd__ClientId"]


def portal_api_url() -> str:
    return os.environ.get("PORTAL_API_URL", "http://localhost:5080")


@lru_cache
def _jwks() -> PyJWKClient:
    return PyJWKClient(f"https://login.microsoftonline.com/{tenant_id()}/discovery/v2.0/keys")


def decode_token(token: str) -> dict:
    key = _jwks().get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience=audience(),
        issuer=f"https://login.microsoftonline.com/{tenant_id()}/v2.0",
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
    return User(oid=claims["oid"], roles=roles, dealer_id=dealer_id, token=token)
