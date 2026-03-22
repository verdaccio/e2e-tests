#!/usr/bin/env bash
set -euo pipefail

VERDACCIO_VERSION="${1:-6}"
PORT=4873
COMPOSE_FILE="./docker/docker-e2e-ui/docker-compose.yaml"

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

usage() {
  echo ""
  echo "  Run Verdaccio UI e2e tests (Cypress) locally via Docker"
  echo ""
  echo "  Usage: $0 [verdaccio-version]"
  echo ""
  echo "  Examples:"
  echo "    $0        # verdaccio@6"
  echo "    $0 5      # verdaccio@5"
  echo ""
  exit 0
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && usage

cleanup() {
  echo -e "${DIM}Stopping containers...${RESET}"
  docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
}
trap cleanup EXIT

# ─── Build & start Verdaccio ───
echo -e "${CYAN}Starting Verdaccio ${VERDACCIO_VERSION} via Docker...${RESET}"
docker compose -f "$COMPOSE_FILE" build --build-arg VERDACCIO_VERSION="$VERDACCIO_VERSION"
docker compose -f "$COMPOSE_FILE" up -d

for i in $(seq 1 30); do
  if curl -s "http://localhost:${PORT}/-/ping" >/dev/null 2>&1; then
    echo -e "${GREEN}Verdaccio is ready on http://localhost:${PORT}${RESET}"
    break
  fi
  sleep 1
done

if ! curl -s "http://localhost:${PORT}/-/ping" >/dev/null 2>&1; then
  echo -e "${RED}Verdaccio failed to start after 30s${RESET}"
  docker compose -f "$COMPOSE_FILE" logs --tail 20
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
echo -e "${CYAN}Running Cypress tests against verdaccio@${VERDACCIO_VERSION}...${RESET}"
echo ""

VERDACCIO_URL="http://localhost:${PORT}" pnpm test:ui
EXIT_CODE=$?

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}All UI tests passed!${RESET}"
else
  echo -e "${RED}Some UI tests failed (exit code ${EXIT_CODE})${RESET}"
fi

exit $EXIT_CODE
