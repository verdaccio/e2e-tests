---
'@verdaccio/e2e-cli': patch
---

Accept a registry URL with a trailing slash, such as pnpr's `http://localhost:4873/npm/`. The CLI built request paths by appending `/-/...` to it, so the slash produced `//-/user/...` and the test user could not be created. The ping test also compares the registry npm reports without its trailing slash, which npm adds to a bare host but not to a path.
