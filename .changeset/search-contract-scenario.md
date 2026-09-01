---
'@verdaccio/e2e-cli': minor
---

Add `scenario:search` — a contract battery for `GET /-/v1/search` pinning the
registry.npmjs.org spec and what npm CLI 12 actually consumes: result shape
(`maintainers` must be an array), real `total` vs page size, `from`/`size`
pagination over local results and over results merged with an uplink, 400
`ERR_TEXT_MISSING` without `text`, ISO 8601 `time`, the npmjs size clamp, and
a real `npm search --json` on top. The shared mock uplink now implements
`/-/v1/search` the way npmjs does (it applies `from`/`size` itself and reports
the real `total`), which is what exposes double pagination in the registry
under test. The contract checks run independently and are all reported before
the scenario fails, so one run lists every divergence.

The checks that are red against every current Verdaccio (real `total`, 400
without `text`, ISO `time`, merged local+uplink pagination) ship disabled
behind `PENDING_CONTRACT_CHECKS_ENABLED` so the scenario stays green in CI;
flip the flag once the registry-side fixes land.
