---
'@verdaccio/e2e-cli': minor
---

Add a `nub` package-manager adapter ([nubjs.com](https://nubjs.com),
`@nubjs/nub`). nub is an all-in-one Node.js toolkit whose package-manager side
only covers the install path, so the suite exercises its native `install` and
`ci`. Registry and auth come from the project `.npmrc`; the adapter passes
`--minimum-release-age=0` because nub enforces a strict 24h cooldown by default.
Wired into the CLI (`--pm nub`) and the CI matrix.
