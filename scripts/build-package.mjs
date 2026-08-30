import { build } from 'esbuild';

const shared = {
  entryPoints: { index: 'lib-next/index.ts' },
  bundle: true,
  packages: 'external',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  sourcesContent: true,
  logLevel: 'info',
};

await Promise.all([
  build({
    ...shared,
    format: 'esm',
    outdir: 'dist/esm',
    outExtension: { '.js': '.js' },
  }),
  build({
    ...shared,
    format: 'cjs',
    outdir: 'dist/cjs',
    outExtension: { '.js': '.cjs' },
  }),
]);
