#!/usr/bin/env bash
# =============================================================================
#  CIM SemanticGraph Platform - Stop All Services
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
PORTS_FILE="$SCRIPT_DIR/.dev.ports"

log()     { echo -e "${BOLD}${BLUE}[CIM]${RESET} $*"; }
success() { echo -e "${GREEN}  [ok]${RESET} $*"; }
warn()    { echo -e "${YELLOW}  [!]${RESET} $*"; }

# Docker Compose wrapper - supports both v1 (docker-compose) and v2 (docker compose)
docker_compose() {
  if docker compose version &>/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose &>/dev/null; then
    docker-compose "$@"
  else
    warn "Neither 'docker compose' nor 'docker-compose' found."
    return 1
  fi
}

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

# Same as kill_port, but only when the port answers as one of our services.
kill_port_if_ours() {
  local port=$1 name=$2 url=$3 marker=$4
  lsof -ti ":$port" &>/dev/null || return 0

  if curl -sf --max-time 2 "$url" 2>/dev/null | grep -q "$marker"; then
    kill_port "$port" "$name"
  else
    warn "Port $port is used by another application - left untouched"
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

# ── Kill the exact ports this run used ────────────────────────────────────────
# dev.sh records where each service actually landed, which matters because
# powerflow and Vite both relocate when their default port is taken. Killing
# only the recorded ports also avoids tearing down an unrelated application.
if [ -f "$PORTS_FILE" ]; then
  while IFS='=' read -r name port; do
    [ -n "${port:-}" ] && kill_port "$port" "$name"
  done < "$PORTS_FILE"
  rm -f "$PORTS_FILE"
else
  warn "No .dev.ports file - probing the default ports"
  # Without the port file we cannot know what dev.sh started, so every port is
  # probed first. Killing a port blindly here once shut down an unrelated
  # application that happened to use 8000.
  kill_port_if_ours 8000 "Powerflow"          "http://localhost:8000/health"             '"service":"powerflow"'
  kill_port_if_ours 8080 "Backend"            "http://localhost:8080/api/actuator/health" '"status"'
  kill_port_if_ours 3000 "Frontend"           "http://localhost:3000"                    "CIM"
  kill_port_if_ours 3001 "Frontend (fallback)" "http://localhost:3001"                   "CIM"
  kill_port_if_ours 5173 "Frontend (Vite)"    "http://localhost:5173"                    "CIM"
fi

# ── Stop Docker services ───────────────────────────────────────────────────────
if [ -f "$BACKEND_DIR/docker-compose.yml" ]; then
  log "Stopping Docker containers (Fuseki + Qdrant)..."
  cd "$BACKEND_DIR"
  docker_compose down 2>/dev/null && success "Docker services stopped" || warn "Docker services already stopped"
fi

echo -e "\n${GREEN}${BOLD}All services stopped.${RESET}\n"
