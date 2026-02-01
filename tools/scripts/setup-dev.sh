#!/bin/bash

# MedXrayChat Development Setup Script
# This script sets up the development environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "========================================"
echo "MedXrayChat Development Setup"
echo "========================================"
echo ""

cd "$PROJECT_ROOT"

# Check prerequisites
log_info "Checking prerequisites..."

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    log_info "Node.js: $NODE_VERSION"
else
    log_error "Node.js is not installed. Please install Node.js 20+"
    exit 1
fi

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    log_info "Python: $PYTHON_VERSION"
else
    log_error "Python 3 is not installed. Please install Python 3.11+"
    exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    log_info "Docker: $DOCKER_VERSION"
else
    log_warn "Docker is not installed. Some features may not work."
fi

# Setup Backend
log_info "Setting up backend..."
cd "$PROJECT_ROOT/apps/api"

# Create virtual environment
if [ ! -d "venv" ]; then
    log_info "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate venv and install dependencies
log_info "Installing Python dependencies..."
source venv/bin/activate || source venv/Scripts/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-dev.txt 2>/dev/null || pip install pytest pytest-cov ruff mypy

# Copy env example
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    log_info "Creating .env from .env.example..."
    cp .env.example .env
fi

# Setup Frontend
log_info "Setting up frontend..."
cd "$PROJECT_ROOT/apps/web"

# Install Node dependencies
log_info "Installing Node.js dependencies..."
npm install

# Copy env example
if [ ! -f ".env.local" ] && [ -f ".env.example" ]; then
    log_info "Creating .env.local from .env.example..."
    cp .env.example .env.local
fi

# Setup pre-commit hooks
cd "$PROJECT_ROOT"
if command -v pre-commit &> /dev/null; then
    log_info "Setting up pre-commit hooks..."
    pre-commit install
else
    log_warn "pre-commit not installed. Run: pip install pre-commit"
fi

# Start Docker services (if available)
if command -v docker-compose &> /dev/null; then
    log_info "Starting Docker services (PostgreSQL, Redis)..."
    docker-compose -f infra/docker/docker-compose.yml up -d postgres redis 2>/dev/null || log_warn "Docker services not started"
fi

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "To start development:"
echo ""
echo "  Backend:"
echo "    cd apps/api"
echo "    source venv/bin/activate"
echo "    uvicorn app.main:app --reload"
echo ""
echo "  Frontend:"
echo "    cd apps/web"
echo "    npm run dev"
echo ""
echo "  Or use make commands:"
echo "    make dev-api"
echo "    make dev-web"
echo ""
echo "========================================"
