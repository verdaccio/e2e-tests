import buildDebug from 'debug';

import {
  createNpmAdapter,
  createPnpmAdapter,
  createYarnClassicAdapter,
  createYarnModernAdapter,
} from './adapters';
import { allTests } from './tests';
import { CliOptions, PackageManagerAdapter } from './types';
import { createUser, pingRegistry } from './utils/registry-client';
import { runAll } from './runner';

const debug = buildDebug('verdaccio:e2e-cli');

function parseAdapters(pmFilters?: string[]): PackageManagerAdapter[] {
  if (!pmFilters || pmFilters.length === 0) {
    // Default: just npm
    return [createNpmAdapter()];
  }

  const adapters: PackageManagerAdapter[] = [];

  for (const filter of pmFilters) {
    const [name, binPath] = filter.split('=');
    const lowerName = name.toLowerCase();

    if (lowerName === 'npm') {
      adapters.push(createNpmAdapter(binPath));
    } else if (lowerName === 'pnpm') {
      adapters.push(createPnpmAdapter(binPath));
    } else if (lowerName === 'yarn-classic' || lowerName === 'yarn1') {
      adapters.push(createYarnClassicAdapter(binPath));
    } else if (lowerName.startsWith('yarn-modern') || lowerName === 'yarn') {
      if (!binPath) {
        throw new Error(
          `yarn-modern requires a bin path: --pm yarn-modern=/path/to/yarn.js`
        );
      }
      adapters.push(createYarnModernAdapter(binPath));
    } else {
      throw new Error(`Unknown package manager: "${name}". Supported: npm, pnpm, yarn-classic, yarn-modern`);
    }
  }

  return adapters;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    registry: '',
    pm: [],
    test: [],
    concurrency: 1,
    timeout: 50000,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--registry' || arg === '-r') {
      options.registry = argv[++i];
    } else if (arg === '--pm') {
      options.pm!.push(argv[++i]);
    } else if (arg === '--test' || arg === '-t') {
      options.test!.push(argv[++i]);
    } else if (arg === '--concurrency' || arg === '-c') {
      options.concurrency = parseInt(argv[++i], 10);
    } else if (arg === '--timeout') {
      options.timeout = parseInt(argv[++i], 10);
    } else if (arg === '--token') {
      options.token = argv[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--registry=')) {
      options.registry = arg.split('=')[1];
    } else if (arg.startsWith('--pm=')) {
      options.pm!.push(arg.split('=')[1]);
    } else if (arg.startsWith('--test=')) {
      options.test!.push(arg.split('=')[1]);
    } else if (arg.startsWith('--token=')) {
      options.token = arg.split('=')[1];
    } else if (arg.startsWith('--timeout=')) {
      options.timeout = parseInt(arg.split('=')[1], 10);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
  @verdaccio/e2e-cli - Run Verdaccio e2e tests against any running registry

  Usage:
    verdaccio-e2e --registry <url> [options]

  Required:
    -r, --registry <url>    Verdaccio registry URL (e.g. http://localhost:4873)

  Options:
    --pm <name[=path]>      Package manager to test (can be repeated)
                            Supported: npm, pnpm, yarn-classic, yarn-modern
                            Examples: --pm npm --pm pnpm
                                      --pm npm=/path/to/npm
                                      --pm yarn-modern=/path/to/yarn.js
                            Default: npm

    -t, --test <name>       Filter tests by name (can be repeated)
                            Available: publish, install, audit, info, deprecate,
                                       dist-tags, ping, search, star, unpublish
                            Default: all supported by the PM

    --token <token>         Auth token (skips user creation)
    --timeout <ms>          Per-test timeout (default: 50000)
    -v, --verbose           Enable debug output
    -h, --help              Show this help
  `);
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const options = parseArgs(argv);

  if (!options.registry) {
    console.error('Error: --registry is required\n');
    printHelp();
    process.exit(1);
  }

  if (options.verbose) {
    const { setVerbose } = await import('./utils/process');
    setVerbose(true);
  }

  // Ensure registry is reachable
  console.log(`Checking registry at ${options.registry}...`);
  const alive = await pingRegistry(options.registry);
  if (!alive) {
    console.error(`Error: Registry at ${options.registry} is not reachable`);
    process.exit(1);
  }
  console.log(`Registry is alive.`);

  // Get auth token
  let token = options.token;
  if (!token) {
    console.log('Creating test user...');
    const auth = await createUser(options.registry);
    token = auth.token;
    console.log(`User "${auth.user}" created.`);
  }

  // Build adapter list
  const adapters = parseAdapters(options.pm);
  console.log(`Adapters: ${adapters.map((a) => a.name).join(', ')}`);

  // Filter tests
  const tests = options.test && options.test.length > 0
    ? allTests.filter((t) => options.test!.includes(t.name))
    : allTests;

  console.log(`Tests: ${tests.map((t) => t.name).join(', ')}`);

  // Run
  const { exitCode } = await runAll(adapters, tests, options.registry, token, {
    timeout: options.timeout,
    concurrency: options.concurrency,
    testFilter: options.test,
  });

  process.exit(exitCode);
}

// Re-export for programmatic usage
export { allTests } from './tests';
export { createNpmAdapter, createPnpmAdapter, createYarnClassicAdapter, createYarnModernAdapter } from './adapters';
export { runAll, runSuite } from './runner';
export type { PackageManagerAdapter, TestDefinition, TestContext, CliOptions } from './types';
