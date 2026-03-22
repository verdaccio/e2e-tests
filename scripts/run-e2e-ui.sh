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
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

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
  echo "  Examples:"
  echo "    $0              # verdaccio@6, headless"
  echo "    $0 5            # verdaccio@5, headless"
  echo "    $0 --open       # verdaccio@6, interactive"
  echo "    $0 --docker 6   # verdaccio@6 via Docker"
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
  if [[ "$USE_DOCKER" == true ]]; then
    echo -e "${DIM}Stopping containers...${RESET}"
    docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
  else
    if [[ -n "$VERDACCIO_PID" ]]; then
      echo -e "${DIM}Stopping Verdaccio (pid $VERDACCIO_PID)...${RESET}"
      kill "$VERDACCIO_PID" 2>/dev/null || true
      wait "$VERDACCIO_PID" 2>/dev/null || true
    fi
  fi
  rm -rf "$VERDACCIO_DIR"
}
trap cleanup EXIT

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Kill anything on the port ───
if lsof -i ":${PORT}" >/dev/null 2>&1; then
  echo -e "${DIM}Killing existing process on port ${PORT}...${RESET}"
  lsof -ti ":${PORT}" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ─── Start Verdaccio ───
if [[ "$USE_DOCKER" == true ]]; then
  echo -e "${CYAN}Starting Verdaccio ${VERDACCIO_VERSION} via Docker...${RESET}"
  docker compose -f "$COMPOSE_FILE" build --build-arg VERDACCIO_VERSION="$VERDACCIO_VERSION"
  docker compose -f "$COMPOSE_FILE" up -d
else
  echo -e "${CYAN}Installing verdaccio@${VERDACCIO_VERSION}...${RESET}"
  npm install --prefix "$VERDACCIO_DIR" "verdaccio@${VERDACCIO_VERSION}" --save --loglevel=error
  VERDACCIO_BIN="$VERDACCIO_DIR/node_modules/.bin/verdaccio"

  if [[ ! -x "$VERDACCIO_BIN" ]]; then
    echo -e "${RED}Failed to install verdaccio@${VERDACCIO_VERSION}${RESET}"
    exit 1
  fi

  INSTALLED_VERSION=$("$VERDACCIO_BIN" --version 2>&1 || echo "unknown")
  echo -e "${GREEN}Installed verdaccio ${INSTALLED_VERSION}${RESET}"

  # Create a config with no uplinks and isolated storage so the registry starts empty
  VERDACCIO_CONFIG="$VERDACCIO_DIR/config.yaml"
  cat > "$VERDACCIO_CONFIG" <<YAML
storage: ${VERDACCIO_DIR}/storage
web:
  enable: true
  title: Verdaccio
  login: true
auth:
  htpasswd:
    file: ${VERDACCIO_DIR}/htpasswd
packages:
  '@*/*':
    access: \$all
    publish: \$authenticated
    unpublish: \$authenticated
  '**':
    access: \$all
    publish: \$authenticated
    unpublish: \$authenticated
log: { type: stdout, format: pretty, level: warn }
YAML

  echo -e "${CYAN}Starting Verdaccio on port ${PORT}...${RESET}"
  "$VERDACCIO_BIN" --config "$VERDACCIO_CONFIG" --listen "$PORT" &>"$VERDACCIO_DIR/verdaccio.log" &
  VERDACCIO_PID=$!
fi

# ─── Wait for ready ───
for i in $(seq 1 30); do
  if curl -s "http://localhost:${PORT}/-/ping" >/dev/null 2>&1; then
    echo -e "${GREEN}Verdaccio is ready on http://localhost:${PORT}${RESET}"
    break
  fi
  if [[ "$USE_DOCKER" != true ]] && ! kill -0 "$VERDACCIO_PID" 2>/dev/null; then
    echo -e "${RED}Verdaccio exited unexpectedly. Logs:${RESET}"
    cat "$VERDACCIO_DIR/verdaccio.log"
    exit 1
  fi
  sleep 1
done

if ! curl -s "http://localhost:${PORT}/-/ping" >/dev/null 2>&1; then
  echo -e "${RED}Verdaccio failed to start after 30s${RESET}"
  if [[ "$USE_DOCKER" == true ]]; then
    docker compose -f "$COMPOSE_FILE" logs --tail 20
  else
    cat "$VERDACCIO_DIR/verdaccio.log"
  fi
  exit 1
fi

# ─── Create test user ───
echo -e "${CYAN}Creating test user...${RESET}"
curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d '{"name":"test","password":"test","_id":"org.couchdb.user:test","type":"user","roles":[]}' \
  "http://localhost:${PORT}/-/user/org.couchdb.user:test" >/dev/null

# ─── Build ───
echo -e "${CYAN}Building...${RESET}"
pnpm build 2>&1

# ─── Run Cypress ───
echo -e "${CYAN}Running Cypress (${CYPRESS_CMD}) against verdaccio@${VERDACCIO_VERSION}...${RESET}"
echo ""

set +e
VERDACCIO_URL="http://localhost:${PORT}" ./node_modules/.bin/cypress "$CYPRESS_CMD"
EXIT_CODE=$?
set -e

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}All UI tests passed!${RESET}"
else
  echo -e "${RED}Some UI tests failed (exit code ${EXIT_CODE})${RESET}"
fi

exit $EXIT_CODE
