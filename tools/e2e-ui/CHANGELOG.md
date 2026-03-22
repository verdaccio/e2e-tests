# @verdaccio/e2e-ui

## 2.1.0

### Minor Changes

- 2d37347: Add dual CJS/ESM output format for both packages. Build now produces `build/esm/` (ES modules) and `build/cjs/` (CommonJS) via Vite 8 with separate rollup output configs. Package exports map `import` to ESM and `require` to CJS.

## 2.0.0

### Major Changes

- cfc77c9: feat: first release
