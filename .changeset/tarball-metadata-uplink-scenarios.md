---
'@verdaccio/e2e-cli': minor
---

Add an HTTP-protocol e2e battery and the harness support it needs:

- `scenario:tarballs`: publishes a large (~30 MB, incompressible) package and
  exercises the tarball endpoints — full download with Content-Length +
  shasum/integrity verification, repeated client aborts mid-download,
  concurrent downloads, 404s (missing package/version/mismatched filename),
  scoped `%2f`-encoded URLs, and an end-to-end install through the package
  manager.
- `scenario:metadata`: packument battery — full packument shape (versions,
  dist-tags, readme, time), abbreviated metadata
  (`Accept: application/vnd.npm.install-v1+json`), `ETag`/`If-None-Match`
  → 304 revalidation, `dist.tarball` URL rewriting, scoped `%2f` URLs, 404
  error body, and coherence after publish/unpublish.
- `scenario:uplink-failure`: starts a controllable mock uplink and verifies
  registry behavior when the uplink is healthy, drops the connection
  mid-tarball (no client hang, no poisoned cache), is slower than the
  configured timeout, or is down (cached packages still served, clean errors
  otherwise). Gated on `--uplink-port` / `E2E_UPLINK_PORT`.
- New `--print-config` flag printing the recommended registry config for the
  full battery (`max_body_size: 100mb`, mock uplink wiring) so every consuming
  repo starts Verdaccio from the same single source of truth.
- New `--uplink-port` flag and support for per-test minimum timeouts in
  `TestDefinition`.
- The whole suite now runs fully offline: the generated config has no npmjs
  uplink, and every test publishes the packages it consumes (install, ci,
  audit, info and search no longer depend on react/is-odd/jquery/npmjs).
  Adapters that cannot publish (deno) get their fixtures through the raw
  registry HTTP API. Project `.npmrc` files disable npm's implicit
  audit/fund requests, and client-side tests always run from a prepared
  project so a stale token in the developer's global `~/.npmrc` cannot break
  them. The audit test skips cleanly when the audit upstream is unreachable.
