---
'@verdaccio/e2e-cli': minor
---

Follow the pnpr 0.1.0-alpha.20 config format in `--print-config`.

pnpr now keeps its registries in the database and refuses a config file that declares them, so the battery config is printed in two parts: `--print-config --server pnpr` prints the server settings and `--print-config --server pnpr-registries` prints the registries document to store with `pnpr registries import` before the server starts. Earlier pnpr releases are no longer covered by the printed config.
