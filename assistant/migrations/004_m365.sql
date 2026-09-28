-- SharePoint ingestion (functions/): documents synced from a library carry the Graph item id so
-- renames update in place and deletions remove the right rows; one delta link per drive.
ALTER TABLE rag.documents ADD COLUMN external_id text UNIQUE;

CREATE TABLE rag.m365_sync (
    drive_id   text PRIMARY KEY,
    delta_link text NOT NULL,
    synced_at  timestamptz NOT NULL DEFAULT now()
);
