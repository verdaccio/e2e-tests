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
  echo "  Usage: $0 [options] [registry-version] [package-manager]"
  echo ""
  echo "  Registry versions:"
  echo "    6, next-7, ...      verdaccio, installed from npm (default: 6)"
  echo "    pnpr[@version]      @pnpm/pnpr, installed from npm (default tag: next)"
  echo "                        Set PNPR_BIN to test a locally built binary instead."
  echo "                        pnpr runs without the mock uplink, so the uplink"
  echo "                        tests skip (same as docker mode). Known-failing"
  echo "                        tests for the published pnpr are skip-listed;"
  echo "                        override with PNPR_SKIP_TESTS (\"\" runs all)."
  echo ""
  echo "  Options:"
  echo "    --docker            Use Docker image instead of npm install"
  echo "    --image <name>      Use a specific Docker image (implies --docker)"
  echo "    -h, --help          Show this help"
  echo ""
  echo "  Package managers (must be installed on your system):"
  echo "    npm                 npm 10-12 (default)"
  echo "    pnpm                pnpm 10+"
  echo "    yarn-modern         Yarn Berry 3+ (requires 'yarn' in PATH)"
  echo ""
  echo "  Examples:"
  echo "    $0                              # verdaccio@6, npm"
  echo "    $0 6 pnpm                       # verdaccio@6, pnpm"
  echo "    $0 6 yarn-modern                # verdaccio@6, yarn berry"
  echo "    $0 --docker 6 pnpm             # docker verdaccio@6, pnpm"
  echo "    $0 --image verdaccio/verdaccio:nightly-master npm"
  echo "    $0 pnpr npm                    # @pnpm/pnpr@next, npm"
  echo "    $0 pnpr@0.1.0-alpha.11 pnpm    # pinned pnpr version"
  echo "    $0 --docker pnpr@0.1.0-alpha.11 npm   # ghcr.io/pnpm/pnpr image"
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

# ─── Registry server: verdaccio (default) or pnpr ───
SERVER="verdaccio"
PNPR_VERSION="next"
if [[ "$VERDACCIO_VERSION" == pnpr || "$VERDACCIO_VERSION" == pnpr@* ]]; then
  SERVER="pnpr"
  [[ "$VERDACCIO_VERSION" == pnpr@* ]] && PNPR_VERSION="${VERDACCIO_VERSION#pnpr@}"
fi

# ─── Resolve docker image ───
if [[ "$USE_DOCKER" == true && -z "$DOCKER_IMAGE" ]]; then
  if [[ "$SERVER" == "pnpr" ]]; then
    # ghcr tags are exact versions; 'latest' skips prereleases, so a floating
    # 'pnpr' spec has no docker tag to map to.
    if [[ "$PNPR_VERSION" == "next" ]]; then
      echo -e "${RED}--docker pnpr needs a pinned version (pnpr@<version>) or --image${RESET}"
      exit 1
    fi
    DOCKER_IMAGE="ghcr.io/pnpm/pnpr:${PNPR_VERSION}"
  else
    DOCKER_IMAGE="verdaccio/verdaccio:${VERDACCIO_VERSION}"
  fi
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

# ─── Build e2e-cli (needed early: it generates the registry config) ───
echo -e "${CYAN}Building @verdaccio/e2e-cli...${RESET}"
pnpm --filter @verdaccio/e2e-cli build 2>&1

E2E_CLI="$PROJECT_DIR/tools/e2e-cli/bin/e2e-cli.js"
UPLINK_PORT=4874

# Shared config for the full battery (max_body_size, mock uplink for
# scenario:uplink-failure) — single source of truth in @verdaccio/e2e-cli.
# pnpr's config has no mock uplink (its registry namespaces can't claim the
# unscoped dynamic e2e-uplink-* names), so the uplink tests skip for it.
VERDACCIO_CONFIG="$VERDACCIO_DIR/config.yaml"
if [[ "$SERVER" == "pnpr" ]]; then
  node "$E2E_CLI" --print-config --server pnpr > "$VERDACCIO_CONFIG"
else
  node "$E2E_CLI" --print-config --uplink-port "$UPLINK_PORT" > "$VERDACCIO_CONFIG"
fi

