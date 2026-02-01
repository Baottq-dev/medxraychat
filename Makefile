.PHONY: help dev dev-api dev-web test test-e2e lint format build deploy-staging deploy-prod clean

help:
	@echo "MedXrayChat - Available commands:"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start all services with Docker Compose"
	@echo "  make dev-api      - Start API server locally"
	@echo "  make dev-web      - Start web frontend locally"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Run all tests"
	@echo "  make test-api     - Run API tests"
	@echo "  make test-web     - Run web tests"
	@echo "  make test-e2e     - Run E2E tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint         - Run linters"
	@echo "  make format       - Format code"
	@echo ""
	@echo "Build & Deploy:"
	@echo "  make build        - Build production images"
	@echo "  make deploy-staging - Deploy to staging"
	@echo "  make deploy-prod  - Deploy to production"

# Development
dev:
	docker-compose -f infra/docker/docker-compose.yml up

dev-api:
	cd apps/api && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-web:
	cd apps/web && npm run dev

# Testing
test: test-api test-web

test-api:
	cd apps/api && python -m pytest tests/ -v --cov=app --cov-report=term-missing

test-web:
	cd apps/web && npm run test:run

test-e2e:
	cd apps/web && npm run test:e2e

# Code Quality
lint: lint-api lint-web

lint-api:
	cd apps/api && python -m ruff check app tests
	cd apps/api && python -m mypy app

lint-web:
	cd apps/web && npm run lint
	cd apps/web && npm run type-check

format: format-api format-web

format-api:
	cd apps/api && python -m ruff format app tests

format-web:
	cd apps/web && npm run format

# Build
build:
	docker-compose -f infra/docker/docker-compose.prod.yml build

build-api:
	docker build -f infra/docker/Dockerfile.backend -t medxraychat-api .

build-web:
	docker build -f infra/docker/Dockerfile.frontend -t medxraychat-web .

# Deploy
deploy-staging:
	./tools/scripts/deploy.sh staging

deploy-prod:
	./tools/scripts/deploy.sh production

# Utilities
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .next -exec rm -rf {} + 2>/dev/null || true

install:
	cd apps/api && pip install -r requirements.txt
	cd apps/web && npm install

db-migrate:
	cd apps/api && alembic upgrade head

db-rollback:
	cd apps/api && alembic downgrade -1
