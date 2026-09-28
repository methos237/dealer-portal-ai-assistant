from pathlib import Path

from rag.ingest import ingest_dir
from rag.retrieval import retrieve
from tests.conftest import FakeEmbedder

AWNING = """# Awning Guide

## Wind limits

Retract the awning motor AWN-1200 when wind exceeds 20 mph.
The awning fabric tears above that speed.
"""
FURNACE = """# Furnace Guide

## Sail switch

Fault code E3 means the furnace sail switch FRN-SAIL did not close
within 30 seconds of blower start.
"""


def write_docs(directory: Path) -> None:
    (directory / "awning.md").write_text(AWNING)
    (directory / "sb-furnace.md").write_text(FURNACE)


def test_ingest_is_idempotent_by_content_hash(conn, tmp_path) -> None:
    write_docs(tmp_path)
    first = ingest_dir(conn, FakeEmbedder(), tmp_path)
    second = ingest_dir(conn, FakeEmbedder(), tmp_path)
    assert first == {"awning.md": "indexed", "sb-furnace.md": "indexed"}
    assert second == {"awning.md": "skipped", "sb-furnace.md": "skipped"}

    (tmp_path / "awning.md").write_text(AWNING + "\n## Cleaning\n\nUse mild soap.\n")
    third = ingest_dir(conn, FakeEmbedder(), tmp_path)
    assert third["awning.md"] == "indexed"
    kinds = dict(conn.execute("SELECT path, kind FROM rag.documents").fetchall())
    assert kinds == {"awning.md": "OwnerManual", "sb-furnace.md": "ServiceBulletin"}
    assert conn.execute("SELECT count(*) FROM rag.chunks").fetchone()[0] == 3
    conn.commit()


def test_hybrid_retrieval_ranks_the_matching_document_first(conn, tmp_path) -> None:
    write_docs(tmp_path)
    ingest_dir(conn, FakeEmbedder(), tmp_path)

    hits = retrieve(conn, FakeEmbedder(), "furnace fault code E3 sail switch")
    assert hits[0].path == "sb-furnace.md"
    assert hits[0].metadata["section"] == "Sail switch"
    assert hits[0].score > hits[-1].score or len(hits) == 1

    hits = retrieve(conn, FakeEmbedder(), "awning wind speed limit")
    assert hits[0].path == "awning.md"


def test_dealer_scoped_documents_are_hidden_from_other_dealers(conn, tmp_path) -> None:
    write_docs(tmp_path)
    ingest_dir(conn, FakeEmbedder(), tmp_path)
    conn.execute("UPDATE rag.documents SET dealer_id = 2 WHERE path = 'awning.md'")

    assert all(
        h.path != "awning.md" for h in retrieve(conn, FakeEmbedder(), "awning wind", dealer_id=1)
    )
    assert retrieve(conn, FakeEmbedder(), "awning wind", dealer_id=2)[0].path == "awning.md"
    assert retrieve(conn, FakeEmbedder(), "awning wind", dealer_id=None)[0].path == "awning.md"


def test_pdf_fixture_is_ingested_with_page_metadata(conn) -> None:
    pdf_dir = Path(__file__).resolve().parent.parent / "fixtures" / "docs" / "pdf"
    results = ingest_dir(conn, FakeEmbedder(), pdf_dir)
    assert results["owner-manual-aria.pdf"] == "indexed"
    row = conn.execute(
        "SELECT d.title, c.metadata FROM rag.chunks c JOIN rag.documents d ON d.id = c.doc_id"
        " WHERE d.path = 'owner-manual-aria.pdf' ORDER BY c.ord LIMIT 1"
    ).fetchone()
    assert row[0].startswith("Aria Owners Manual")
    assert row[1]["page"] == 1
