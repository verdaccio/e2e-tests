#!/usr/bin/env bash
set -euo pipefail

# ─── Config ───
VERDACCIO_VERSIONS=("5" "6")
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTRA_ARGS=()

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

usage() {
  echo ""
  echo "  Run the full Verdaccio e2e matrix locally"
  echo "  Automatically detects which package managers are installed"
  echo ""
  echo "  Usage: $0 [--docker]"
  echo ""
  echo "  Options:"
  echo "    --docker    Use Docker images instead of npm install"
  echo ""
  echo "  Examples:"
  echo "    $0              # local install, v5+v6, all detected PMs"
  echo "    $0 --docker     # docker images, v5+v6, all detected PMs"
  echo ""
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker)
      EXTRA_ARGS+=("--docker")
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      shift
      ;;
  esac
done

MODE="local install"
[[ " ${EXTRA_ARGS[*]:-} " == *" --docker "* ]] && MODE="docker"

# ─── Detect installed PMs ───
PACKAGE_MANAGERS=()

if command -v npm >/dev/null 2>&1; then
  PACKAGE_MANAGERS+=("npm")
fi

if command -v pnpm >/dev/null 2>&1; then
  PACKAGE_MANAGERS+=("pnpm")
fi

if command -v yarn >/dev/null 2>&1; then
  YARN_VERSION=$(COREPACK_ENABLE_STRICT=0 yarn --version 2>/dev/null || echo "0")
  YARN_MAJOR="${YARN_VERSION%%.*}"
  if [[ "$YARN_MAJOR" == "1" ]]; then
    PACKAGE_MANAGERS+=("yarn-classic")
  else
    PACKAGE_MANAGERS+=("yarn-modern")
  fi
fi

if [[ ${#PACKAGE_MANAGERS[@]} -eq 0 ]]; then
  echo -e "${RED}No package managers found in PATH (npm, pnpm, yarn)${RESET}"
  exit 1
fi

TOTAL=0
PASSED=0
FAILED=0
RESULTS=()

echo -e "${BOLD}${CYAN}Verdaccio E2E Matrix${RESET}"
echo -e "${DIM}Mode: ${MODE}${RESET}"
echo -e "${DIM}Versions: ${VERDACCIO_VERSIONS[*]}${RESET}"
echo -e "${DIM}Package managers: ${PACKAGE_MANAGERS[*]}${RESET}"
echo -e "${BOLD}$((${#VERDACCIO_VERSIONS[@]} * ${#PACKAGE_MANAGERS[@]})) combinations${RESET}"
echo ""

for version in "${VERDACCIO_VERSIONS[@]}"; do
  for pm in "${PACKAGE_MANAGERS[@]}"; do
    TOTAL=$((TOTAL + 1))
    LABEL="verdaccio@${version} / ${pm} (${MODE})"
    echo -e "${BOLD}${CYAN}━━━ ${LABEL} ━━━${RESET}"

    if "$SCRIPT_DIR/run-e2e.sh" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}" "$version" "$pm"; then
      PASSED=$((PASSED + 1))
      RESULTS+=("${GREEN}PASS${RESET}  ${LABEL}")
    else
      FAILED=$((FAILED + 1))
      RESULTS+=("${RED}FAIL${RESET}  ${LABEL}")
    fi
    echo ""
  done
done

# ─── Summary ───
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}Matrix Summary${RESET}"
echo ""
for result in "${RESULTS[@]}"; do
  echo -e "  ${result}"
done
echo ""
echo -e "  Total: ${BOLD}${TOTAL}${RESET}  ${GREEN}${PASSED} passed${RESET}  ${RED}${FAILED} failed${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"

[[ $FAILED -eq 0 ]] && exit 0 || exit 1
