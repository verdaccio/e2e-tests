#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const binaryName = process.platform === 'win32' ? 'verdaccio-e2e.exe' : 'verdaccio-e2e';
const packaged = resolve(here, '..', 'build', 'bin', binaryName);
const localRelease = resolve(here, '..', 'target', 'release', binaryName);
const binary = existsSync(packaged) ? packaged : localRelease;

if (!existsSync(binary)) {
  console.error(
    'verdaccio-e2e binary not found. Run "pnpm --filter @verdaccio/e2e-cli build" first.'
  );
  process.exit(1);
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
