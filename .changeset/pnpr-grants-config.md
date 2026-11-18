---
'@verdaccio/e2e-cli': patch
---

Update the generated pnpr configuration for `0.1.0-alpha.21`, which stores
permissions separately from registries. Add `--print-config --server pnpr-grants`
and import its output with `pnpr grants import` after importing the registries.
The grants preserve public reads and authenticated publishing, metadata updates
and unpublishing. Earlier pnpr releases are no longer supported by this config.
