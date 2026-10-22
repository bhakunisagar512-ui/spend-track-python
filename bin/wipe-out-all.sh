#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$DIR/.."
cd "$PROJECT_ROOT"

log()     { echo -e "\033[0;36m[spendai]\033[0m $1"; }
success() { echo -e "\033[0;32m[✔]\033[0m $1"; }
error()   { echo -e "\033[0;31m[✘]\033[0m $1"; exit 1; }
warn()    { echo -e "\033[0;33m[!]\033[0m $1"; }

# ── Safety confirmation ───────────────────────────────────────────────────────
echo ""
warn "This will permanently delete:"
echo "     • All SpendAI containers"
echo "     • postgres_data  (all your database data)"
echo "     • frontend_modules"
echo "     • .first-run-done sentinel"
echo ""
read -rp "  Are you sure? Type 'yes' to continue: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }
echo ""

# ── Stop and remove containers + networks ─────────────────────────────────────
log "Stopping and removing containers..."
docker-compose down --remove-orphans
success "Containers and networks removed."

# ── Remove project volumes only ───────────────────────────────────────────────
log "Removing project volumes..."
docker volume rm spendai_postgres_data spendai_frontend_modules 2>/dev/null && \
  success "Volumes removed." || \
  warn "Some volumes were already absent — skipped."

# ── Remove sentinel so first-run.sh can run again ────────────────────────────
SENTINEL="$PROJECT_ROOT/.first-run-done"
if [[ -f "$SENTINEL" ]]; then
  rm "$SENTINEL"
  success "Sentinel removed. You can run bin/first-run.sh again."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SpendAI — Wiped Clean 🧹"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  To start fresh:  bin/first-run.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""