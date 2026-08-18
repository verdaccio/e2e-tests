---
'@verdaccio/e2e-cli': patch
---

Update Yarn modern login tests for Verdaccio without incoming Basic authentication. The login scenario now treats duplicate legacy login as unsupported and uses fresh users for publish and switch-user checks.
