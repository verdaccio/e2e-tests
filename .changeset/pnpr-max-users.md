---
'@verdaccio/e2e-cli': patch
---

Fix the pnpr config printed by `--print-config --server pnpr` for `@pnpm/pnpr@next` 0.1.0-alpha.18 and later.

pnpr renamed `auth.htpasswd.max_users` to `maxUsers` and rejects the old spelling (`unknown field max_users, expected one of file, maxUsers`), so every battery run against pnpr failed before the registry started. The printed config uses the new name; the Verdaccio config keeps `max_users`.
