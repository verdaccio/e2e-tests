#!/usr/bin/env bash
set -euo pipefail

# ─── Defaults ───
VERDACCIO_VERSION="${1:-6}"
PORT=4873
USE_DOCKER=false
VERDACCIO_PID=""
VERDACCIO_DIR=$(mktemp -d)
COMPOSE_FILE="./docker/docker-e2e-ui/docker-compose.yaml"

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
DIM='\033[2m'
RESET='\033[0m'

# ─── Logging helpers ───
DEBUG="${DEBUG:-1}"  # set DEBUG=0 to silence debug output

log_debug() {
  [[ "$DEBUG" == "1" ]] && echo -e "${MAGENTA}[debug]${RESET} ${DIM}$*${RESET}" >&2 || true
}
log_info()    { echo -e "${CYAN}[info]${RESET} $*"; }
log_step()    { echo -e "\n${CYAN}━━━ $* ━━━${RESET}"; }
log_success() { echo -e "${GREEN}[ok]${RESET} $*"; }
log_warn()    { echo -e "${YELLOW}[warn]${RESET} $*" >&2; }
log_error()   { echo -e "${RED}[err]${RESET} $*" >&2; }

# Run a command, echoing it first. Respects pipefail.
run() {
  log_debug "\$ $*"
  "$@"
}

usage() {
  echo ""
  echo "  Run Verdaccio UI e2e tests (Cypress) locally"
  echo ""
  echo "  Usage: $0 [options] [verdaccio-version]"
  echo ""
  echo "  Options:"
  echo "    --docker    Use Docker (requires docker compose)"
  echo "    --open      Open Cypress interactively instead of headless"
  echo "    -h, --help  Show this help"
  echo ""
  echo "  Env:"
  echo "    DEBUG=0     Silence [debug] lines (default: 1, verbose)"
  echo ""
  echo "  Examples:"
  echo "    $0              # verdaccio@6, headless"
  echo "    $0 5            # verdaccio@5, headless"
  echo "    $0 --open       # verdaccio@6, interactive"
  echo "    $0 --docker 6   # verdaccio@6 via Docker"
  echo "    DEBUG=0 $0      # run without debug logs"
  echo ""
  exit 0
}

CYPRESS_CMD="run"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker)
      USE_DOCKER=true
      shift
      ;;
    --open)
      CYPRESS_CMD="open"
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      VERDACCIO_VERSION="$1"
      shift
      ;;
  esac
done

# ─── Cleanup ───
cleanup() {
  local exit_code=$?
  log_step "Cleanup (exit=$exit_code)"
  if [[ "$USE_DOCKER" == true ]]; then
    log_debug "Stopping docker compose stack"
    docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
  else
    if [[ -n "$VERDACCIO_PID" ]]; then
      if kill -0 "$VERDACCIO_PID" 2>/dev/null; then
        log_debug "Stopping Verdaccio (pid $VERDACCIO_PID)"
        kill "$VERDACCIO_PID" 2>/dev/null || true
        wait "$VERDACCIO_PID" 2>/dev/null || true
      else
        log_debug "Verdaccio pid $VERDACCIO_PID already gone"
      fi
    fi
    if [[ $exit_code -ne 0 && -f "$VERDACCIO_DIR/verdaccio.log" ]]; then
      log_warn "Dumping verdaccio.log on failure:"
      sed 's/^/  | /' "$VERDACCIO_DIR/verdaccio.log" >&2 || true
    fi
  fi
  log_debug "Removing temp dir $VERDACCIO_DIR"
  rm -rf "$VERDACCIO_DIR"
}
trap cleanup EXIT

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Environment dump ───
log_step "Environment"
log_debug "script:          $0"
log_debug "script dir:      $SCRIPT_DIR"
log_debug "project dir:     $PROJECT_DIR"
log_debug "cwd:             $(pwd)"
log_debug "temp dir:        $VERDACCIO_DIR"
log_debug "platform:        $(uname -a)"
log_debug "bash:            ${BASH_VERSION:-unknown}"
log_debug "node:            $(command -v node && node --version 2>/dev/null || echo 'not found')"
log_debug "npm:             $(command -v npm && npm --version 2>/dev/null || echo 'not found')"
log_debug "pnpm:            $(command -v pnpm && pnpm --version 2>/dev/null || echo 'not found')"
log_debug "docker:          $(command -v docker || echo 'not found')"
log_debug "verdaccio ver:   $VERDACCIO_VERSION"
log_debug "port:            $PORT"
log_debug "use docker:      $USE_DOCKER"
log_debug "cypress cmd:     $CYPRESS_CMD"

