import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const coverageRoot = path.join(root, "tests/.coverage");
const outRoot = path.join(coverageRoot, "lib-next");
const buildRoot = path.join(root, "tests/.build");
const coverageTsconfig = path.join(coverageRoot, "tsconfig.json");
const tscCli = path.join(root, "node_modules", "typescript", "bin", "tsc");

fs.rmSync(coverageRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });
fs.mkdirSync(buildRoot, { recursive: true });
fs.writeFileSync(path.join(coverageRoot, "package.json"), '{"type":"commonjs"}\n');
fs.writeFileSync(coverageTsconfig, `${JSON.stringify({
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
    noUnusedParameters: false,
  },
  include: ["../../lib-next/**/*.ts"],
  exclude: ["../../node_modules", "../../dist"],
}, null, 2)}\n`);

const compile = spawnSync(process.execPath, [tscCli, "-p", coverageTsconfig], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (compile.status !== 0) {
  throw new Error(`Coverage TypeScript emit failed with status ${compile.status}.\n${compile.stdout ?? ""}${compile.stderr ?? ""}`);
}

const criticalModules = [
  "runtime/config.js",
  "media/network-policy.js",
  "media/remote-fetch.js",
  "media/cache.js",
  "runtime/errors.js",
  "video/process-runner.js",
  "video/temp-workspace.js",
];
for (const modulePath of criticalModules) {
  const emitted = path.join(outRoot, modulePath);
  if (!fs.existsSync(emitted)) throw new Error(`Coverage TypeScript emit did not produce ${modulePath}.`);
}

const entry = [
  "'use strict';",
  "const api = {};",
  ...criticalModules.map((modulePath) => `Object.assign(api, require(${JSON.stringify(`../.coverage/lib-next/${modulePath}`)}));`),
  "module.exports = api;",
  "",
].join("\n");
fs.writeFileSync(path.join(buildRoot, "phase12-entry.cjs"), entry);
console.log(`build-coverage-fixture: emitted helper-free CommonJS source modules through the supported TypeScript CLI and routed critical tests through them.`);
