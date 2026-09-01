import { SpawnOptions } from 'child_process';

export type ExecOutput = {
  stdout: string;
  stderr: string;
};

export type ExecFn = (options: SpawnOptions, ...args: string[]) => Promise<ExecOutput>;

export type TestContext = {
  registryUrl: string;
  token: string;
  port: number;
  exec: ExecFn;
  adapter: PackageManagerAdapter;
  /** Unique suffix for package names to avoid conflicts across runs */
  runId: string;
  /** Report a sub-test step. Runs the callback and reports pass/fail. */
  subTest: (label: string, fn: () => Promise<void>) => Promise<void>;
};

export type SubTestResult = {
  label: string;
  passed: boolean;
  duration: number;
  error?: string;
};

export type TestResult = {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  subTests?: SubTestResult[];
};

export type SuiteResult = {
  adapter: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
};

export type TestDefinition = {
  name: string;
  run: (ctx: TestContext) => Promise<void>;
  /** Commands required for this test (e.g. 'deprecate', 'search'). Skipped if adapter doesn't support them. */
  requires?: string[];
  /**
   * Minimum timeout (ms) for this test. The effective timeout is the larger of
   * this and the CLI-level --timeout. Use for long scenarios (large tarballs,
   * uplink failure simulation) that outgrow the default per-test budget.
   */
  timeout?: number;
  /**
   * Predicate to gate a test to specific adapters/versions. Returns false to skip.
   * Use for tests that only make sense on a particular package manager or version
   * (e.g. pnpm-only settings). Evaluated after the `requires` check.
   */
  appliesTo?: (adapter: PackageManagerAdapter) => boolean;
};

export interface PackageManagerAdapter {
  /** Display name, e.g. "npm@10" */
  name: string;
  /** Package manager type: npm, pnpm, yarn-modern, bun, deno */
  type: 'npm' | 'pnpm' | 'yarn-modern' | 'bun' | 'deno';
  /** Resolved path to the binary */
  bin: string;
  /** Commands this PM supports */
  supports: Set<string>;
  /** Build --registry args */
  registryArg(url: string): string[];
  /** Build --prefix / --cwd args */
  prefixArg(folder: string): string[];
  /** Execute a command with this PM */
  exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput>;
  /** Prepare a temp project for testing. Returns path to temp folder. */
  prepareProject(
    packageName: string,
    version: string,
    registryUrl: string,
    port: number,
    token: string,
    dependencies?: Record<string, string>,
    devDependencies?: Record<string, string>
  ): Promise<{ tempFolder: string }>;
  /** Import a Verdaccio yarn plugin into a project (yarn-modern only) */
  importPlugin?(cwd: string, pluginName: string): Promise<void>;
}

export type CliOptions = {
  registry: string;
  pm?: string[];
  test?: string[];
  concurrency: number;
  timeout: number;
  token?: string;
  verbose: boolean;
  /** Port of the mock uplink used by scenario:uplink-failure (also E2E_UPLINK_PORT) */
  uplinkPort?: number;
  /** Print the recommended registry config for the full battery and exit */
  printConfig?: boolean;
};
