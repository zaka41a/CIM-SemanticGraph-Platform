#!/usr/bin/env bash
# =============================================================================
#  CIM SemanticGraph Platform — Development Startup Script
#  Usage:
#    ./dev.sh           → start all services
#    ./dev.sh --infra   → infrastructure only (Fuseki + Qdrant)
#    ./dev.sh --backend → backend + infra only
#    ./dev.sh --status  → show status of all services
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
POWERFLOW_DIR="$SCRIPT_DIR/powerflow-service"
ENV_FILE="$BACKEND_DIR/.env"
LOG_DIR="$SCRIPT_DIR/.logs"
PID_FILE="$SCRIPT_DIR/.dev.pids"

# ── Ports ─────────────────────────────────────────────────────────────────────
PORT_FUSEKI=3030
PORT_QDRANT=6333
PORT_POWERFLOW=8000
PORT_BACKEND=8080
PORT_FRONTEND=3000

# ── Flags ─────────────────────────────────────────────────────────────────────
START_INFRA=true
START_POWERFLOW=true
START_BACKEND=true
START_FRONTEND=true

# Parse args
for arg in "$@"; do
  case $arg in
    --infra)    START_POWERFLOW=false; START_BACKEND=false; START_FRONTEND=false ;;
    --backend)  START_FRONTEND=false ;;
    --status)   show_status; exit 0 ;;
    --help|-h)  usage; exit 0 ;;
  esac
done

# =============================================================================
# Helpers
# =============================================================================

log()     { echo -e "${BOLD}${BLUE}[CIM]${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${RESET} $*"; }
error()   { echo -e "${RED}  ✗${RESET} $*"; }
header()  { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${RESET}"; }

usage() {
  echo -e "${BOLD}Usage:${RESET}"
  echo "  ./dev.sh             Start all services"
  echo "  ./dev.sh --infra     Infrastructure only (Fuseki + Qdrant)"
  echo "  ./dev.sh --backend   Backend + infra (no frontend)"
  echo "  ./dev.sh --status    Show service status"
  echo "  ./dev.sh --help      Show this help"
}

check_port() {
  lsof -i ":$1" &>/dev/null
}

wait_for_http() {
  local url=$1
  local name=$2
  local max_wait=${3:-60}
  local elapsed=0

  printf "  Waiting for %-20s" "$name..."
  while ! curl -sf "$url" &>/dev/null; do
    if [ $elapsed -ge $max_wait ]; then
      echo -e " ${RED}TIMEOUT${RESET}"
      return 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    printf "."
  done
  echo -e " ${GREEN}ready${RESET} (${elapsed}s)"
  return 0
}

save_pid() {
  echo "$1=$2" >> "$PID_FILE"
}

show_status() {
  header "Service Status"
  check_port $PORT_FUSEKI    && success "Fuseki      → http://localhost:$PORT_FUSEKI"    || warn "Fuseki      → NOT running"
  check_port $PORT_QDRANT    && success "Qdrant      → http://localhost:$PORT_QDRANT"    || warn "Qdrant      → NOT running"
  check_port $PORT_POWERFLOW && success "Powerflow   → http://localhost:$PORT_POWERFLOW" || warn "Powerflow   → NOT running"
  check_port $PORT_BACKEND   && success "Backend     → http://localhost:$PORT_BACKEND"   || warn "Backend     → NOT running"
  check_port $PORT_FRONTEND  && success "Frontend    → http://localhost:$PORT_FRONTEND"  || warn "Frontend    → NOT running"
}

# =============================================================================
# Prerequisite checks
# =============================================================================

check_prerequisites() {
  header "Checking Prerequisites"

  local missing=false

  command -v docker &>/dev/null   && success "Docker"    || { error "Docker not found";    missing=true; }
  command -v java   &>/dev/null   && success "Java"      || { error "Java not found";      missing=true; }
  command -v python3 &>/dev/null  && success "Python 3"  || { error "Python 3 not found";  missing=true; }
  command -v node   &>/dev/null   && success "Node.js"   || { error "Node.js not found";   missing=true; }
  command -v npm    &>/dev/null   && success "npm"        || { error "npm not found";        missing=true; }

  # Check Docker is running
  docker info &>/dev/null || { error "Docker daemon not running — start Docker Desktop"; missing=true; }

  # Check .env exists
  if [ -f "$ENV_FILE" ]; then
    success ".env file found"
  else
    error ".env not found at $ENV_FILE"
    missing=true
  fi

  $missing && { echo -e "\n${RED}Fix the missing prerequisites and retry.${RESET}"; exit 1; }

  # Check API keys
  if [ -f "$ENV_FILE" ]; then
    source_env

    [ -n "${CLAUDE_API_KEY:-}" ] && [[ "$CLAUDE_API_KEY" != "your-"* ]] \
      && success "Claude API key ✓" \
      || warn   "Claude API key not set — AI Agent will be disabled"

    [ -n "${OPENAI_API_KEY:-}" ] && [[ "$OPENAI_API_KEY" != "your-"* ]] \
      && success "OpenAI API key ✓" \
      || warn   "OpenAI API key not set — vector embeddings will use fallback"

    [ -n "${GROQ_API_KEY:-}" ] && [[ "$GROQ_API_KEY" != "your-"* ]] \
      && success "Groq API key ✓" \
      || warn   "Groq API key not set — LLM fallback disabled"
  fi
}

source_env() {
  set -a
  # shellcheck disable=SC1090
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] && export "$key=$value"
  done < <(grep -v '^#' "$ENV_FILE" | grep -v '^$' | grep '=')
  set +a
}

