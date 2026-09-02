---
'@verdaccio/e2e-cli': minor
---

The pending contract checks (search and tarball npmjs-contract assertions
that are red against some published Verdaccio versions) can now be enabled
per run with `E2E_PENDING_CONTRACT_CHECKS` — `true`/`all` for everything, or
a comma-separated list of scenarios (`tarballs`, `search`), so a registry
that fixes one family can pin it in CI while the other stays gated.
