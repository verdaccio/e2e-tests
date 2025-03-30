// @ts-check
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'json'], 
    outputFile: { json: 'vitest-report.json' }, 
    coverage: {
      exclude: ['./build', 'test'],
    },
  },
});
