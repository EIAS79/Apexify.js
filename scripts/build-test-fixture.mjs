import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const outDir = path.resolve("tests/.build");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: ["tests/phase12-entry.ts"],
  outfile: path.join(outDir, "phase12-entry.cjs"),
  bundle: true,
  packages: "external",
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: true,
  sourcesContent: true,
  logLevel: "info",
});

console.log("build-test-fixture: permanent Phase 12 critical-infrastructure bundle generated.");
