---
'@verdaccio/e2e-ui': patch
---

Remove the non-deterministic "no results" search test from `searchTests`.

Verdaccio 7+ removed the `searchRemote` flag (verdaccio/verdaccio#5801), so the
Web UI search now always queries configured uplinks. When the registry proxies
to `registry.npmjs.org`, npm's `/-/v1/search` returns fuzzy/fallback matches for
any non-empty text, so no query reliably yields an empty result and renders the
autocomplete's "No results found" state. This made the empty-state assertion fail
on `next-7`/`next-9` (it only ever passed on `6.x`, where search stayed local by
default). The search flow stays covered by the remaining input/request/clear tests
and the published-package result tests.
