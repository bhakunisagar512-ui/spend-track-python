#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$DIR/.."
cd "$PROJECT_ROOT"

log()     { echo -e "\033[0;36m[spendai]\033[0m $1"; }
success() { echo -e "\033[0;32m[✔]\033[0m $1"; }
error()   { echo -e "\033[0;31m[✘]\033[0m $1"; exit 1; }

# ── Check .env files ──────────────────────────────────────────────────────────
log "Checking .env files..."
[[ -f "$PROJECT_ROOT/backend-fastapi/.env" ]] || error "Missing backend-fastapi/.env"
[[ -f "$PROJECT_ROOT/frontend/.env" ]] || error "Missing frontend/.env"
success ".env files found."

# ── Stop old containers (keep volumes) ────────────────────────────────────────
log "Stopping old containers..."
docker-compose down --remove-orphans
success "Old containers removed. Volumes kept."

# ── Start all services ────────────────────────────────────────────────────────
log "Building and starting all services..."
docker-compose up -d --build
success "Containers started. Waiting for servers..."

# ── Stream logs in background so user sees real progress ──────────────────────
docker-compose logs -f --tail=0 &
LOGS_PID=$!

# ── Wait for DB ───────────────────────────────────────────────────────────────
wait_for_db() {
  local attempts=0
  log "Waiting for database..."
  while [[ $attempts -lt 30 ]]; do
    if docker exec spendai-db-1 pg_isready -U username -d spendai_db > /dev/null 2>&1; then
      success "Database is ready."
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 2
  done
  kill $LOGS_PID 2>/dev/null
  error "Database failed to start. Check: docker-compose logs -f db"
}

# ── Wait for HTTP endpoints ───────────────────────────────────────────────────
wait_for_http() {
  local name=$1
  local url=$2
  local attempts=0
  log "Waiting for ${name} → ${url}"
  while [[ $attempts -lt 60 ]]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      success "${name} is ready."
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 3
  done
  kill $LOGS_PID 2>/dev/null
  error "${name} failed to respond after 3 min. Check: docker-compose logs -f"
}

wait_for_db

# The backend container runs migrations (idempotent) before starting the API,
# so a healthy /health means the schema is in place
wait_for_http "Backend"  "http://localhost:5000/health"
wait_for_http "Frontend" "http://localhost:3000"

# ── Kill background log stream once everything is up ─────────────────────────
kill $LOGS_PID 2>/dev/null
wait $LOGS_PID 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SpendAI — All Services Running 🚀"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Frontend  →  http://localhost:3000"
echo "  Backend   →  http://localhost:5000"
echo "  Database  →  localhost:5432"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Logs:  docker-compose logs -f"
echo "  Stop:  bin/stop-dev.sh"
echo ""