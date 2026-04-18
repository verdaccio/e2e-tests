import buildDebug from 'debug';
import { URL } from 'url';

import { PackageManagerAdapter, SubTestResult, SuiteResult, TestContext, TestDefinition, TestResult } from './types';
import { reportSkipped, reportSubTestResult, reportSuiteStart, reportSummary, reportTestResult, reportTestStart } from './reporter';

const debug = buildDebug('verdaccio:e2e-cli:runner');

function getPort(registryUrl: string): number {
  try {
    const url = new URL(registryUrl);
    return parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);
  } catch {
    return 4873;
  }
}

async function runSingleTest(
  adapter: PackageManagerAdapter,
  test: TestDefinition,
  registryUrl: string,
  token: string,
  timeout: number
): Promise<TestResult & { hasSubTests: boolean }> {
  const port = getPort(registryUrl);
  let hasSubTests = false;
  const subResults: SubTestResult[] = [];
  const ctx: TestContext = {
    registryUrl,
    token,
    port,
    exec: adapter.exec.bind(adapter),
    adapter,
    runId: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    async subTest(label: string, fn: () => Promise<void>): Promise<void> {
      hasSubTests = true;
      const subStart = Date.now();
      try {
        await fn();
        const duration = Date.now() - subStart;
        subResults.push({ label, passed: true, duration });
        reportSubTestResult(label, true, duration);
      } catch (err) {
        const duration = Date.now() - subStart;
        const error = err instanceof Error ? err.message : String(err);
        subResults.push({ label, passed: false, duration, error });
        reportSubTestResult(label, false, duration);
        throw err;
      }
    },
  };

  const start = Date.now();

  return new Promise<TestResult & { hasSubTests: boolean }>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        name: test.name,
        passed: false,
        duration: Date.now() - start,
        error: `Test timed out after ${timeout}ms`,
        hasSubTests,
        subTests: subResults.length > 0 ? subResults : undefined,
      });
    }, timeout);

    test
      .run(ctx)
      .then(() => {
        clearTimeout(timer);
        resolve({
          name: test.name,
          passed: true,
          duration: Date.now() - start,
          hasSubTests,
          subTests: subResults.length > 0 ? subResults : undefined,
        });
      })
      .catch((err) => {
        clearTimeout(timer);
        resolve({
          name: test.name,
          passed: false,
          duration: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
          hasSubTests,
          subTests: subResults.length > 0 ? subResults : undefined,
        });
      });
  });
}

export async function runSuite(
  adapter: PackageManagerAdapter,
  tests: TestDefinition[],
  registryUrl: string,
  token: string,
  options: { timeout: number; testFilter?: string[] }
): Promise<SuiteResult> {
  const suiteStart = Date.now();
  const results: TestResult[] = [];
  let skipped = 0;

  reportSuiteStart(adapter.name);

  for (const test of tests) {
    // Filter by test name if specified
    if (options.testFilter && options.testFilter.length > 0) {
      if (!options.testFilter.includes(test.name)) {
        continue;
      }
    }

    // Check if adapter supports required commands
    if (test.requires) {
      const unsupported = test.requires.filter((cmd) => !adapter.supports.has(cmd));
      if (unsupported.length > 0) {
        reportSkipped(test.name);
        skipped++;
        continue;
      }
    }

    reportTestStart(adapter.name, test.name);
    const result = await runSingleTest(adapter, test, registryUrl, token, options.timeout);
    results.push(result);
    reportTestResult(result, result.hasSubTests);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    adapter: adapter.name,
    tests: results,
    passed,
    failed,
    skipped,
    duration: Date.now() - suiteStart,
  };
}

export async function runAll(
  adapters: PackageManagerAdapter[],
  tests: TestDefinition[],
  registryUrl: string,
  token: string,
  options: { timeout: number; concurrency: number; testFilter?: string[] }
): Promise<{ results: SuiteResult[]; exitCode: number }> {
  debug('running %d adapters with %d tests', adapters.length, tests.length);
  const results: SuiteResult[] = [];

  // Run adapters sequentially (each suite is already complex enough)
  for (const adapter of adapters) {
    const result = await runSuite(adapter, tests, registryUrl, token, options);
    results.push(result);
  }

  reportSummary(results);

  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  return { results, exitCode: totalFailed > 0 ? 1 : 0 };
}
