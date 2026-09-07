import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const outDir = path.resolve("tests/.build");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const [entry, outfile] of [
  ["tests/phase12-entry.ts", "phase12-entry.cjs"],
  ["tests/phase12-properties-entry.ts", "phase12-properties-entry.cjs"],
  ["tests/phase14-entry.ts", "phase14-entry.cjs"],
]) {
  await build({
    entryPoints: [entry],
    outfile: path.join(outDir, outfile),
    bundle: true,
    packages: "external",
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: true,
    sourcesContent: true,
    logLevel: "info",
  });
}

console.log("build-test-fixture: isolated critical-infrastructure, property, and Phase 14 regression bundles generated.");