# =============================================================================
# Step 1 — Infrastructure (Fuseki + Qdrant)
# =============================================================================

start_infrastructure() {
  header "Infrastructure (Fuseki + Qdrant)"

  cd "$BACKEND_DIR"

  # Check if already running
  if check_port $PORT_FUSEKI && check_port $PORT_QDRANT; then
    success "Fuseki and Qdrant already running"
    return 0
  fi

  log "Starting Docker services..."
  docker-compose up -d fuseki qdrant

  wait_for_http "http://localhost:$PORT_FUSEKI/\$/ping" "Fuseki" 60 \
    || { error "Fuseki failed to start. Check: docker-compose logs fuseki"; exit 1; }

  wait_for_http "http://localhost:$PORT_QDRANT/healthz" "Qdrant" 30 \
    || { error "Qdrant failed to start. Check: docker-compose logs qdrant"; exit 1; }

  success "Infrastructure ready"
}

# =============================================================================
# Step 2 — Powerflow Service (Python)
# =============================================================================

start_powerflow() {
  header "Powerflow Service (Python)"

  if check_port $PORT_POWERFLOW; then
    success "Powerflow already running on :$PORT_POWERFLOW"
    return 0
  fi

  cd "$POWERFLOW_DIR"
  mkdir -p "$LOG_DIR"

  log "Installing Python dependencies..."
  pip install -r requirements.txt -q

  log "Starting uvicorn on port $PORT_POWERFLOW..."
  nohup python3 -m uvicorn app.main:app \
    --host 127.0.0.1 \
    --port $PORT_POWERFLOW \
    > "$LOG_DIR/powerflow.log" 2>&1 &

  save_pid "POWERFLOW" $!

  wait_for_http "http://localhost:$PORT_POWERFLOW/health" "Powerflow" 30 \
    || { error "Powerflow failed. Check: tail -f $LOG_DIR/powerflow.log"; exit 1; }

  success "Powerflow ready  → logs: $LOG_DIR/powerflow.log"
}

# =============================================================================
# Step 3 — Spring Boot Backend
# =============================================================================

