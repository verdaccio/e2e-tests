---
'@verdaccio/e2e-cli': patch
---

Cover the login of an existing user in the `login` test: the retry with Basic that `npm login` sends and the one native `yarn npm login` sends (Basic on the GET and on the PUT), plus the rejection of a wrong password. Both are replayed over HTTP, so they run once per Yarn version.
