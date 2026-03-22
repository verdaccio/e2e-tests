#!/usr/bin/env bash
set -euo pipefail

# ─── Config ───
VERDACCIO_VERSIONS=("5" "6")
PACKAGE_MANAGERS=("npm" "pnpm" "yarn-classic" "yarn-2" "yarn-3" "yarn-4")
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTRA_ARGS=()

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

usage() {
  echo ""
  echo "  Run the full Verdaccio e2e matrix locally"
  echo ""
  echo "  Usage: $0 [--docker]"
  echo ""
  echo "  Options:"
  echo "    --docker    Use Docker images instead of npm install"
  echo ""
  echo "  Examples:"
  echo "    $0              # local install, v5+v6, npm+pnpm"
  echo "    $0 --docker     # docker images, v5+v6, npm+pnpm"
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
