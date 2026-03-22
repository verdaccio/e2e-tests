import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function testAudit(ctx: TestContext): Promise<void> {
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

    const resp = await ctx.adapter.exec(
      { cwd: tempFolder },
      'audit',
      '--json',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );

    const parsedBody = JSON.parse(resp.stdout);

    if (ctx.adapter.type === 'npm') {
      assert.ok(parsedBody.metadata !== undefined, 'Expected "metadata" in audit response');
      assert.ok(
        parsedBody.auditReportVersion !== undefined,
        'Expected "auditReportVersion" in audit response'
      );
      assert.ok(
        parsedBody.vulnerabilities !== undefined,
        'Expected "vulnerabilities" in audit response'
      );
    } else {
      // pnpm audit --json returns advisories-based format
      assert.ok(parsedBody !== undefined, 'Expected audit JSON response');
    }
  }
}

export const auditTest: TestDefinition = {
  name: 'audit',
  requires: ['audit'],
  run: testAudit,
};
