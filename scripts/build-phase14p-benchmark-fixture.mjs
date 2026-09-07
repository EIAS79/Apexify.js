import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const fixtureRoot = path.join(root, "benchmarks", ".phase14p-source");
const outRoot = path.join(fixtureRoot, "lib-next");
const tsconfigPath = path.join(fixtureRoot, "tsconfig.json");
const tscCli = path.join(root, "node_modules", "typescript", "bin", "tsc");

fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });
fs.writeFileSync(path.join(fixtureRoot, "package.json"), '{"type":"commonjs"}\n');
fs.writeFileSync(tsconfigPath, `${JSON.stringify({
  extends: "../../tsconfig.json",
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "Bundler",
    target: "ES2022",
    noEmit: false,
    noCheck: true,
    outDir: "./lib-next",
    rootDir: "../../lib-next",
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    inlineSourceMap: false,
    noUnusedLocals: false,
    noUnusedParameters: false
  },
  include: ["../../lib-next/**/*.ts"],
  exclude: ["../../node_modules", "../../dist"]
}, null, 2)}\n`);

const compile = spawnSync(process.execPath, [tscCli, "-p", tsconfigPath], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
if (compile.status !== 0) {
  throw new Error(`Phase 14-P benchmark fixture emit failed with status ${compile.status}.\n${compile.stdout ?? ""}${compile.stderr ?? ""}`);
}

const required = [
  "canvas/canvas-validation.js",
  "canvas/canvas-creator.js",
  "text/text-validation.js",
  "text/text-metrics.js",
  "text/text-layout.js",
  "text/text-png-encoder.js",
  "image/image-source-validation.js",
  "image/image-creator.js",
  "chart/chart-validation.js",
  "chart/chart-creator.js",
  "scene/scene-validation.js",
  "scene/scene-creator.js",
  "runtime/config.js",
  "runtime/limits.js",
  "audio-synth/audio-validation.js",
  "audio-synth/engine.js",
  "audio-synth/wav-encode.js",
  "gif/gif-validation.js",
  "gif/gif-creator.js"
];
for (const relative of required) {
  if (!fs.existsSync(path.join(outRoot, relative))) throw new Error(`Phase 14-P fixture missing ${relative}.`);
}

console.log(`build-phase14p-benchmark-fixture: emitted ${required.length} required internal modules under benchmarks/.phase14p-source.`);
