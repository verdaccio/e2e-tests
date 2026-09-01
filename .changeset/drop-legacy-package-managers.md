---
'@verdaccio/e2e-cli': major
---

Drop support for end-of-life package managers:

- **npm**: only majors 10, 11 and 12 are supported (npm 8 and 9 removed).
  npm 12 is stable now, so the CI matrix runs `npm@12` instead of a pinned
  pre-release.
- **pnpm**: minimum supported major is 10 (pnpm 8 and 9 removed).
- **Yarn Classic (v1)**: removed entirely — the `yarn-classic` adapter is gone
  and `--pm yarn-classic` / `--pm yarn1` now fail with a clear error pointing
  to `yarn-modern` (Yarn 3+).

The npm and pnpm adapters now validate the resolved version and fail fast
with an explicit error when an unsupported version is requested (or found in
PATH), instead of running the suite against a client that is no longer
maintained.
