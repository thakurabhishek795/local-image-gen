#!/usr/bin/env bash
# =============================================================================
# run.sh - Startup script for Linux / macOS
# =============================================================================
set -e

echo "======================================================="
echo "  Starting Local Image Generation Web Service (Unix)  "
echo "======================================================="

# Ensure .env exists
if [ ! -f ".env" ]; then
    echo "[.env] not found. Copying default configuration from .env.example..."
    cp .env.example .env
fi

# Activate virtual environment if present
if [ -d "venv" ]; then
    echo "Activating virtual environment (venv)..."
    source venv/bin/activate
elif [ -d ".venv" ]; then
    echo "Activating virtual environment (.venv)..."
    source .venv/bin/activate
else
    echo "[Notice] No virtual environment detected in venv/ or .venv/."
    echo "Using default system Python..."
fi

# Launch the FastAPI service
exec python -m app.main "$@"
