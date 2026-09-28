"""Index fixture documents into rag.documents / rag.chunks. Idempotent by content hash.

Usage: uv run --env-file ../.env python -m rag.ingest fixtures/docs
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector
from pypdf import PdfReader

from rag.chunking import Chunk, chunk_markdown, chunk_pdf_pages
from rag.embedder import Embedder, get_embedder
from rag.settings import database_url


def load(path: Path) -> tuple[str, list[Chunk]]:
    """Return (title, chunks) for a Markdown or PDF file."""
    if path.suffix.lower() == ".pdf":
        pages = [p.extract_text() or "" for p in PdfReader(str(path)).pages]
        title = (
            next((ln.strip() for ln in pages[0].splitlines() if ln.strip()), path.stem)
            if pages
            else path.stem
        )
        return title, chunk_pdf_pages(pages, title)
    text = path.read_text(encoding="utf-8")
    m = re.search(r"^#\s+(.+)$", text, re.M)
    title = m.group(1).strip() if m else path.stem
    return title, chunk_markdown(text, title)


def _portal_document(conn: psycopg.Connection, filename: str) -> dict:
    """Mirror kind/model/id from portal.documents when that table exists (not in unit tests)."""
    try:
        with conn.transaction():
            row = conn.execute(
                "SELECT id, kind, model FROM portal.documents WHERE path = %s", (filename,)
            ).fetchone()
    except psycopg.errors.UndefinedTable:
        return {}
    return {"portal_document_id": row[0], "kind": row[1], "model": row[2]} if row else {}


def ingest_file(conn: psycopg.Connection, embedder: Embedder, path: Path) -> str:
    """Index one file. Returns 'skipped' when the content hash is unchanged, else 'indexed'."""
    content_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    existing = conn.execute(
        "SELECT id, content_hash FROM rag.documents WHERE path = %s", (path.name,)
    ).fetchone()
    if existing and existing[1] == content_hash:
        return "skipped"

    title, chunks = load(path)
    portal = _portal_document(conn, path.name)
    kind = portal.get("kind") or (
        "ServiceBulletin" if path.name.startswith("sb-") else "OwnerManual"
    )
    vectors = embedder.embed([c.text for c in chunks])

    with conn.transaction():
        if existing:
            conn.execute("DELETE FROM rag.chunks WHERE doc_id = %s", (existing[0],))
            conn.execute(
                "UPDATE rag.documents SET title=%s, kind=%s, model=%s, portal_document_id=%s,"
                " content_hash=%s, indexed_at=now() WHERE id=%s",
                (
                    title,
                    kind,
                    portal.get("model"),
                    portal.get("portal_document_id"),
                    content_hash,
                    existing[0],
                ),
            )
            doc_id = existing[0]
        else:
            doc_id = conn.execute(
                "INSERT INTO rag.documents"
                " (path, title, kind, model, portal_document_id, content_hash)"
                " VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                (
                    path.name,
                    title,
                    kind,
                    portal.get("model"),
                    portal.get("portal_document_id"),
                    content_hash,
                ),
            ).fetchone()[0]
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO rag.chunks (doc_id, ord, text, embedding, metadata)"
                " VALUES (%s, %s, %s, %s, %s)",
                [
                    (doc_id, i, c.text, Vector(v), json.dumps(c.metadata))
                    for i, (c, v) in enumerate(zip(chunks, vectors, strict=True))
                ],
            )
    return "indexed"


def ingest_dir(conn: psycopg.Connection, embedder: Embedder, directory: Path) -> dict[str, str]:
    register_vector(conn)
    files = sorted(p for p in directory.iterdir() if p.suffix.lower() in {".md", ".pdf"})
    return {p.name: ingest_file(conn, embedder, p) for p in files}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m rag.ingest <directory>")
    with psycopg.connect(database_url()) as conn:
        for name, result in ingest_dir(conn, get_embedder(), Path(sys.argv[1])).items():
            print(f"{result:8} {name}")
