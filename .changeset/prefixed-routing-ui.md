---
'@verdaccio/e2e-ui': minor
---

Add an opt-in `prefixedRoutingTests` suite for Verdaccio instances mounted under a
URL prefix with asynchronous middleware. It verifies package listing, navigation
to a scoped package, sidebar and README requests, and ping through the mounted URL.

Consumers provide `startRoutingRegistry` and `stopRoutingRegistry` Cypress tasks
to run the fixture against their own Verdaccio build. The suite accepts the usual
registry configuration for test ID overrides and derives the expected path from
the fixture URL. It is registered separately from `registerAllTests` because it
requires these additional tasks.