# ─── Kill anything on the port ───
log_step "Port check"
if lsof -i ":${PORT}" >/dev/null 2>&1; then
  log_warn "Port ${PORT} is in use — current holder:"
  lsof -i ":${PORT}" >&2 || true
  log_debug "Killing existing process on port ${PORT}"
  lsof -ti ":${PORT}" | xargs kill -9 2>/dev/null || true
  sleep 1
else
  log_debug "Port ${PORT} is free"
fi

# ─── Start Verdaccio ───
log_step "Start Verdaccio"
if [[ "$USE_DOCKER" == true ]]; then
  log_info "Starting Verdaccio ${VERDACCIO_VERSION} via Docker"
  log_debug "Compose file: $COMPOSE_FILE"
  run docker compose -f "$COMPOSE_FILE" build --build-arg VERDACCIO_VERSION="$VERDACCIO_VERSION"
  run docker compose -f "$COMPOSE_FILE" up -d
  log_debug "Compose state:"
  docker compose -f "$COMPOSE_FILE" ps || true
else
  log_info "Installing verdaccio@${VERDACCIO_VERSION} from npmjs"
  log_debug "Install prefix: $VERDACCIO_DIR"
  log_debug "Registry:       $(npm config get registry)"
  run npm install --prefix "$VERDACCIO_DIR" "verdaccio@${VERDACCIO_VERSION}" --save --loglevel=error
  VERDACCIO_BIN="$VERDACCIO_DIR/node_modules/.bin/verdaccio"
  log_debug "Binary path:    $VERDACCIO_BIN"

  if [[ ! -x "$VERDACCIO_BIN" ]]; then
    log_error "Failed to install verdaccio@${VERDACCIO_VERSION} — binary not found or not executable"
    log_debug "Contents of $VERDACCIO_DIR/node_modules/.bin:"
    ls -la "$VERDACCIO_DIR/node_modules/.bin" 2>&1 | sed 's/^/  | /' >&2 || true
    exit 1
  fi

  INSTALLED_VERSION=$("$VERDACCIO_BIN" --version 2>&1 || echo "unknown")
  log_success "Installed verdaccio ${INSTALLED_VERSION}"

  # Create a config with no uplinks and isolated storage so the registry starts empty
  VERDACCIO_CONFIG="$VERDACCIO_DIR/config.yaml"
  cat > "$VERDACCIO_CONFIG" <<YAML
storage: ${VERDACCIO_DIR}/storage
web:
  enable: true
  title: Verdaccio
  login: true
  # Surface the settings / translations dialog for the e2e-ui settings suite.
  showSettings: true
  showInfo: true
auth:
  htpasswd:
    file: ${VERDACCIO_DIR}/htpasswd
packages:
  '@*/*':
    access: \$all
    publish: \$anonymous \$authenticated
    unpublish: \$anonymous \$authenticated
  '**':
    access: \$all
    publish: \$anonymous \$authenticated
    unpublish: \$anonymous \$authenticated
# Loosen the default rate limit on /-/verdaccio/sec/* so cypress runs
# (which log in repeatedly) don't hit 429.
userRateLimit:
  windowMs: 1000
  max: 10000
