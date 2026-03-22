import { SpawnOptions, spawn } from 'child_process';
import buildDebug from 'debug';
import { createInterface } from 'readline';
import { basename } from 'path';

import { ExecOutput } from '../types';

const debug = buildDebug('verdaccio:e2e-cli:process');
const debugRead = buildDebug('verdaccio:e2e-cli:line');

let _verbose = false;

export function setVerbose(v: boolean) {
  _verbose = v;
}

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

function shortCmd(cmd: string, args: string[]): string {
  const bin = basename(cmd);
  return `${bin} ${args.join(' ')}`;
}

export async function exec(options: SpawnOptions, cmd: string, args: string[]): Promise<ExecOutput> {
  debug('start exec %o %o %o', options, cmd, args ? args.join(' ') : '');
  let stdout = '';
  let stderr = '';

  if (_verbose) {
    const cwd = options.cwd ? ` ${COLORS.dim}(cwd: ${basename(String(options.cwd))})${COLORS.reset}` : '';
    process.stdout.write(`      ${COLORS.cyan}$${COLORS.reset} ${shortCmd(cmd, args)}${cwd}\n`);
  }

  const spawnOptions: SpawnOptions = {
    cwd: options.cwd,
    stdio: options.stdio || 'pipe',
    env: options.env || process.env,
  };

  if (process.platform.startsWith('win')) {
    args.unshift('/c', cmd);
    cmd = 'cmd.exe';
    spawnOptions.stdio = 'pipe';
  }

  const start = Date.now();
  const childProcess = spawn(cmd, args, spawnOptions);

  if (childProcess.stdout) {
    childProcess.stdout.on('data', (data) => {
      debugRead('data %o', data.toString());
    });
    const rl = createInterface({
      input: childProcess.stdout,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', function (line) {
      debugRead('line %o', line);
      stdout += line;
    });
  }

  if (childProcess.stderr) {
    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
  }

  const err = new Error(`Running "${cmd} ${args.join(' ')}" returned error code `);
  return new Promise((resolve, reject) => {
    childProcess.on('exit', (code) => {
      const duration = Date.now() - start;
      debugRead('exit %o', code);

      if (_verbose) {
        const status = code
          ? `${COLORS.red}exit ${code}${COLORS.reset}`
          : `${COLORS.green}ok${COLORS.reset}`;
        process.stdout.write(`      ${COLORS.dim}  -> ${status} ${COLORS.dim}(${duration}ms)${COLORS.reset}\n`);
      }

      if (!code) {
        resolve({ stdout, stderr });
      } else {
        err.message += `${code}...\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n`;
        reject(err);
      }
    });
  });
}
