---
'@verdaccio/e2e-cli': patch
---

Accept a registry URL with a trailing slash, such as pnpr's `http://localhost:4873/npm/`. The CLI built request paths by appending `/-/...` to it, so the slash produced `//-/user/...` and the test user could not be created.
