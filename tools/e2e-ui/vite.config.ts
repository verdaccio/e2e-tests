import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'commands/index': resolve(__dirname, 'src/commands/index.ts'),
      },
      formats: ['es'],
    },
    outDir: 'build',
    target: 'node20',
    ssr: true,
    rollupOptions: {
      external: [/^node:/, 'cypress', 'child_process', 'path', 'fs', 'fs/promises', 'os', 'url'],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
    sourcemap: true,
    minify: false,
  },
});
