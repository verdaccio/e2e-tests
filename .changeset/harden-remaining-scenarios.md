---
'@verdaccio/e2e-cli': patch
---

Harden the remaining scenarios:

- `scenario:tarballs`: shasum/integrity assertions are now hard (their absence
  on a locally published version is a bug, not a skip), aborts now exercise
  three depths into the stream (first chunk, 25%, 50%) via a new `onChunk`
  download hook, and two gated contract checks pin that tarball responses
  should advertise `Content-Length` and must not be re-compressed for
  gzip-accepting clients (red against current registries — behind
  `PENDING_CONTRACT_CHECKS_ENABLED`).
- `scenario:uplink-failure`: new sub-test for an uplink answering 500 (cached
  package still served, unknown fails cleanly, registry stays up), and the
  slow-uplink assertion tightened from 9s to 6s so retry/timeout
  multiplication regressions are caught earlier.
- `scenario:install-multiple-deps`: the re-install phase now verifies the
  version that actually lands in `node_modules` — `^1.0.0` must resolve to
  1.0.0 even though `dist-tags.latest` points at 2.0.0 (npm/pnpm/bun; yarn
  PnP has no `node_modules`).
