#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Generating .env files (if missing)..."

if [ -f "$ROOT_DIR/frontend/.env" ]; then
  echo "frontend/.env exists — skipping"
else
  if [ -f "$ROOT_DIR/frontend/.env.example" ]; then
    cp "$ROOT_DIR/frontend/.env.example" "$ROOT_DIR/frontend/.env"
    echo "Created frontend/.env from frontend/.env.example"
  else
    echo "No frontend/.env.example found — create frontend/.env manually"
  fi
fi

if [ -f "$ROOT_DIR/backend-fastapi/.env" ]; then
  echo "backend-fastapi/.env exists — skipping"
else
  if [ -f "$ROOT_DIR/backend-fastapi/.env.example" ]; then
    cp "$ROOT_DIR/backend-fastapi/.env.example" "$ROOT_DIR/backend-fastapi/.env"
    echo "Created backend-fastapi/.env from backend-fastapi/.env.example"
  else
    echo "No backend-fastapi/.env.example found — create backend-fastapi/.env manually"
  fi
fi

echo "Generation complete. Edit the created files to customize values."
