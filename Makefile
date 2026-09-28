# Local development. `make dev` starts Postgres and the three dev servers; Ctrl-C stops them.
.PHONY: dev up down setup api web assistant m365 functions migrate ingest evals check

ENV_FILE := $(CURDIR)/.env

dev: up
	$(MAKE) -j3 api web assistant

up:
	docker compose up -d --wait

down:
	docker compose down

## One-time: install dependencies and point web at the root .env
setup:
	test -f .env || cp .env.example .env
	ln -sf ../.env web/.env.local
	cd web && npm install
	cd api && dotnet restore
	cd assistant && uv sync
	cd mcp-m365 && npm install
	cd functions && uv sync

api:
	cd api && dotnet run --project src/DealerPortal.Api

web:
	cd web && npm run dev

assistant:
	cd assistant && uv run --env-file $(ENV_FILE) fastapi dev app/main.py

## Phase 4: SharePoint connector (needs the M365_* values in .env)
m365:
	cd mcp-m365 && set -a && . $(ENV_FILE) && set +a && npm run dev

functions:
	cd functions && uv run --env-file $(ENV_FILE) python function_app.py

migrate:
	cd assistant && uv run --env-file $(ENV_FILE) python -m rag.migrate

ingest:
	cd assistant && uv run --env-file $(ENV_FILE) python -m rag.ingest fixtures/docs

evals:
	cd assistant && uv run --env-file $(ENV_FILE) evals --suite retrieval

## Everything CI runs, locally
check:
	cd web && npm run lint && npm run typecheck && npm run format:check && npm test
	cd api && dotnet format --verify-no-changes && dotnet test -v q --nologo
	cd assistant && uv run ruff format --check && uv run ruff check && uv run pytest -q -m "not live"
	cd mcp-m365 && npm run lint && npm run typecheck && npm run format:check && npm test
	cd functions && uv run ruff format --check && uv run ruff check
	az bicep build --file infra/main.bicep --stdout > /dev/null
