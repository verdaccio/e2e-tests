---
'@verdaccio/e2e-cli': patch
---

Fix the bun adapter failing the `publish` test on bun 1.4.4.

bun 1.4.4 removed the `--json` flag from `bun publish` and now exits with `error: bun publish has no --json flag.`, so the `publish` test failed for every registry under test. The bun adapter now drops `--json` from `publish`. The publish test already checked only the exit code for bun, and older bun versions behave the same without the flag.
