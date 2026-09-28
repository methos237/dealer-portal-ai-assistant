"""rag.m365.sync_library against a fake Graph: full walk, then a delta with an edit and a delete."""

from rag.m365 import Graph, document_path, resolve_drive, sync_library
from tests.conftest import FakeEmbedder
from tests.test_ingest_retrieval import AWNING, FURNACE

DRIVE = "b!drive1"
SITE = "contoso.sharepoint.com:/sites/dealer-docs"


def item(id_: str, name: str, folder: str = "") -> dict:
    return {
        "id": id_,
        "name": name,
        "file": {"mimeType": "text/markdown"},
        "parentReference": {"driveId": DRIVE, "path": f"/drive/root:{folder}"},
    }


class FakeGraph(Graph):
    """Scripted responses keyed by URL; downloads served from `files`."""

    def __init__(self, responses: dict[str, dict], files: dict[str, bytes]) -> None:
        super().__init__(lambda: "t", http=None)
        self.responses, self.files, self.calls = responses, files, []

    def get(self, url: str) -> dict:
        self.calls.append(url)
        return self.responses[url]

    def download(self, drive_id: str, item_id: str) -> bytes:
        return self.files[item_id]


def test_full_walk_then_delta_edit_and_delete(conn) -> None:
    graph = FakeGraph(
        {
            f"/drives/{DRIVE}/root/delta": {
                "value": [
                    {"id": "root", "name": "root", "folder": {"childCount": 3}},
                    item("a1", "awning.md"),
                    item("f1", "sb-furnace.md", "/2026"),
                    item("x1", "photo.png"),
                ],
                "@odata.nextLink": "https://graph/next",
            },
            "https://graph/next": {"value": [], "@odata.deltaLink": "https://graph/delta-1"},
        },
        {"a1": AWNING.encode(), "f1": FURNACE.encode(), "x1": b"\x89PNG"},
    )
    first = sync_library(conn, FakeEmbedder(), graph, DRIVE)
    assert first == {
        "sharepoint/awning.md": "indexed",
        "sharepoint/2026/sb-furnace.md": "indexed",
        "sharepoint/photo.png": "ignored",
    }
    docs = dict(conn.execute("SELECT path, kind FROM rag.documents ORDER BY path").fetchall())
    assert docs == {
        "sharepoint/2026/sb-furnace.md": "ServiceBulletin",
        "sharepoint/awning.md": "OwnerManual",
    }
    assert conn.execute("SELECT count(*) FROM rag.chunks").fetchone()[0] == 2
    assert conn.execute("SELECT delta_link FROM rag.m365_sync").fetchone()[0] == (
        "https://graph/delta-1"
    )

    # second round: Graph is called with the stored delta link; awning edited, furnace deleted
    graph.responses["https://graph/delta-1"] = {
        "value": [
            item("a1", "awning.md"),
            {"id": "f1", "deleted": {"state": "deleted"}},
        ],
        "@odata.deltaLink": "https://graph/delta-2",
    }
    graph.files["a1"] = (AWNING + "\n## Cleaning\n\nUse mild soap.\n").encode()
    graph.calls.clear()
    second = sync_library(conn, FakeEmbedder(), graph, DRIVE)
    assert graph.calls == ["https://graph/delta-1"]
    assert second == {"sharepoint/awning.md": "indexed", f"{DRIVE}:f1": "deleted"}
    assert [r[0] for r in conn.execute("SELECT path FROM rag.documents").fetchall()] == [
        "sharepoint/awning.md"
    ]
    assert conn.execute("SELECT count(*) FROM rag.chunks").fetchone()[0] == 2  # 2 sections now
    assert conn.execute("SELECT delta_link FROM rag.m365_sync").fetchone()[0] == (
        "https://graph/delta-2"
    )

    # unchanged content on a third round is a no-op
    graph.responses["https://graph/delta-2"] = {
        "value": [item("a1", "awning.md")],
        "@odata.deltaLink": "https://graph/delta-3",
    }
    assert sync_library(conn, FakeEmbedder(), graph, DRIVE) == {"sharepoint/awning.md": "skipped"}


def test_resolve_drive_by_library_name() -> None:
    graph = FakeGraph(
        {
            f"/sites/{SITE}/drives?$select=id,name": {
                "value": [{"id": "d0", "name": "Documents"}, {"id": "d1", "name": "Bulletins"}]
            }
        },
        {},
    )
    assert resolve_drive(graph, SITE, "Bulletins") == "d1"


def test_document_path_keeps_folder() -> None:
    assert document_path(item("i", "a.md")) == "sharepoint/a.md"
    assert document_path(item("i", "a.md", "/Bulletins/2026")) == "sharepoint/Bulletins/2026/a.md"
