import { appendFileSync } from 'fs';

import { SuiteResult, TestResult } from './types';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function reportTestStart(adapterName: string, testName: string): void {
  process.stdout.write(
    `  ${COLORS.dim}running${COLORS.reset} ${adapterName} > ${testName}...\n`
  );
}

export function reportTestResult(result: TestResult, hasSubTests = false): void {
  if (result.passed) {
    if (!hasSubTests) {
      process.stdout.write(
        `  ${COLORS.green}✓${COLORS.reset} ${result.name} ${COLORS.dim}${formatDuration(result.duration)}${COLORS.reset}\n`
      );
    } else {
      process.stdout.write(
        `  ${COLORS.green}PASS${COLORS.reset} ${result.name} ${COLORS.dim}${formatDuration(result.duration)}${COLORS.reset}\n`
      );
    }
  } else {
    process.stdout.write(
      `  ${COLORS.red}FAIL${COLORS.reset} ${result.name} ${COLORS.dim}${formatDuration(result.duration)}${COLORS.reset}\n`
    );
    if (result.error) {
      const lines = result.error.split('\n');
      for (const line of lines) {
        console.log(`    ${COLORS.red}${line}${COLORS.reset}`);
      }
      // GitHub Actions annotation
      if (process.env.GITHUB_ACTIONS) {
        const msg = result.error.split('\n')[0];
        console.log(`::error title=E2E ${result.name}::${msg}`);
      }
    }
  }
}

export function reportSuiteStart(adapterName: string): void {
  console.log(`\n${COLORS.bold}${COLORS.cyan}${adapterName}${COLORS.reset}`);
}

export function reportSubTestResult(label: string, passed: boolean, duration?: number): void {
  const icon = passed
    ? `${COLORS.bold}${COLORS.green}✓${COLORS.reset}`
    : `${COLORS.bold}${COLORS.red}✗${COLORS.reset}`;
  const dur = duration !== undefined ? ` ${COLORS.dim}${formatDuration(duration)}${COLORS.reset}` : '';
  process.stdout.write(`\n    ${icon} ${COLORS.bold}${label}${COLORS.reset}${dur}\n\n`);
}

export function reportSkipped(testName: string): void {
  console.log(`  ${COLORS.yellow}SKIP${COLORS.reset} ${testName}`);
}

export function reportSummary(results: SuiteResult[]): void {
  console.log(`\n${COLORS.bold}${'='.repeat(50)}${COLORS.reset}`);
  console.log(`${COLORS.bold}Summary${COLORS.reset}\n`);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalDuration = 0;

  for (const suite of results) {
    const status = suite.failed > 0 ? COLORS.red : COLORS.green;
    const icon = suite.failed > 0 ? 'x' : 'v';
    console.log(
      `  ${status}${icon}${COLORS.reset} ${suite.adapter}: ` +
        `${COLORS.green}${suite.passed} passed${COLORS.reset}, ` +
        `${COLORS.red}${suite.failed} failed${COLORS.reset}, ` +
        `${COLORS.yellow}${suite.skipped} skipped${COLORS.reset} ` +
        `${COLORS.dim}(${formatDuration(suite.duration)})${COLORS.reset}`
    );
    totalPassed += suite.passed;
    totalFailed += suite.failed;
    totalSkipped += suite.skipped;
    totalDuration += suite.duration;
  }

  console.log(`\n  Total: ${COLORS.green}${totalPassed} passed${COLORS.reset}, ` +
    `${COLORS.red}${totalFailed} failed${COLORS.reset}, ` +
    `${COLORS.yellow}${totalSkipped} skipped${COLORS.reset} ` +
    `${COLORS.dim}(${formatDuration(totalDuration)})${COLORS.reset}`);
  console.log(`${COLORS.bold}${'='.repeat(50)}${COLORS.reset}\n`);

  // GitHub Actions Job Summary
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    writeGitHubSummary(summaryFile, results);
  }
}

function writeGitHubSummary(summaryFile: string, results: SuiteResult[]): void {
  const lines: string[] = [];

  lines.push('## E2E Test Results\n');

  for (const suite of results) {
    const status = suite.failed > 0 ? '❌' : '✅';
    lines.push(`### ${status} ${suite.adapter}\n`);
    lines.push('| Test | Status | Duration |');
    lines.push('|------|--------|----------|');

    for (const test of suite.tests) {
      const icon = test.passed ? '✅' : '❌';
      const dur = formatDuration(test.duration);

      if (test.subTests && test.subTests.length > 0) {
        // Parent row
        lines.push(`| **${test.name}** | ${icon} | ${dur} |`);
        // Sub-test rows
        for (const sub of test.subTests) {
          const subIcon = sub.passed ? '✅' : '❌';
          const subDur = formatDuration(sub.duration);
          const label = sub.passed ? sub.label : `${sub.label}: ${sub.error?.split('\n')[0] ?? ''}`;
          lines.push(`| &nbsp;&nbsp;&nbsp;&nbsp;${label} | ${subIcon} | ${subDur} |`);
        }
      } else {
        const label = test.passed ? test.name : `${test.name}: ${test.error?.split('\n')[0] ?? ''}`;
        lines.push(`| ${label} | ${icon} | ${dur} |`);
      }
    }

    lines.push('');
  }

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  for (const suite of results) {
    totalPassed += suite.passed;
    totalFailed += suite.failed;
    totalSkipped += suite.skipped;
  }

  const emoji = totalFailed > 0 ? '❌' : '✅';
  lines.push(`${emoji} **${totalPassed} passed**, **${totalFailed} failed**, **${totalSkipped} skipped**\n`);

  appendFileSync(summaryFile, lines.join('\n'));
}
