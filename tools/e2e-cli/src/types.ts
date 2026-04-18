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

export type TestResult = {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
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
  /** Commands required for this test (e.g. 'deprecate', 'star'). Skipped if adapter doesn't support them. */
  requires?: string[];
};

export interface PackageManagerAdapter {
  /** Display name, e.g. "npm@10" */
  name: string;
  /** Package manager type: npm, pnpm, yarn-classic, yarn-modern */
  type: 'npm' | 'pnpm' | 'yarn-classic' | 'yarn-modern';
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
};
