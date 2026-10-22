#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$DIR/.."
cd "$PROJECT_ROOT"

log()     { echo -e "\033[0;36m[spendai]\033[0m $1"; }
success() { echo -e "\033[0;32m[✔]\033[0m $1"; }
error()   { echo -e "\033[0;31m[✘]\033[0m $1"; exit 1; }

# Check .env files
log "Checking .env files..."
[[ -f "$PROJECT_ROOT/backend-fastapi/.env" ]] || error "Missing backend-fastapi/.env"
[[ -f "$PROJECT_ROOT/frontend/.env" ]] || error "Missing frontend/.env"
success ".env files found."

# Start containers (no rebuild, keeps node_modules volumes)
log "Starting all services..."
docker-compose up -d --remove-orphans
success "Containers started."

# Health checks
wait_for() {
  local name=$1
  local attempts=0
  log "Waiting for ${name}..."
  while [[ $attempts -lt 30 ]]; do
    status=$(docker inspect --format='{{.State.Status}}' "$name" 2>/dev/null || echo "missing")
    [[ "$status" == "running" ]] && { success "${name} is up."; return 0; }
    attempts=$((attempts + 1))
    sleep 2
  done
  error "${name} failed to start. Check: docker logs -f ${name}"
}

wait_for "spendai-db-1"
wait_for "spendai-backend-1"
wait_for "spendai-frontend-1"

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