start_backend() {
  header "Backend (Spring Boot)"

  if check_port $PORT_BACKEND; then
    success "Backend already running on :$PORT_BACKEND"
    return 0
  fi

  cd "$BACKEND_DIR"
  mkdir -p "$LOG_DIR"

  log "Loading environment variables from .env..."
  source_env

  log "Compiling & starting Spring Boot (this may take ~30s first time)..."
  nohup ./mvnw spring-boot:run \
    > "$LOG_DIR/backend.log" 2>&1 &

  save_pid "BACKEND" $!

  wait_for_http "http://localhost:$PORT_BACKEND/api/cim/health" "Backend" 120 \
    || { error "Backend failed. Check: tail -f $LOG_DIR/backend.log"; exit 1; }

  success "Backend ready    → logs: $LOG_DIR/backend.log"
}

# =============================================================================
# Step 4 — Frontend (React + Vite)
# =============================================================================

start_frontend() {
  header "Frontend (React + Vite)"

  if check_port $PORT_FRONTEND; then
    # Kill stale process holding the port so Vite gets the right port
    local stale_pid
    stale_pid=$(lsof -ti ":$PORT_FRONTEND" 2>/dev/null || true)
    if [ -n "$stale_pid" ]; then
      warn "Port $PORT_FRONTEND in use by PID $stale_pid — killing it..."
      kill "$stale_pid" 2>/dev/null || true
      sleep 1
    else
      success "Frontend already running on :$PORT_FRONTEND"
      return 0
    fi
  fi

  cd "$FRONTEND_DIR"
  mkdir -p "$LOG_DIR"

  log "Installing npm dependencies..."
  npm install --silent

  log "Starting Vite dev server..."
  nohup npm run dev \
    > "$LOG_DIR/frontend.log" 2>&1 &

  save_pid "FRONTEND" $!

  wait_for_http "http://localhost:$PORT_FRONTEND" "Frontend" 30 \
    || { error "Frontend failed. Check: tail -f $LOG_DIR/frontend.log"; exit 1; }

  success "Frontend ready   → logs: $LOG_DIR/frontend.log"
}

# =============================================================================
# Summary
# =============================================================================

print_summary() {
  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║   CIM SemanticGraph Platform — Running ✓     ║${RESET}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  ${CYAN}Frontend    ${RESET}→  http://localhost:$PORT_FRONTEND"
  echo -e "  ${CYAN}Backend API ${RESET}→  http://localhost:$PORT_BACKEND/api"
  echo -e "  ${CYAN}Swagger UI  ${RESET}→  http://localhost:$PORT_BACKEND/swagger-ui.html"
  echo -e "  ${CYAN}Fuseki UI   ${RESET}→  http://localhost:$PORT_FUSEKI"
  echo -e "  ${CYAN}Qdrant UI   ${RESET}→  http://localhost:$PORT_QDRANT/dashboard"
  echo -e "  ${CYAN}Powerflow   ${RESET}→  http://localhost:$PORT_POWERFLOW/docs"
  echo ""
  echo -e "  ${YELLOW}Logs        ${RESET}→  .logs/"
  echo -e "  ${YELLOW}Stop all    ${RESET}→  ./stop.sh"
  echo ""
  echo -e "  ${BOLD}Test Agent Claude:${RESET}"
  echo -e "  curl -N 'http://localhost:$PORT_BACKEND/api/graphrag/stream?question=show+all+substations'"
  echo ""
}

# =============================================================================
# Main
# =============================================================================

# Clear old PID file
rm -f "$PID_FILE"
mkdir -p "$LOG_DIR"

echo -e "\n${BOLD}${BLUE}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${BLUE}║   CIM SemanticGraph Platform — Dev Setup     ║${RESET}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════╝${RESET}\n"

check_prerequisites

$START_INFRA     && start_infrastructure
$START_POWERFLOW && start_powerflow
$START_BACKEND   && start_backend
$START_FRONTEND  && start_frontend

print_summary
