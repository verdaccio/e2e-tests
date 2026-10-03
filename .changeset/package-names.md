---
'@verdaccio/e2e-cli': minor
---

Add a `package-names` test and a `scenario:reserved-names` scenario.

`package-names` publishes, serves and installs unusual names that are valid for existing npm packages (capitals, a leading underscore inside a scope, a scope named like a Windows device name, a leading hyphen). Rejection of names npm does not accept is a pending contract check, enabled with `E2E_PENDING_CONTRACT_CHECKS=package-names`.

`scenario:reserved-names` uses the mock uplink to proxy packages named like Windows device names, which exist on npmjs, and checks that the registry stays healthy when they are requested with the uplink down. Downloading their tarballs, installing them and publishing such a name locally are pending contract checks, enabled with `E2E_PENDING_CONTRACT_CHECKS=reserved-names`. The `--print-config` config routes the new `nul.*` and `@e2e-uplink/*` patterns to the mock uplink.

`dist-tags` also adds and removes tags named `aux` and `con`, and the mock uplink now serves scoped packages with the correct tarball file name.
