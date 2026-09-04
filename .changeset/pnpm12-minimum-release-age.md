---
'@verdaccio/e2e-cli': patch
---

Make `scenario:minimum-release-age` compatible with pnpm 12:

- pnpm 12's argument parser rejects the `--frozen-lockfile=false` form; the
  blocked-install phase now uses `--no-frozen-lockfile`, accepted by pnpm 10,
  11 and 12.
- pnpm 12 no longer blocks new direct dependencies by default — it auto-adds
  them to `minimumReleaseAgeExclude` and proceeds. The scenario now sets
  `minimumReleaseAgeStrict: true` (ignored by pnpm 11) so the cooldown keeps
  failing with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` as asserted.
