import { SpawnOptions, spawn } from 'child_process';
import buildDebug from 'debug';
import { createInterface } from 'readline';

import { ExecOutput } from '../types';

const debug = buildDebug('verdaccio:e2e-cli:process');
const debugRead = buildDebug('verdaccio:e2e-cli:line');

export async function exec(options: SpawnOptions, cmd: string, args: string[]): Promise<ExecOutput> {
  debug('start exec %o %o %o', options, cmd, args ? args.join(' ') : '');
  let stdout = '';
  let stderr = '';
  debug(`Running \`${cmd} ${args.join(' ')}`);
  debug(`CWD: %o`, options.cwd);
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
      debugRead('exit %o', code);
      if (!code) {
        resolve({ stdout, stderr });
      } else {
        err.message += `${code}...\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n`;
        reject(err);
      }
    });
  });
}
