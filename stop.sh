#!/usr/bin/env bash
# =============================================================================
#  CIM SemanticGraph Platform — Stop All Services
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
PID_FILE="$SCRIPT_DIR/.dev.pids"

log()     { echo -e "${BOLD}${BLUE}[CIM]${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${RESET} $*"; }

echo -e "\n${BOLD}${RED}Stopping CIM SemanticGraph Platform...${RESET}\n"

# ── Stop processes from PID file ──────────────────────────────────────────────
if [ -f "$PID_FILE" ]; then
  while IFS='=' read -r name pid; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && success "Stopped $name (PID $pid)"
    else
      warn "$name (PID $pid) was not running"
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
else
  warn "No PID file found — trying to find processes by port"

  # Kill by port as fallback
  for port in 8000 8080 5173; do
    pid=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null && success "Killed process on port $port (PID $pid)"
    fi
  done
fi

# ── Stop Docker services ───────────────────────────────────────────────────────
if [ -f "$BACKEND_DIR/docker-compose.yml" ]; then
  log "Stopping Docker containers (Fuseki + Qdrant)..."
  cd "$BACKEND_DIR"
  docker-compose down && success "Docker services stopped"
fi

echo -e "\n${GREEN}${BOLD}All services stopped.${RESET}\n"
