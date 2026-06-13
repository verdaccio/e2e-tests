import assert from 'assert';
import { writeFile } from 'fs/promises';
import { join } from 'path';

import { TestContext, TestDefinition } from '../types';
import { parseInfoJson } from '../utils/info';
import { createTempFolder } from '../utils/project';

async function testInfo(ctx: TestContext): Promise<void> {
  // Create a minimal temp project so yarn modern has a project context
  // and yarn classic doesn't pick up the repo's packageManager field
  const tempFolder = await createTempFolder('info-test');
  await writeFile(
    join(tempFolder, 'package.json'),
    JSON.stringify({ name: 'info-test', version: '1.0.0' })
  );

  const resp = await ctx.adapter.exec(
    { cwd: tempFolder },
    'info',
    'verdaccio',
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );

  if (ctx.adapter.type === 'yarn-classic') {
    const lines = resp.stdout.split('\n').filter(Boolean);
    const dataLine = lines.find((l) => {
      try {
        const obj = JSON.parse(l);
        return obj.type === 'inspect';
      } catch {
        return false;
      }
    });
    assert.ok(dataLine, 'Expected yarn info NDJSON to contain an "inspect" entry');
  } else if (ctx.adapter.type === 'deno') {
    // deno info npm:<pkg> outputs a text dependency tree
    const output = resp.stdout + resp.stderr;
    assert.ok(output.includes('verdaccio'), 'Expected deno info output to reference verdaccio');
  } else {
    const parsedBody = parseInfoJson(resp.stdout);
    assert.strictEqual(parsedBody.name, 'verdaccio', 'Expected package name "verdaccio"');
    assert.ok(parsedBody.dependencies !== undefined, 'Expected "dependencies" to be defined');
  }
}

export const infoTest: TestDefinition = {
  name: 'info',
  requires: ['info'],
  run: testInfo,
};
