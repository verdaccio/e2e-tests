---
'@verdaccio/e2e-cli': patch
---

fix: support npm 12 in e2e-cli

npm 12 wraps `npm info <pkg> --json` output in a single-element array instead of
a bare object, which made the info, deprecate and install-multiple-deps tests read
an `undefined` package name. Added a `normalizeInfo` helper that unwraps the array
(backward-compatible with older npm).

Also pin `min-release-age=0` in the generated project `.npmrc` so npm 12's new
release-age cooldown — if set in a developer's global `~/.npmrc` — no longer rejects
the freshly published packages the tests install.
