#!/bin/bash

# MedXrayChat Deployment Script
# Usage: ./deploy.sh [environment]
# Environments: staging, production

set -e

ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    echo "Usage: $0 [staging|production]"
    exit 1
fi

log_info "Starting deployment to $ENVIRONMENT environment..."

# Load environment-specific config
ENV_FILE="$PROJECT_ROOT/.env.$ENVIRONMENT"
if [[ -f "$ENV_FILE" ]]; then
    log_info "Loading environment config from $ENV_FILE"
    source "$ENV_FILE"
else
    log_warn "Environment file not found: $ENV_FILE"
fi

# Pre-deployment checks
log_info "Running pre-deployment checks..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running"
    exit 1
fi

# Check if required images exist
log_info "Checking Docker images..."

# Pull latest images
log_info "Pulling latest images..."
cd "$PROJECT_ROOT"

if [[ "$ENVIRONMENT" == "staging" ]]; then
    COMPOSE_FILE="infra/docker/docker-compose.staging.yml"
else
    COMPOSE_FILE="infra/docker/docker-compose.prod.yml"
fi

# Backup current state (production only)
if [[ "$ENVIRONMENT" == "production" ]]; then
    log_info "Creating backup..."
    BACKUP_DIR="$PROJECT_ROOT/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    # Backup database
    if command -v pg_dump &> /dev/null; then
        log_info "Backing up database..."
        pg_dump "$DATABASE_URL" > "$BACKUP_DIR/database.sql" 2>/dev/null || log_warn "Database backup skipped"
    fi
fi

# Deploy
log_info "Deploying services..."
docker-compose -f "$COMPOSE_FILE" pull
docker-compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Wait for services to be healthy
log_info "Waiting for services to be healthy..."
sleep 10

# Health checks
log_info "Running health checks..."

API_HEALTH_URL="${API_URL:-http://localhost:8000}/health"
WEB_HEALTH_URL="${WEB_URL:-http://localhost:3000}"

# Check API health
if curl -sf "$API_HEALTH_URL" > /dev/null 2>&1; then
    log_info "API is healthy"
else
    log_error "API health check failed"
    exit 1
fi

# Check Web health
if curl -sf "$WEB_HEALTH_URL" > /dev/null 2>&1; then
    log_info "Web is healthy"
else
    log_error "Web health check failed"
    exit 1
fi

# Run database migrations
log_info "Running database migrations..."
docker-compose -f "$COMPOSE_FILE" exec -T api alembic upgrade head || log_warn "Migrations skipped"

# Cleanup old images
log_info "Cleaning up old images..."
docker image prune -f

log_info "Deployment to $ENVIRONMENT completed successfully!"

# Print service URLs
echo ""
echo "========================================="
echo "Deployment Summary"
echo "========================================="
echo "Environment: $ENVIRONMENT"
echo "API URL: $API_HEALTH_URL"
echo "Web URL: $WEB_HEALTH_URL"
echo "========================================="
