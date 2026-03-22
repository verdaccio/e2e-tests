import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

const external = [
  /^node:/,
  'assert',
  'child_process',
  'fs',
  'fs/promises',
  'os',
  'path',
  'readline',
  'url',
  'debug',
  'got',
  'js-yaml',
  'get-port',
];

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
    },
    outDir: 'build',
    target: 'node20',
    ssr: true,
    rollupOptions: {
      external,
      output: [
        {
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: 'src',
          dir: 'build/esm',
          entryFileNames: '[name].js',
        },
        {
          format: 'cjs',
          preserveModules: true,
          preserveModulesRoot: 'src',
          dir: 'build/cjs',
          entryFileNames: '[name].cjs',
        },
      ],
    },
    sourcemap: true,
    minify: false,
  },
});
