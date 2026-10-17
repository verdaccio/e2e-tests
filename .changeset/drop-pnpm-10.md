---
'@verdaccio/e2e-cli': major
---

Drop support for pnpm 10: the minimum supported major is now 11. The pnpm adapter fails fast with an explicit error when pnpm 10 is requested or found in PATH, and the `dist-tags`, `ping` and `search` tests no longer run for pnpm, since only pnpm 10 supported them.
