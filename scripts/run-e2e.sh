#!/usr/bin/env bash
set -euo pipefail

# ─── Defaults ───
VERDACCIO_VERSION="${1:-6}"
PM="${2:-npm}"
PORT=4873
VERDACCIO_PID=""
VERDACCIO_DIR=$(mktemp -d)

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

usage() {
  echo ""
  echo "  Run Verdaccio e2e tests locally"
  echo ""
  echo "  Usage: $0 [verdaccio-version] [package-manager]"
  echo ""
  echo "  Examples:"
  echo "    $0              # verdaccio@6, npm"
  echo "    $0 5            # verdaccio@5, npm"
  echo "    $0 6 pnpm       # verdaccio@6, pnpm"
  echo "    $0 latest npm   # verdaccio@latest, npm"
  echo ""
  echo "  Package managers: npm, pnpm, yarn-classic"
  echo ""
  exit 0
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && usage

cleanup() {
  if [[ -n "$VERDACCIO_PID" ]]; then
    echo -e "${DIM}Stopping Verdaccio (pid $VERDACCIO_PID)...${RESET}"
    kill "$VERDACCIO_PID" 2>/dev/null || true
    wait "$VERDACCIO_PID" 2>/dev/null || true
  fi
  rm -rf "$VERDACCIO_DIR"
}
trap cleanup EXIT

# ─── Install Verdaccio ───
echo -e "${CYAN}Installing verdaccio@${VERDACCIO_VERSION} into temp dir...${RESET}"
npm install --prefix "$VERDACCIO_DIR" "verdaccio@${VERDACCIO_VERSION}" --save --loglevel=error
VERDACCIO_BIN="$VERDACCIO_DIR/node_modules/.bin/verdaccio"

if [[ ! -x "$VERDACCIO_BIN" ]]; then
  echo -e "${RED}Failed to install verdaccio@${VERDACCIO_VERSION}${RESET}"
  exit 1
fi

INSTALLED_VERSION=$("$VERDACCIO_BIN" --version 2>&1 || echo "unknown")
echo -e "${GREEN}Installed verdaccio ${INSTALLED_VERSION}${RESET}"

# ─── Start Verdaccio ───
echo -e "${CYAN}Starting Verdaccio on port ${PORT}...${RESET}"
"$VERDACCIO_BIN" --listen "$PORT" &>"$VERDACCIO_DIR/verdaccio.log" &
VERDACCIO_PID=$!

# Wait for ready
for i in $(seq 1 30); do
  if curl -s "http://localhost:${PORT}/-/ping" >/dev/null 2>&1; then
    echo -e "${GREEN}Verdaccio is ready on http://localhost:${PORT}${RESET}"
    break
  fi
  if ! kill -0 "$VERDACCIO_PID" 2>/dev/null; then
    echo -e "${RED}Verdaccio exited unexpectedly. Logs:${RESET}"
    cat "$VERDACCIO_DIR/verdaccio.log"
    exit 1
  fi
  sleep 1
done

if ! curl -s "http://localhost:${PORT}/-/ping" >/dev/null 2>&1; then
  echo -e "${RED}Verdaccio failed to start after 30s. Logs:${RESET}"
  cat "$VERDACCIO_DIR/verdaccio.log"
  exit 1
fi

# ─── Build e2e-cli ───
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${CYAN}Building @verdaccio/e2e-cli...${RESET}"
pnpm --filter @verdaccio/e2e-cli build 2>&1

# ─── Run tests ───
echo -e "${CYAN}Running tests: verdaccio@${INSTALLED_VERSION} / ${PM}${RESET}"
echo ""

node "$PROJECT_DIR/tools/e2e-cli/bin/e2e-cli.js" \
  --registry "http://localhost:${PORT}" \
  --pm "$PM"

EXIT_CODE=$?
echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}All tests passed!${RESET}"
else
  echo -e "${RED}Some tests failed (exit code ${EXIT_CODE})${RESET}"
  echo -e "${DIM}Verdaccio logs: $VERDACCIO_DIR/verdaccio.log${RESET}"
fi

exit $EXIT_CODE
