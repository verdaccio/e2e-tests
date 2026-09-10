---
'@verdaccio/e2e-cli': minor
---

Add pnpr support to the battery tooling:

- `--print-config --server pnpr` prints the recommended pnpr config for the
  full battery (pnpr's `registries:` shape; it rejects verdaccio's global
  `packages:` map). The pnpr config has no mock uplink — pnpr registry
  namespaces cannot claim the unscoped dynamic `e2e-uplink-*` names — so run
  pnpr without `--uplink-port` and the uplink tests skip, exactly like docker
  mode.
- `--skip-test <name>` (repeatable) skips tests by name while still reporting
  them as SKIP, unlike `--test` which hides everything else. Used by
  `run-e2e.sh` to skip-list the tests that fail against the published
  `@pnpm/pnpr` until a release ships the parity fixes.
