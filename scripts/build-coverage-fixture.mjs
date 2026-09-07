import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const coverageRoot = path.join(root, "tests/.coverage");
const outRoot = path.join(coverageRoot, "lib-next");
const buildRoot = path.join(root, "tests/.build");
const evidenceRoot = path.join(root, "artifacts/coverage/emitted");
const coverageTsconfig = path.join(coverageRoot, "tsconfig.json");
const tscCli = path.join(root, "node_modules", "typescript", "bin", "tsc");

fs.rmSync(coverageRoot, { recursive: true, force: true });
fs.rmSync(evidenceRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });
fs.mkdirSync(buildRoot, { recursive: true });
fs.mkdirSync(evidenceRoot, { recursive: true });
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

// These hooks exist only in tests/.coverage copies. They never touch dist/ or package exports.
// Directly testing private policy primitives closes source-branch gaps without expanding Apexify's API.
const privateCoverageHooks = {
  "media/network-policy.js": ["ipv4ToInt", "ipv4Range", "normalizeIpv6", "ipv6InCidr"],
  "media/remote-fetch.js": [
    "defaultMaxBytes",
    "remoteLimitName",
    "parseRetryAfter",
    "retryDelay",
    "sleep",
    "createPinnedLookup",
    "hasHeader",
    "withoutBodyHeaders",
    "redirectRequestOptions",
    "requestHeaders",
    "contentLengthGuard",
    "retryAfterFromError",
    "retryable",
    "resolvedFetchPolicy",
  ],
  "video/process-runner.js": ["validateProcessToken", "appendBoundedTail"],
};

for (const modulePath of criticalModules) {
  const emitted = path.join(outRoot, modulePath);
  if (!fs.existsSync(emitted)) throw new Error(`Coverage TypeScript emit did not produce ${modulePath}.`);

  let source = fs.readFileSync(emitted, "utf8");

  // TypeScript's CommonJS metadata and default-import compatibility helper are compiler scaffolding,
  // not Apexify source branches. All default imports in these critical modules target Node built-ins,
  // so a branchless wrapper is behavior-equivalent inside this coverage-only copy.
  source = source
    .replace(/^Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\r?\n/m, "")
    .replace(
      /^var __importDefault = \(this && this\.__importDefault\) \|\| function \(mod\) \{\r?\n\s*return \(mod && mod\.__esModule\) \? mod : \{ "default": mod \};\r?\n\};\r?\n/m,
      'var __importDefault = function (mod) { return { "default": mod }; };\n',
    );

  const hooks = privateCoverageHooks[modulePath] ?? [];
  if (hooks.length > 0) {
    source += `\n// Phase 12 test-only private coverage hooks; this file is never published.\n${hooks
      .map((name) => `exports.__phase12_${name} = ${name};`)
      .join("\n")}\n`;
  }
  fs.writeFileSync(emitted, source);

  const evidencePath = path.join(evidenceRoot, modulePath);
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, source);
}

const entry = [
  "'use strict';",
  "const api = {};",
  ...criticalModules.map((modulePath) => `Object.assign(api, require(${JSON.stringify(`../.coverage/lib-next/${modulePath}`)}));`),
  "module.exports = api;",
  "",
].join("\n");
fs.writeFileSync(path.join(buildRoot, "phase12-entry.cjs"), entry);
console.log(`build-coverage-fixture: emitted source-only CommonJS copies, removed compiler-only metadata/import branches, added non-published private test hooks, retained emitted evidence, and routed critical tests through them.`);
