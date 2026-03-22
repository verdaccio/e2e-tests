---
"@verdaccio/e2e-cli": minor
"@verdaccio/e2e-ui": minor
---

Add dual CJS/ESM output format for both packages. Build now produces `build/esm/` (ES modules) and `build/cjs/` (CommonJS) via Vite 8 with separate rollup output configs. Package exports map `import` to ESM and `require` to CJS.
