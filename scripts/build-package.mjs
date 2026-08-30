import { build } from 'esbuild';

const entryPoints = {
  index: 'lib-next/index.ts',
  'types/index': 'lib-next/types/index.ts',
};

const shared = {
  entryPoints,
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
