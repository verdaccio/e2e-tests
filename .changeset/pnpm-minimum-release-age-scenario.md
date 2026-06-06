---
'@verdaccio/e2e-cli': minor
---

Add a pnpm scenario testing `minimumReleaseAge` with `minimumReleaseAgeExclude`

A new `scenario:minimum-release-age` exercises pnpm's release-age cooldown (`minimumReleaseAge: 10080`) together with `minimumReleaseAgeExclude` (`@verdaccio/*`, `verdaccio-*`). It verifies that excluded packages install despite being freshly published while a non-excluded fresh package is blocked by the cooldown. The scenario is gated via a new `appliesTo` predicate on `TestDefinition` to pnpm 11.1.0+ (the cooldown is silently ignored in 11.0.x) and is skipped for other package managers.
