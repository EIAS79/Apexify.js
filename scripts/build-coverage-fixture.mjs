import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const sourceRoot = path.join(root, "lib-next");
const outRoot = path.join(root, "tests/.coverage/lib-next");
const fixtureRoot = path.join(root, "tests/.coverage");

function walkTs(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkTs(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });

await build({
  entryPoints: walkTs(sourceRoot),
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
  ...criticalModules.map((modulePath) => `Object.assign(api, require(${JSON.stringify(`./lib-next/${modulePath}`)}));`),
  "module.exports = api;",
  "",
].join("\n");
fs.writeFileSync(path.join(fixtureRoot, "phase12-entry.cjs"), entry);
console.log(`build-coverage-fixture: transpiled ${walkTs(sourceRoot).length} source modules and generated isolated critical API.`);
