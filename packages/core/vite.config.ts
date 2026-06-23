import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

/**
 * Source files use `.ts` import extensions (resolved by the bundler). Since
 * `allowImportingTsExtensions` is set so tsc emits declarations, those `.ts`
 * suffixes are retained in the emitted `.d.ts` — which is invalid for external
 * type consumers. This post-build hook rewrites `./x.ts` -> `./x.js` inside
 * every emitted `.d.ts` file (TypeScript resolves `.js` specifiers to the
 * sibling `.d.ts` automatically), and also projects the entry `.d.ts` to the
 * package root as `dist/index.d.ts`.
 */
function fixDtsExtensions() {
  return {
    name: 'fix-dts-extensions',
    closeBundle() {
      const distDir = join(process.cwd(), 'dist');
      const walk = (dir: string, acc: string[] = []) => {
        for (const name of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, name.name);
          if (name.isDirectory()) acc.push(...walk(full, acc));
          else if (name.name.endsWith('.d.ts')) acc.push(full);
        }
        return acc;
      };
      for (const file of walk(distDir)) {
        let src = readFileSync(file, 'utf-8');
        // Match any `.ts` extension before a closing quote in import/export
        // specifiers — both single and double quotes.
        const next = src.replace(/\.ts(['"])/g, '.js$1');
        if (next !== src) writeFileSync(file, next);
        // Emit a small shim `dist/index.d.ts` re-exporting from `./src/index.js`
        // so the package's `types` entry resolves and the per-module .d.ts files
        // remain under `dist/src/` where the sibling specifiers point.
        if (file.endsWith(join('src', 'index.d.ts'))) {
          const shim = `export * from './src/index.js';\n`;
          writeFileSync(join(distDir, 'index.d.ts'), shim);
        }
      }
    },
  };
}

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
  },
  plugins: [
    dts({
      include: ['src'],
      entryRoot: 'src',
      outDirs: 'dist',
      insertTypesEntry: true,
    }),
    fixDtsExtensions(),
  ],
});
