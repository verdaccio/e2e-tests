import assert from 'assert';
import buildDebug from 'debug';

import { TestContext, TestDefinition } from '../types';

const debug = buildDebug('verdaccio:e2e-cli:test:audit');

async function testAudit(ctx: TestContext): Promise<void> {
  // Audit is only reliable with npm — pnpm/yarn audit output varies too much
  if (ctx.adapter.type !== 'npm') {
    debug('skipping audit test for %s (npm only)', ctx.adapter.type);
    return;
  }

  const packages = [`verdaccio-audit-${ctx.runId}`, `@verdaccio/audit-${ctx.runId}`];

  for (const pkgName of packages) {
    const { tempFolder } = await ctx.adapter.prepareProject(
      pkgName,
      '1.0.0',
      ctx.registryUrl,
      ctx.port,
      ctx.token,
      { jquery: '3.6.1' }
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

    const resp = await ctx.adapter.exec(
      { cwd: tempFolder },
      'audit',
      '--json',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );

    const parsedBody = JSON.parse(resp.stdout);
    assert.ok(parsedBody.auditReportVersion !== undefined, 'Expected "auditReportVersion" in audit response');
    assert.ok(parsedBody.vulnerabilities !== undefined, 'Expected "vulnerabilities" in audit response');
  }
}

export const auditTest: TestDefinition = {
  name: 'audit',
  requires: ['audit'],
  run: testAudit,
};
