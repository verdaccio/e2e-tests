import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    outDir: 'build',
    target: 'node20',
    ssr: true,
    rollupOptions: {
      external: [
        // Node builtins
        /^node:/,
        'assert',
        'child_process',
        'fs',
        'fs/promises',
        'os',
        'path',
        'readline',
        'url',
        // Dependencies — keep external, don't bundle
        'debug',
        'got',
        'js-yaml',
        'get-port',
      ],
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
