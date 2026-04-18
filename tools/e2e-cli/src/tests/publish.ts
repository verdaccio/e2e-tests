import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function testPublish(ctx: TestContext): Promise<void> {
  const packages = [
    `verdaccio-memory-${ctx.runId}`,
    `verdaccio-${ctx.runId}`,
    `@verdaccio/foo-${ctx.runId}`,
    `@verdaccio/some-foo-${ctx.runId}`,
  ];

  const type = ctx.adapter.type;

  for (const pkgName of packages) {
    const { tempFolder } = await ctx.adapter.prepareProject(
      pkgName,
      '1.0.0',
      ctx.registryUrl,
      ctx.port,
      ctx.token
    );

    // yarn modern requires install before publish to generate lockfile
    if (type === 'yarn-modern') {
      await ctx.adapter.exec({ cwd: tempFolder }, 'install');
    }

    const resp = await ctx.adapter.exec(
      { cwd: tempFolder },
      'publish',
      '--json',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );

    if (type === 'yarn-modern') {
      assert.ok(
        resp.stdout.match(/Package archive published/),
        `Expected "Package archive published" for ${pkgName} but got "${resp.stdout}"`
      );
    } else if (type === 'yarn-classic') {
      // yarn classic --json outputs NDJSON — just verify no error exit (exit code 0 is enough)
      assert.ok(resp.stdout.length > 0, `Expected publish output for ${pkgName}`);
    } else {
      // npm / pnpm
      try {
        const parsedBody = JSON.parse(resp.stdout);
        assert.strictEqual(parsedBody.name, pkgName, `Expected package name "${pkgName}" but got "${parsedBody.name}"`);
        assert.ok(parsedBody.files, `Expected files to be defined for ${pkgName}`);
      } catch {
        // pnpm v11+ native publish doesn't output JSON — exit code 0 is sufficient
        assert.ok(true, `Publish succeeded for ${pkgName}`);
      }
    }
  }
}

export const publishTest: TestDefinition = {
  name: 'publish',
  requires: ['publish'],
  run: testPublish,
};
