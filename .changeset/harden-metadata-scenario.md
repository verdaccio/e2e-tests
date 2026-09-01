---
'@verdaccio/e2e-cli': patch
---

Harden `scenario:metadata`: the abbreviated (install-v1) check now asserts
`_id`, `_rev` and `readmeFilename` are absent (not just `readme` — all of them
leaked once), and a new sub-test verifies the packument ETag changes after a
new version is published, so a stuck ETag serving 304 forever fails the suite.
