"""Apply migrations/NNN_*.sql to the database in order, once each.

Usage: DATABASE_URL=postgresql://... uv run python -m rag.migrate
"""

from pathlib import Path
from string import Template

import psycopg

from rag.settings import database_url, embedding_dim, embedding_provider

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def migrate(dsn: str, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply pending migrations and return the names applied."""
    applied: list[str] = []
    with psycopg.connect(dsn) as conn:
        conn.execute("CREATE SCHEMA IF NOT EXISTS rag")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS rag.schema_migrations ("
            " name text PRIMARY KEY,"
            " applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {row[0] for row in conn.execute("SELECT name FROM rag.schema_migrations")}
        for path in sorted(migrations_dir.glob("[0-9][0-9][0-9]_*.sql")):
            if path.name in done:
                continue
            with conn.transaction():
                conn.execute(
                    Template(path.read_text()).safe_substitute(
                        EMBEDDING_DIM=embedding_dim(), EMBEDDING_PROVIDER=embedding_provider()
                    )
                )
                conn.execute("INSERT INTO rag.schema_migrations (name) VALUES (%s)", (path.name,))
            applied.append(path.name)
    return applied


if __name__ == "__main__":
    for name in migrate(database_url()):
        print("applied", name)
