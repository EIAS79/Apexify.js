import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const outDir = path.resolve("node_modules/.cache/apexify-phase5");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: ["tests/phase5-entry.ts"],
  outfile: path.join(outDir, "phase5-entry.cjs"),
  bundle: true,
  packages: "external",
  platform: "node",
  format: "cjs",
  target: "node22",
  logLevel: "info",
});

console.log("build-phase5-fixture: private Phase 5 raster bundle generated outside dist.");
