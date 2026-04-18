# @verdaccio/e2e-cli

## 2.6.0

### Minor Changes

- 881408e: feat: add pnpm v11 support with version-aware command handling

## 2.5.0

### Minor Changes

- c59d6cb: add login e2e for yarn
- 3f6c864: feat: add deprecate support for yarn modern adapter using @verdaccio/yarn-plugin-npm-deprecate
- 20b0092: feat: add ping support for yarn modern adapter using @verdaccio/yarn-plugin-npm-ping

## 2.4.0

### Minor Changes

- ad5b749: Replace `got` HTTP client with Node.js built-in `fetch`. Removes `got`, `p-cancelable` dependencies and pnpm overrides. Requires Node.js 18+.

## 2.3.0

### Minor Changes

- 92a6041: feat: add temp folder

## 2.2.0

### Minor Changes

- 43b958f: feat: add versions

## 2.1.1

### Patch Changes

- f2fe5f8: fix: add build folder

## 2.1.0

### Minor Changes

- 2d37347: Add dual CJS/ESM output format for both packages. Build now produces `build/esm/` (ES modules) and `build/cjs/` (CommonJS) via Vite 8 with separate rollup output configs. Package exports map `import` to ESM and `require` to CJS.

## 2.0.0

### Major Changes

- cfc77c9: feat: first release
