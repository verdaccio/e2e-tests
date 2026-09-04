---
'@verdaccio/e2e-ui': minor
---

Second wave of feature-gated coverage, closing the e2e gaps left by the verdaccio/verdaccio#6210 bug batch:

- `publishPackage` task accepts a `manifest` override merged into the generated package.json, enabling fixtures with the manifest shapes real packuments carry (string `repository`, `funding` arrays, contributors without email, …)
- `manifestRenderingTests` — repository rendered as a browsable https link (git:// rewrite), funding array, bugs url, sidebar gravatars and email-less contributors surviving dedupe
- `sessionTests` — an expired token in localStorage boots the UI logged out (default on) and is purged from storage (probe)
- `detailTests` gains a stale-state probe: the versions tab must show the current package after SPA navigation
- `failureModeTests` gains search-5xx (error instead of "no results found") and failed-tarball-download (error snackbar instead of silence) probes
- `settingsTests` gains a dayjs-locale probe: relative dates must follow the selected language

Probes default `false` (they need the #6210 fixes); everything else runs against released lines. Validated green against published verdaccio@6 with defaults and 19/19 with every probe enabled against a #6210 master build.
