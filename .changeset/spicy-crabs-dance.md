---
'@verdaccio/e2e-ui': minor
---

second wave of coverage: session token lifecycle suite (expired stored token boots logged out, optional purge probe), manifest-rendering suite (string/array `repository`, `funding`, `bugs` and email-less contributors), publishPackage task accepts manifest overrides, and new feature-gated probes in the detail, failure-modes and settings suites.

Also makes the change-password wrong-old-password assertion text-agnostic: the error banner wording differs across verdaccio lines (published ui-theme shows "Failed to change password", master surfaces the server message via `authErrorMessage`), so it now asserts a non-empty banner rather than an exact string, while still failing on the raw "Cannot PUT" 404 that means the `reset_password` route was not registered.
