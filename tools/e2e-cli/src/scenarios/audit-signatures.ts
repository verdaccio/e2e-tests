import assert from 'assert';

import { TestContext, TestDefinition } from '../types';
import { MockUplink } from '../utils/mock-uplink';
import { trace } from '../utils/process';
import { buildPackageTarball } from '../utils/publish';

/**
 * Scenario: audit-signatures
 *
 * `npm audit signatures` resolves signing keys by registry host: it asks the
 * registry under test for `/-/npm/v1/keys` and verifies every installed
 * package's `dist.signatures` with them. A registry that proxies npmjs has to
 * relay both routes for the command to work at all.
 *
 * Needs the same harness config as scenario:uplink-failure (an `e2emock`
 * uplink on E2E_UPLINK_PORT proxying `e2e-uplink-*`) and a registry that
 * serves `/-/npm/v1/keys` — on Verdaccio that is the experimental
 * `flags.signatures: true`. Without the flag the probe gets a 404 and the
 * scenario skips cleanly, so the battery still runs against registries that
 * do not have the feature.
 *
 *   - the registry relays the uplink's signing key
 *   - a package signed by the uplink verifies through the registry (exit 0)
 *   - a package whose signature does not match is reported as invalid (exit 1)
 */

function uplinkPort(): number {
  return parseInt(process.env.E2E_UPLINK_PORT || '', 10);
}

// npm pluralises: `1 package has a verified registry signature`, `2 packages have verified …`
const SIGNED = /\d+ packages? (?:has|have) .*verified.* registry signatures?/;
const INVALID = /\d+ packages? (?:has|have) .*invalid.* registry signatures?/;

async function auditSignatures(ctx: TestContext, dependency: string): Promise<string> {
  const { tempFolder } = await ctx.adapter.prepareProject(
    `e2e-audit-signatures-consumer-${ctx.runId}-${dependency.split('-').pop()}`,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token,
    { [dependency]: '1.0.0' }
  );
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'install',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  const { stdout } = await ctx.adapter.exec(
    { cwd: tempFolder },
    'audit',
    'signatures',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  return stdout;
}

async function testAuditSignatures(ctx: TestContext): Promise<void> {
  const id = ctx.runId;
  const mock = new MockUplink(uplinkPort());
  const signedPkg = `e2e-uplink-signed-${id}`;
  const tamperedPkg = `e2e-uplink-tampered-${id}`;
  // real (installable) tarballs: npm unpacks them before auditing
  mock.addPackage(signedPkg, buildPackageTarball(signedPkg, '1.0.0'), 'valid');
  mock.addPackage(tamperedPkg, buildPackageTarball(tamperedPkg, '1.0.0'), 'tampered');

  await mock.start();
  try {
    const probe = await fetch(`${ctx.registryUrl}/-/npm/v1/keys`);
    if (probe.status === 404) {
      trace('registry does not serve /-/npm/v1/keys (flags.signatures off?), skipping');
      return;
    }

    await ctx.subTest('registry relays the signing key of its uplink', async () => {
      assert.strictEqual(
        probe.status,
        200,
        `Expected 200 from /-/npm/v1/keys, got ${probe.status}`
      );
      const body = (await probe.json()) as { keys?: { keyid: string; key: string }[] };
      const keyids = (body.keys ?? []).map((k) => k.keyid);
      trace('registry keys: %j', keyids);
      assert.ok(keyids.includes(mock.registryKey.keyid), 'The uplink key is not relayed');
      const relayed = body.keys!.find((k) => k.keyid === mock.registryKey.keyid)!;
      assert.strictEqual(relayed.key, mock.registryKey.key, 'Relayed key material differs');
    });

    await ctx.subTest('a package signed by the uplink verifies through the registry', async () => {
      const stdout = await auditSignatures(ctx, signedPkg);
      trace('audit signatures (signed): %s', stdout);
      assert.ok(SIGNED.test(stdout), `Expected a verified signature report, got: ${stdout}`);
    });

    await ctx.subTest('a tampered signature is reported as invalid', async () => {
      let failure: Error | undefined;
      try {
        await auditSignatures(ctx, tamperedPkg);
      } catch (err) {
        failure = err as Error;
      }
      assert.ok(failure, 'npm audit signatures exited 0 for an invalid signature');
      trace('audit signatures (tampered): %s', failure.message);
      assert.ok(
        INVALID.test(failure.message),
        `Expected an invalid signature report, got: ${failure.message}`
      );
    });
  } finally {
    await mock.stop();
  }
}

export const auditSignaturesScenario: TestDefinition = {
  name: 'scenario:audit-signatures',
  // Needs the harness-provided uplink config; npm is the only client with `audit signatures`.
  appliesTo: (adapter) => adapter.type === 'npm' && Number.isFinite(uplinkPort()),
  timeout: 120_000,
  run: testAuditSignatures,
};
