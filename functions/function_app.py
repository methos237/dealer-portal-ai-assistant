"""Timer-triggered SharePoint ingestion: Graph delta on one library, chunk, embed, upsert chunks.

Everything but the trigger lives in the assistant's `rag` package (path dependency), so the
Function and `rag.ingest` index documents the same way with the same embedder selection.
"""

import logging
import os
from collections import Counter

import azure.functions as func
import psycopg
from rag.embedder import get_embedder
from rag.m365 import Graph, resolve_drive, sync_library
from rag.settings import database_url

app = func.FunctionApp()


def run_sync() -> dict[str, str]:
    graph = Graph.from_env()
    site = os.environ["M365_SITE"]
    library = os.environ.get("M365_LIBRARY", "Documents")
    with psycopg.connect(database_url()) as conn:
        drive_id = resolve_drive(graph, site, library)
        return sync_library(conn, get_embedder(), graph, drive_id)


@app.timer_trigger(schedule="0 */15 * * * *", arg_name="timer", run_on_startup=False)
def ingest_m365(timer: func.TimerRequest) -> None:
    results = run_sync()
    logging.info("m365 sync: %s", dict(Counter(results.values())) or "no changes")
    for path, result in results.items():
        if result != "ignored":
            logging.info("%-8s %s", result, path)


if __name__ == "__main__":  # `uv run python function_app.py`: one sync without the Functions host
    for path, result in run_sync().items():
        print(f"{result:8} {path}")
