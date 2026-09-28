-- Runs once on first start against POSTGRES_DB (dealer_portal).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS portal;   -- owned by EF Core migrations (api)
CREATE SCHEMA IF NOT EXISTS rag;      -- owned by assistant/migrations (rag.migrate)
