/**
 * Pending contract checks pin registry behavior that is correct per the
 * npmjs contract but still red against some published Verdaccio versions.
 * They are off by default; E2E_PENDING_CONTRACT_CHECKS enables them:
 *
 *   E2E_PENDING_CONTRACT_CHECKS=true              → all scenarios
 *   E2E_PENDING_CONTRACT_CHECKS=tarballs          → one scenario
 *   E2E_PENDING_CONTRACT_CHECKS=tarballs,search   → a list
 *
 * Flip the default once the registry-side fixes are published everywhere.
 */
export function pendingContractChecksEnabled(scenario: string): boolean {
  const value = (process.env.E2E_PENDING_CONTRACT_CHECKS || '').toLowerCase();
  if (value === 'true' || value === '1' || value === 'all') {
    return true;
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .includes(scenario);
}
