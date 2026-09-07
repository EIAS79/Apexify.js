import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

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

for (const sourceFile of sourceFiles) {
  const relative = path.relative(sourceRoot, sourceFile);
  const outputPath = path.join(outRoot, relative.replace(/\.ts$/i, ".js"));
  const result = ts.transpileModule(fs.readFileSync(sourceFile, "utf8"), {
    fileName: sourceFile,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      sourceMap: false,
      inlineSourceMap: false,
      declaration: false,
      removeComments: false,
    },
  });
  const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    });
    throw new Error(`Coverage transpilation failed for ${relative}:\n${formatted}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, result.outputText);
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

const entry = [
  "'use strict';",
  "const api = {};",
  ...criticalModules.map((modulePath) => `Object.assign(api, require(${JSON.stringify(`../.coverage/lib-next/${modulePath}`)}));`),
  "module.exports = api;",
  "",
].join("\n");
fs.writeFileSync(path.join(buildRoot, "phase12-entry.cjs"), entry);
console.log(`build-coverage-fixture: transpiled ${sourceFiles.length} source modules with TypeScript CommonJS emit and routed critical tests through helper-free source-level coverage modules.`);
