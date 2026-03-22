#!/usr/bin/env bash
set -euo pipefail

# ─── Defaults ───
VERDACCIO_VERSION="6"
PM="npm"
PORT=4873
USE_DOCKER=false
DOCKER_IMAGE=""
CONTAINER_NAME="verdaccio-e2e-$$"
VERDACCIO_PID=""
VERDACCIO_DIR=$(mktemp -d)

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

usage() {
  echo ""
  echo "  Run Verdaccio e2e tests locally"
  echo ""
  echo "  Usage: $0 [options] [verdaccio-version] [package-manager]"
  echo ""
  echo "  Options:"
  echo "    --docker            Use Docker image instead of npm install"
  echo "    --image <name>      Use a specific Docker image (implies --docker)"
  echo "    -h, --help          Show this help"
  echo ""
  echo "  Package managers (must be installed on your system):"
  echo "    npm                 (default)"
  echo "    pnpm"
  echo "    yarn-classic        Yarn 1.x (requires 'yarn' in PATH)"
  echo "    yarn-modern         Yarn Berry 2+ (requires 'yarn' in PATH)"
  echo ""
  echo "  Examples:"
  echo "    $0                              # verdaccio@6, npm"
  echo "    $0 5                            # verdaccio@5, npm"
  echo "    $0 6 pnpm                       # verdaccio@6, pnpm"
  echo "    $0 6 yarn-classic               # verdaccio@6, yarn v1"
  echo "    $0 6 yarn-modern                # verdaccio@6, yarn berry"
  echo "    $0 --docker 5 pnpm             # docker verdaccio@5, pnpm"
  echo "    $0 --image verdaccio/verdaccio:nightly-master npm"
  echo ""
  exit 0
}

# ─── Parse args ───
while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker)
      USE_DOCKER=true
      shift
      ;;
    --image)
      USE_DOCKER=true
      DOCKER_IMAGE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      if [[ -z "${VERSION_SET:-}" ]]; then
        VERDACCIO_VERSION="$1"
        VERSION_SET=1
      else
        PM="$1"
      fi
      shift
      ;;
  esac
done

# ─── Resolve docker image ───
if [[ "$USE_DOCKER" == true && -z "$DOCKER_IMAGE" ]]; then
  DOCKER_IMAGE="verdaccio/verdaccio:${VERDACCIO_VERSION}"
fi

# ─── Cleanup ───
cleanup() {
  if [[ "$USE_DOCKER" == true ]]; then
    echo -e "${DIM}Stopping container ${CONTAINER_NAME}...${RESET}"
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
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

# ─── Paths ───
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── PM arg (the CLI handles detection and auto-install) ───
PM_ARG="$PM"

# ─── Kill anything on the port ───
if lsof -i ":${PORT}" >/dev/null 2>&1; then
  echo -e "${DIM}Killing existing process on port ${PORT}...${RESET}"
  lsof -ti ":${PORT}" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ─── Start Verdaccio ───
if [[ "$USE_DOCKER" == true ]]; then
  echo -e "${CYAN}Pulling ${DOCKER_IMAGE}...${RESET}"
  docker pull "$DOCKER_IMAGE"

  echo -e "${CYAN}Starting container ${CONTAINER_NAME} on port ${PORT}...${RESET}"
  docker run -d \
    --name "$CONTAINER_NAME" \
    -p "${PORT}:4873" \
    "$DOCKER_IMAGE" >/dev/null

  INSTALLED_VERSION="docker:${DOCKER_IMAGE}"
else
  echo -e "${CYAN}Installing verdaccio@${VERDACCIO_VERSION} into temp dir...${RESET}"
  npm install --prefix "$VERDACCIO_DIR" "verdaccio@${VERDACCIO_VERSION}" --save --loglevel=error
  VERDACCIO_BIN="$VERDACCIO_DIR/node_modules/.bin/verdaccio"

  if [[ ! -x "$VERDACCIO_BIN" ]]; then
    echo -e "${RED}Failed to install verdaccio@${VERDACCIO_VERSION}${RESET}"
    exit 1
  fi

  INSTALLED_VERSION=$("$VERDACCIO_BIN" --version 2>&1 || echo "unknown")
  echo -e "${GREEN}Installed verdaccio ${INSTALLED_VERSION}${RESET}"

  # Isolated config so runs don't share storage
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
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@*/*':
    access: \$all
    publish: \$authenticated
    unpublish: \$authenticated
    proxy: npmjs
  '**':
    access: \$all
    publish: \$authenticated
    unpublish: \$authenticated
    proxy: npmjs
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
    echo -e "${DIM}Container logs:${RESET}"
    docker logs "$CONTAINER_NAME" 2>&1 | tail -20
  else
    echo -e "${DIM}Logs:${RESET}"
    cat "$VERDACCIO_DIR/verdaccio.log"
  fi
  exit 1
fi

# ─── Build e2e-cli ───
echo -e "${CYAN}Building @verdaccio/e2e-cli...${RESET}"
pnpm --filter @verdaccio/e2e-cli build 2>&1

# ─── Run tests ───
echo -e "${CYAN}Running tests: ${INSTALLED_VERSION} / ${PM}${RESET}"
echo ""

set +e
node "$PROJECT_DIR/tools/e2e-cli/bin/e2e-cli.js" \
  --registry "http://localhost:${PORT}" \
  --pm "$PM_ARG"
EXIT_CODE=$?
set -e
echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}All tests passed!${RESET}"
else
  echo -e "${RED}Some tests failed (exit code ${EXIT_CODE})${RESET}"
  if [[ "$USE_DOCKER" == true ]]; then
    echo -e "${DIM}Container logs: docker logs ${CONTAINER_NAME}${RESET}"
  else
    echo -e "${DIM}Verdaccio logs: $VERDACCIO_DIR/verdaccio.log${RESET}"
  fi
fi

exit $EXIT_CODE
