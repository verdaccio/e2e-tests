---
'@verdaccio/e2e-cli': minor
---

Add ci test, install-multiple-deps scenario, and audit test improvements

- Add `ci` test that verifies lockfile-based install (npm ci, pnpm --frozen-lockfile, yarn --frozen-lockfile/--immutable)
- Add `scenario:install-multiple-deps` scenario that publishes a dependency tree and installs them in a consumer project
- Restrict audit test to npm only and skip gracefully when the registry does not support the audit endpoint
- Fix install test to work with npm@7 (removed audit field assertion)
- Add verdaccio next-7 to CI matrix
- Update CI to use .nvmrc for node version
