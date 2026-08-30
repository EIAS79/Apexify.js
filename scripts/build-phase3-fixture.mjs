import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const outDir = path.resolve("node_modules/.cache/apexify-phase3");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: ["tests/phase3-infrastructure.ts"],
  outfile: path.join(outDir, "phase3-infrastructure.cjs"),
  bundle: true,
  packages: "external",
  platform: "node",
  format: "cjs",
  target: "node22",
  logLevel: "info",
});

console.log("build-phase3-fixture: infrastructure test bundle generated outside dist.");
