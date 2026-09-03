---
'@verdaccio/e2e-ui': minor
---

Four new feature-gated test suites, born from the verdaccio/verdaccio#6210 bug batch (30 UI bugs, most of them invisible to the previous e2e coverage):

- `detailTests` — version-pinned `/v/<version>` urls and the wire format of the UI's data requests (scoped names must stay literal `@scope/name`, never `%40`-encoded; pins the regression these suites caught in #6210). `versionNotFound` probe for the new 404-on-unknown-version behavior.
- `failureModeTests` — a dead backend must not look like a healthy empty registry, and a 5xx on the detail page must render an error state instead of a blank page (strict assertions gated as probes until #6210 ships).
- `i18nKeyTests` — raw-i18n-key detector: no page may render untranslated keys like `security.addUser.title`; catches the whole "namespace missing from the bundle" class.
- `signupTests` — the create-user flow end to end, including the `PUT /-/verdaccio/sec/signup` wire contract (36-char `sessionId`); gated as a probe because every published ui-theme posts to a URL that only serves the SPA.

New `errors.genericError` testid group, `signup` selector group, and feature flags `detail.*`, `failureModes.*`, `i18n.*`, `signup.*` (probes default `false`, everything else `true`). Validated green against published verdaccio@6 with defaults and against a #6210 build with all probes enabled.
