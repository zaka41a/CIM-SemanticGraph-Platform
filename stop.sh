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

# ── Helper: kill all processes on a port ──────────────────────────────────────
kill_port() {
  local port=$1
  local name=$2
  local pids
  pids=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    success "Stopped $name (port $port)"
  fi
}

# ── Stop processes from PID file (+ their children) ───────────────────────────
if [ -f "$PID_FILE" ]; then
  while IFS='=' read -r name pid; do
    if kill -0 "$pid" 2>/dev/null; then
      # Kill the entire process group to catch forked children (e.g. Spring Boot JVM)
      pkill -9 -P "$pid" 2>/dev/null || true
      kill -9 "$pid" 2>/dev/null || true
      success "Stopped $name (PID $pid)"
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# ── Always kill by port — catches any surviving processes ─────────────────────
kill_port 3000  "Frontend"
kill_port 5173  "Frontend (Vite)"
kill_port 8080  "Backend (Spring Boot)"
kill_port 8000  "Powerflow"

# ── Stop Docker services ───────────────────────────────────────────────────────
if [ -f "$BACKEND_DIR/docker-compose.yml" ]; then
  log "Stopping Docker containers (Fuseki + Qdrant)..."
  cd "$BACKEND_DIR"
  docker-compose down 2>/dev/null && success "Docker services stopped" || warn "Docker services already stopped"
fi

echo -e "\n${GREEN}${BOLD}All services stopped.${RESET}\n"
