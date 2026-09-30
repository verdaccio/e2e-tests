---
'@verdaccio/e2e-cli': minor
---

Add a `upm` package-manager adapter ([upm.sh](https://upm.sh)). upm proxies most
commands to npm, so the suite exercises only its native `install` and `ci`.
Registry, auth and the release-age cooldown (`min-release-age=0`) come from the
project `.npmrc`. Wired into the CLI (`--pm upm`) and the CI matrix.