log: { type: stdout, format: pretty, level: warn }
YAML

  log_debug "Generated config at $VERDACCIO_CONFIG:"
  [[ "$DEBUG" == "1" ]] && sed 's/^/  | /' "$VERDACCIO_CONFIG" >&2 || true

  log_info "Starting Verdaccio on port ${PORT}"
  log_debug "\$ $VERDACCIO_BIN --config $VERDACCIO_CONFIG --listen $PORT"
  "$VERDACCIO_BIN" --config "$VERDACCIO_CONFIG" --listen "$PORT" &>"$VERDACCIO_DIR/verdaccio.log" &
  VERDACCIO_PID=$!
  log_debug "Verdaccio PID:  $VERDACCIO_PID"
  log_debug "Log file:       $VERDACCIO_DIR/verdaccio.log"
fi

# ─── Wait for ready ───
log_step "Wait for Verdaccio to become ready"
READY=false
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:${PORT}/-/ping" >/dev/null 2>&1; then
    log_success "Verdaccio is ready on http://localhost:${PORT} (after ${i}s)"
    READY=true
    break
  fi
  if [[ "$USE_DOCKER" != true ]] && ! kill -0 "$VERDACCIO_PID" 2>/dev/null; then
    log_error "Verdaccio process (pid $VERDACCIO_PID) exited before ready"
    log_debug "Full log:"
    sed 's/^/  | /' "$VERDACCIO_DIR/verdaccio.log" >&2 || true
    exit 1
  fi
  # Every 5 attempts, emit a heartbeat with the tail of the log
  if (( i % 5 == 0 )); then
    log_debug "Still waiting (attempt ${i}/30)..."
    if [[ "$USE_DOCKER" != true && -s "$VERDACCIO_DIR/verdaccio.log" ]]; then
      log_debug "Recent log:"
      tail -n 3 "$VERDACCIO_DIR/verdaccio.log" | sed 's/^/  | /' >&2 || true
    fi
  fi
  sleep 1
done

if [[ "$READY" != true ]]; then
  log_error "Verdaccio failed to start after 30s"
  if [[ "$USE_DOCKER" == true ]]; then
    docker compose -f "$COMPOSE_FILE" logs --tail 40 | sed 's/^/  | /' >&2 || true
  else
    sed 's/^/  | /' "$VERDACCIO_DIR/verdaccio.log" >&2 || true
  fi
  exit 1
fi

log_debug "Listener check:"
lsof -i ":${PORT}" 2>/dev/null | sed 's/^/  | /' || true

# ─── Create test user ───
log_step "Create test user"
USER_PAYLOAD='{"name":"test","password":"test","_id":"org.couchdb.user:test","type":"user","roles":[]}'
log_debug "PUT http://localhost:${PORT}/-/user/org.couchdb.user:test"
USER_RESP=$(curl -sS -o /tmp/verdaccio-user-resp.$$ -w "%{http_code}" -X PUT \
  -H "Content-Type: application/json" \
  -d "$USER_PAYLOAD" \
  "http://localhost:${PORT}/-/user/org.couchdb.user:test" || echo "000")
log_debug "HTTP $USER_RESP"
[[ "$DEBUG" == "1" ]] && sed 's/^/  | /' /tmp/verdaccio-user-resp.$$ >&2 || true
rm -f /tmp/verdaccio-user-resp.$$
if [[ "$USER_RESP" != "201" && "$USER_RESP" != "200" && "$USER_RESP" != "409" ]]; then
  log_warn "Unexpected user-creation status: $USER_RESP (continuing anyway)"
fi

# ─── Build ───
log_step "Build project"
run pnpm build

# ─── Run Cypress ───
log_step "Run Cypress (${CYPRESS_CMD}) against verdaccio@${VERDACCIO_VERSION}"
log_debug "VERDACCIO_URL=http://localhost:${PORT}"
log_debug "Cypress bin:   ./node_modules/.bin/cypress"

set +e
VERDACCIO_URL="http://localhost:${PORT}" ./node_modules/.bin/cypress "$CYPRESS_CMD"
EXIT_CODE=$?
set -e
log_debug "Cypress exit code: $EXIT_CODE"

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}All UI tests passed!${RESET}"
else
  echo -e "${RED}Some UI tests failed (exit code ${EXIT_CODE})${RESET}"
fi

exit $EXIT_CODE
