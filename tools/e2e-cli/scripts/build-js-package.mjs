import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binaryName = process.platform === 'win32' ? 'verdaccio-e2e.exe' : 'verdaccio-e2e';
const binarySource = resolve(root, 'target', 'release', binaryName);
const binaryDest = resolve(root, 'build', 'bin', binaryName);

rmSync(resolve(root, 'build'), { recursive: true, force: true });
mkdirSync(dirname(binaryDest), { recursive: true });
copyFileSync(binarySource, binaryDest);

const esm = `export const allTests = [];\nexport const allScenarios = [];\nexport function runAll() { throw new Error('@verdaccio/e2e-cli programmatic API is no longer available in the Rust build. Use the verdaccio-e2e binary.'); }\nexport function runSuite() { throw new Error('@verdaccio/e2e-cli programmatic API is no longer available in the Rust build. Use the verdaccio-e2e binary.'); }\nexport function createNpmAdapter() { throw new Error('@verdaccio/e2e-cli adapters are implemented in Rust. Use the verdaccio-e2e binary.'); }\nexport const createPnpmAdapter = createNpmAdapter;\nexport const createYarnClassicAdapter = createNpmAdapter;\nexport const createYarnModernAdapter = createNpmAdapter;\nexport const createBunAdapter = createNpmAdapter;\nexport const createDenoAdapter = createNpmAdapter;\n`;
const cjs = `function unavailable() { throw new Error('@verdaccio/e2e-cli programmatic API is no longer available in the Rust build. Use the verdaccio-e2e binary.'); }\nexports.allTests = [];\nexports.allScenarios = [];\nexports.runAll = unavailable;\nexports.runSuite = unavailable;\nexports.createNpmAdapter = unavailable;\nexports.createPnpmAdapter = unavailable;\nexports.createYarnClassicAdapter = unavailable;\nexports.createYarnModernAdapter = unavailable;\nexports.createBunAdapter = unavailable;\nexports.createDenoAdapter = unavailable;\n`;
const dts = `export type ExecOutput = { stdout: string; stderr: string };\nexport type PackageManagerAdapter = unknown;\nexport type TestDefinition = unknown;\nexport type TestContext = unknown;\nexport type CliOptions = unknown;\nexport const allTests: TestDefinition[];\nexport const allScenarios: TestDefinition[];\nexport function runAll(...args: unknown[]): never;\nexport function runSuite(...args: unknown[]): never;\nexport function createNpmAdapter(...args: unknown[]): never;\nexport function createPnpmAdapter(...args: unknown[]): never;\nexport function createYarnClassicAdapter(...args: unknown[]): never;\nexport function createYarnModernAdapter(...args: unknown[]): never;\nexport function createBunAdapter(...args: unknown[]): never;\nexport function createDenoAdapter(...args: unknown[]): never;\n`;

mkdirSync(resolve(root, 'build', 'esm'), { recursive: true });
mkdirSync(resolve(root, 'build', 'cjs'), { recursive: true });
writeFileSync(resolve(root, 'build', 'esm', 'index.js'), esm);
writeFileSync(resolve(root, 'build', 'cjs', 'index.cjs'), cjs);
writeFileSync(resolve(root, 'build', 'index.d.ts'), dts);
