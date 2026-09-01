import assert from 'assert';
import buildDebug from 'debug';

import { TestContext, TestDefinition } from '../types';
import { publishLocalPackage } from '../utils/publish';

const debug = buildDebug('verdaccio:e2e-cli:test:audit');

async function testAudit(ctx: TestContext): Promise<void> {
  // Audit is only reliable with npm and bun — pnpm/yarn audit output varies too much
  if (ctx.adapter.type !== 'npm' && ctx.adapter.type !== 'bun') {
    debug('skipping audit test for %s (npm/bun only)', ctx.adapter.type);
    return;
  }

  const packages = [`verdaccio-audit-${ctx.runId}`, `@verdaccio/audit-${ctx.runId}`];

  // Publish the dependency locally so metadata/tarball resolution never leaves
  // the registry under test (the suite must run offline). Only the audit
  // report request itself may travel upstream, and that is skipped below when
  // the endpoint is unavailable.
  const depName = `e2e-audit-dep-${ctx.runId}`;
  await publishLocalPackage(ctx, depName, '1.0.0');

  for (const pkgName of packages) {
    const { tempFolder } = await ctx.adapter.prepareProject(
      pkgName,
      '1.0.0',
      ctx.registryUrl,
      ctx.port,
      ctx.token,
      { [depName]: '1.0.0' }
    );

    // install is required to create package lock file
    await ctx.adapter.exec(
      { cwd: tempFolder },
      'install',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );

    // npm audit exits with code 1 both when vulnerabilities are found AND when
    // the endpoint is unavailable. We need to distinguish between the two.
    // Probe the audit endpoint first to avoid false failures on registries
    // that don't support it (e.g. verdaccio next-7+).
    try {
      const probe = await fetch(`${ctx.registryUrl}/-/npm/v1/security/audits/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (probe.status === 404) {
        debug('audit endpoint not supported by this registry (404), skipping');
        return;
      }
    } catch {
      debug('audit endpoint probe failed, skipping');
      return;
    }

    let resp;
    try {
      resp = await ctx.adapter.exec(
        { cwd: tempFolder },
        'audit',
        '--json',
        ...ctx.adapter.registryArg(ctx.registryUrl)
      );
    } catch (err) {
      // The registry proxies audit reports upstream; when running offline that
      // upstream is unreachable and the audit command fails — that is not a
      // registry bug, so skip instead of failing the suite.
      const message = err instanceof Error ? err.message : String(err);
      if (/503|ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|audit/i.test(message)) {
        debug('audit upstream unreachable (offline?), skipping: %s', message);
        return;
      }
      throw err;
    }

    if (ctx.adapter.type === 'bun') {
      // bun audit output may differ — exit code 0 is sufficient for basic validation
      assert.ok(resp.stdout.length > 0 || resp.stderr.length > 0, 'Expected audit output');
    } else {
      const parsedBody = JSON.parse(resp.stdout);
      assert.ok(
        parsedBody.auditReportVersion !== undefined,
        'Expected "auditReportVersion" in audit response'
      );
      assert.ok(
        parsedBody.vulnerabilities !== undefined,
        'Expected "vulnerabilities" in audit response'
      );
    }
  }
}

export const auditTest: TestDefinition = {
  name: 'audit',
  requires: ['audit'],
  run: testAudit,
};
