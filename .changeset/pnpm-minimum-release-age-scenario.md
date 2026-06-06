---
'@verdaccio/e2e-cli': minor
---

Add a pnpm 11+ scenario testing `minimumReleaseAge` with `minimumReleaseAgeExclude`

A new `scenario:minimum-release-age` exercises pnpm's release-age cooldown (`minimumReleaseAge: 10080`) together with `minimumReleaseAgeExclude` (`@verdaccio/*`, `verdaccio-*`). It verifies that excluded packages install despite being freshly published while a non-excluded fresh package is blocked by the cooldown. The scenario is gated to pnpm 11 and newer via a new `appliesTo` predicate on `TestDefinition` and is skipped for other package managers.
