#!/usr/bin/env bash
set -euo pipefail

# ─── Config ───
VERDACCIO_VERSIONS=("5" "6")
PACKAGE_MANAGERS=("npm" "pnpm")
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

TOTAL=0
PASSED=0
FAILED=0
RESULTS=()

echo -e "${BOLD}${CYAN}Verdaccio E2E Matrix${RESET}"
echo -e "${DIM}Versions: ${VERDACCIO_VERSIONS[*]}${RESET}"
echo -e "${DIM}Package managers: ${PACKAGE_MANAGERS[*]}${RESET}"
echo -e "${BOLD}$((${#VERDACCIO_VERSIONS[@]} * ${#PACKAGE_MANAGERS[@]})) combinations${RESET}"
echo ""

for version in "${VERDACCIO_VERSIONS[@]}"; do
  for pm in "${PACKAGE_MANAGERS[@]}"; do
    TOTAL=$((TOTAL + 1))
    LABEL="verdaccio@${version} / ${pm}"
    echo -e "${BOLD}${CYAN}━━━ ${LABEL} ━━━${RESET}"

    if "$SCRIPT_DIR/run-e2e.sh" "$version" "$pm"; then
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
