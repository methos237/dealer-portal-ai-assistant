"""Sync one SharePoint document library into rag.documents / rag.chunks with a Graph delta query.

Driven by the timer Function in functions/. The first run walks the whole library; later runs
receive only items changed since the stored delta link. Files that are not Markdown or PDF are
ignored (same loaders as rag.ingest); deleted or renamed-away items lose their chunks.
"""

import hashlib
import os
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path

import httpx2 as httpx
import psycopg
from pgvector.psycopg import register_vector

from rag.embedder import Embedder
from rag.ingest import INGESTED_SUFFIXES, default_kind, load, upsert_document

GRAPH = "https://graph.microsoft.com/v1.0"
PATH_PREFIX = "sharepoint"


class Graph:
    """The two Graph calls the sync needs; app-only token from a provider so tests inject a fake."""

    def __init__(self, token: Callable[[], str], http: httpx.Client | None = None) -> None:
        self._token = token
        self._http = http or httpx.Client(timeout=60, follow_redirects=True)

    @classmethod
    def from_env(cls) -> "Graph":
        from azure.identity import ClientSecretCredential

        credential = ClientSecretCredential(
            os.environ["M365_TENANT_ID"],
            os.environ["M365_CLIENT_ID"],
            os.environ["M365_CLIENT_SECRET"],
        )
        return cls(lambda: credential.get_token("https://graph.microsoft.com/.default").token)

    def _get(self, url: str) -> httpx.Response:
        res = self._http.get(url, headers={"authorization": f"Bearer {self._token()}"})
        res.raise_for_status()
        return res

    def get(self, url: str) -> dict:
        return self._get(url if url.startswith("http") else f"{GRAPH}{url}").json()

    def download(self, drive_id: str, item_id: str) -> bytes:
        return self._get(f"{GRAPH}/drives/{drive_id}/items/{item_id}/content").content

    def pages(self, url: str) -> Iterator[dict]:
        """Follow @odata.nextLink; the last page carries @odata.deltaLink for delta queries."""
        while url:
            page = self.get(url)
            yield page
            url = page.get("@odata.nextLink", "")


def resolve_drive(graph: Graph, site: str, library: str) -> str:
    """Drive id of the library named `library` in `site` (site id or hostname:/sites/name)."""
    for page in graph.pages(f"/sites/{site}/drives?$select=id,name"):
        for drive in page["value"]:
            if drive["name"] == library:
                return drive["id"]
    raise LookupError(f"library {library!r} not found in site {site}")


def document_path(item: dict) -> str:
    parent = item.get("parentReference", {}).get("path", "")
    folder = parent.split("root:", 1)[1].strip("/") if "root:" in parent else ""
    return "/".join(p for p in (PATH_PREFIX, folder, item["name"]) if p)


def sync_library(
    conn: psycopg.Connection, embedder: Embedder, graph: Graph, drive_id: str
) -> dict[str, str]:
    """Apply one delta round. Returns {document path: indexed|skipped|deleted|ignored}."""
    register_vector(conn)
    row = conn.execute(
        "SELECT delta_link FROM rag.m365_sync WHERE drive_id = %s", (drive_id,)
    ).fetchone()
    results: dict[str, str] = {}
    delta_link = None
    for page in graph.pages(row[0] if row else f"/drives/{drive_id}/root/delta"):
        for item in page["value"]:
            external_id = f"{drive_id}:{item['id']}"
            if "deleted" in item:
                results[external_id] = _delete(conn, external_id)
            elif "file" in item:
                results[document_path(item)] = _upsert(conn, embedder, graph, drive_id, item)
        delta_link = page.get("@odata.deltaLink", delta_link)
    if delta_link:
        conn.execute(
            "INSERT INTO rag.m365_sync (drive_id, delta_link) VALUES (%s, %s)"
            " ON CONFLICT (drive_id) DO UPDATE SET delta_link = excluded.delta_link,"
            " synced_at = now()",
            (drive_id, delta_link),
        )
    conn.commit()
    return results


def _delete(conn: psycopg.Connection, external_id: str) -> str:
    deleted = conn.execute(
        "DELETE FROM rag.documents WHERE external_id = %s", (external_id,)
    ).rowcount
    return "deleted" if deleted else "ignored"


def _upsert(
    conn: psycopg.Connection, embedder: Embedder, graph: Graph, drive_id: str, item: dict
) -> str:
    external_id = f"{drive_id}:{item['id']}"
    suffix = Path(item["name"]).suffix.lower()
    if suffix not in INGESTED_SUFFIXES:
        return _delete(conn, external_id)  # also drops a doc renamed to an unsupported type
    data = graph.download(drive_id, item["id"])
    content_hash = hashlib.sha256(data).hexdigest()
    existing = conn.execute(
        "SELECT id, content_hash, path FROM rag.documents WHERE external_id = %s", (external_id,)
    ).fetchone()
    path = document_path(item)
    if existing and existing[1] == content_hash and existing[2] == path:
        return "skipped"
    with tempfile.TemporaryDirectory() as tmp:
        file = Path(tmp) / item["name"]
        file.write_bytes(data)
        title, chunks = load(file)
    return upsert_document(
        conn,
        embedder,
        existing_id=existing[0] if existing else None,
        path=path,
        title=title,
        kind=default_kind(item["name"]),
        chunks=chunks,
        content_hash=content_hash,
        external_id=external_id,
    )
