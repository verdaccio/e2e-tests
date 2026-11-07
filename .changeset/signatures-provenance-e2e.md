---
'@verdaccio/e2e-cli': minor
'@verdaccio/e2e-ui': minor
---

Cover registry signatures and the provenance UI.

`@verdaccio/e2e-cli` gains `scenario:audit-signatures`: the mock uplink now generates an EC P-256 signing key per run, publishes it on `/-/npm/v1/keys` and signs its packages the way registry.npmjs.org does, so `npm audit signatures` can verify a package installed through the registry under test, and a tampered signature must be reported as invalid. The scenario needs the harness uplink config (`--uplink-port`) and a registry that relays `/-/npm/v1/keys`; on Verdaccio that is the experimental `flags.signatures: true`. Without it the probe gets a 404 and the scenario skips.

`@verdaccio/e2e-ui` gains `provenanceTests`, behind the `provenance.sidebarSection` feature flag (default `false`): a published version carrying `dist.attestations` or `dist.signatures` shows the "Provenance" chip under "Distribution", the dialog lists the statement type, the key ids and the attestation link, the build details are requested only once the dialog opens, and a plain package renders no section. Test ids `package.provenanceBadge` and `package.provenanceDialog` are added.
