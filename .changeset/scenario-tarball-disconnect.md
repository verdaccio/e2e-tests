---
'@verdaccio/e2e-cli': minor
---

Add `scenario:tarball-disconnect`, an on-demand scenario for clients that hang up in the middle of a proxied tarball download.

The mock uplink gets a `stall-mid-stream` mode: it sends half a tarball and keeps the response open, so the scenario can drop the client connection and observe, from the uplink side, whether the registry cancels the request it had open. It then checks that the interrupted tarball is not cached truncated and that the package installs.

Not every registry line carries the fix yet, so the scenario is skipped unless `E2E_PENDING_CONTRACT_CHECKS=tarball-disconnect` (or `true`) is set. It needs `--uplink-port` and the config from `--print-config`, like `scenario:uplink-failure`.