# ─── Start the registry ───
if [[ "$USE_DOCKER" == true ]]; then
  echo -e "${CYAN}Pulling ${DOCKER_IMAGE}...${RESET}"
  docker pull "$DOCKER_IMAGE"

  # Container paths for storage/htpasswd; the mock uplink is unreachable from
  # inside the container, so scenario:uplink-failure is skipped in docker mode
  # (E2E_UPLINK_PORT is not exported below).
  DOCKER_CONFIG="$VERDACCIO_DIR/config.docker.yaml"
  if [[ "$SERVER" == "pnpr" ]]; then
    sed \
      -e 's|^storage: .*|storage: /pnpr/storage|' \
      -e 's|file: ./htpasswd|file: /pnpr/storage/htpasswd|' \
      "$VERDACCIO_CONFIG" > "$DOCKER_CONFIG"

    echo -e "${CYAN}Starting container ${CONTAINER_NAME} on port ${PORT}...${RESET}"
    docker run -d \
      --name "$CONTAINER_NAME" \
      -p "${PORT}:7677" \
      -v "$DOCKER_CONFIG:/pnpr/config.yaml:ro" \
      "$DOCKER_IMAGE" \
      --config /pnpr/config.yaml --listen 0.0.0.0:7677 \
      --public-url "http://localhost:${PORT}" >/dev/null
  else
    sed \
      -e 's|^storage: .*|storage: /verdaccio/storage/data|' \
      -e 's|file: ./htpasswd|file: /verdaccio/storage/htpasswd|' \
      "$VERDACCIO_CONFIG" > "$DOCKER_CONFIG"

    echo -e "${CYAN}Starting container ${CONTAINER_NAME} on port ${PORT}...${RESET}"
    docker run -d \
      --name "$CONTAINER_NAME" \
      -p "${PORT}:4873" \
      -v "$DOCKER_CONFIG:/verdaccio/conf/config.yaml" \
      "$DOCKER_IMAGE" >/dev/null
  fi

  INSTALLED_VERSION="docker:${DOCKER_IMAGE}"
elif [[ "$SERVER" == "pnpr" ]]; then
  if [[ -n "${PNPR_BIN:-}" ]]; then
    REGISTRY_BIN="$PNPR_BIN"
    echo -e "${CYAN}Using pnpr binary from PNPR_BIN: ${REGISTRY_BIN}${RESET}"
  else
    echo -e "${CYAN}Installing @pnpm/pnpr@${PNPR_VERSION} into temp dir...${RESET}"
    # min-release-age=0: a freshly published prerelease of the server under
    # test must be installable immediately.
    npm install --prefix "$VERDACCIO_DIR" "@pnpm/pnpr@${PNPR_VERSION}" \
      --save --loglevel=error --min-release-age=0
    REGISTRY_BIN="$VERDACCIO_DIR/node_modules/.bin/pnpr"
  fi

  if [[ ! -x "$REGISTRY_BIN" ]]; then
    echo -e "${RED}Failed to install @pnpm/pnpr@${PNPR_VERSION}${RESET}"
    exit 1
  fi

  INSTALLED_VERSION=$("$REGISTRY_BIN" --version 2>&1 || echo "unknown")
  echo -e "${GREEN}Using ${INSTALLED_VERSION}${RESET}"

  # --public-url: pnpr rewrites dist.tarball to an explicit public URL
  # (verdaccio derives it from the request Host header instead).
  echo -e "${CYAN}Starting pnpr on port ${PORT}...${RESET}"
  "$REGISTRY_BIN" --config "$VERDACCIO_CONFIG" --listen "127.0.0.1:${PORT}" \
    --public-url "http://localhost:${PORT}" \
    &>"$VERDACCIO_DIR/verdaccio.log" &
  VERDACCIO_PID=$!
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

  # The shared config uses paths relative to its own location ($VERDACCIO_DIR),
  # so runs don't share storage.
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

# ─── Run tests ───
echo -e "${CYAN}Running tests: ${INSTALLED_VERSION} / ${PM}${RESET}"
echo ""

# The mock uplink only works when the registry runs on this host and its
# config routes e2e-uplink-* to it — docker mode can't reach it and pnpr's
# config can't route it, so both skip scenario:uplink-failure by not passing
# the port.
UPLINK_ARGS=()
if [[ "$USE_DOCKER" != true && "$SERVER" != "pnpr" ]]; then
  UPLINK_ARGS=(--uplink-port "$UPLINK_PORT")
fi

# Known gaps in the published @pnpm/pnpr — these tests fail against it today
# (un-deprecate, search shape, tarball 404s, ETag revalidation, JSON error
# bodies, legacy re-login). Fixed on the pnpm branch
# fix/pnpr-verdaccio-e2e-parity and tracked in the workspace audit report
# pnpr-verdaccio-e2e-parity; drop entries here as a release ships each fix.
# Override with PNPR_SKIP_TESTS (space-separated; set to "" to run the full
# battery, e.g. against a locally built PNPR_BIN that carries the fixes).
PNPR_SKIP_TESTS="${PNPR_SKIP_TESTS-deprecate search login scenario:tarballs scenario:metadata scenario:search}"
SKIP_ARGS=()
if [[ "$SERVER" == "pnpr" && -n "$PNPR_SKIP_TESTS" ]]; then
  for skip in $PNPR_SKIP_TESTS; do
    SKIP_ARGS+=(--skip-test "$skip")
  done
fi

set +e
node "$E2E_CLI" \
  --registry "http://localhost:${PORT}" \
  --pm "$PM_ARG" \
  ${UPLINK_ARGS[@]+"${UPLINK_ARGS[@]}"} \
  ${SKIP_ARGS[@]+"${SKIP_ARGS[@]}"}
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
