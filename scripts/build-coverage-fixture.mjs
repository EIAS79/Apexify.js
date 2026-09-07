import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const sourceRoot = path.join(root, "lib-next");
const coverageRoot = path.join(root, "tests/.coverage");
const outRoot = path.join(coverageRoot, "lib-next");
const buildRoot = path.join(root, "tests/.build");

function walkTs(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkTs(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

const sourceFiles = walkTs(sourceRoot);
fs.rmSync(coverageRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });
fs.mkdirSync(buildRoot, { recursive: true });
fs.writeFileSync(path.join(coverageRoot, "package.json"), '{"type":"commonjs"}\n');

await build({
  entryPoints: sourceFiles,
  outdir: outRoot,
  outbase: sourceRoot,
  bundle: false,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: false,
  logLevel: "warning",
});

const criticalModules = [
  "runtime/config.js",
  "media/network-policy.js",
  "media/remote-fetch.js",
  "media/cache.js",
  "runtime/errors.js",
  "video/process-runner.js",
  "video/temp-workspace.js",
];

const entry = [
  "'use strict';",
  "const api = {};",
  ...criticalModules.map((modulePath) => `Object.assign(api, require(${JSON.stringify(`../.coverage/lib-next/${modulePath}`)}));`),
  "module.exports = api;",
  "",
].join("\n");
fs.writeFileSync(path.join(buildRoot, "phase12-entry.cjs"), entry);
console.log(`build-coverage-fixture: transpiled ${sourceFiles.length} source modules and routed critical tests through source-level coverage modules.`);
