const fs = require('node:fs');

function replaceExactly(text, from, to, expected, label) {
  const count = text.split(from).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} occurrence(s), found ${count}`);
  return text.split(from).join(to);
}

{
  const file = 'README.md';
  let text = fs.readFileSync(file, 'utf8');
  text = replaceExactly(
    text,
    '[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green.svg)](https://nodejs.org/)',
    '[![Node.js](https://img.shields.io/badge/Node.js-22%2F24%2F26-green.svg)](https://nodejs.org/)',
    1,
    'README Node badge'
  );
  text = replaceExactly(
    text,
    `### Requirements\n\n- Node.js 16+\n- TypeScript recommended\n- FFmpeg required only for video features\n\n---`,
    `### Requirements\n\n- Node.js 22.x, 24.x, or 26.x\n- npm 10+ (repository and release tooling is pinned to npm 11.19.1)\n- TypeScript recommended\n- FFmpeg required only for video features\n\n### Module formats and exports\n\nApexify.js 6 is a genuine dual package. The installed package has separate ESM and CommonJS runtime entrypoints and matching declaration modes.\n\n\`\`\`js\n// ESM\nimport { ApexPainter } from "apexify.js";\n\n// CommonJS\nconst { ApexPainter } = require("apexify.js");\n\`\`\`\n\nThe supported package-root **runtime** export is \`ApexPainter\`. TypeScript types are re-exported from the package root, and advanced type-only imports may use \`apexify.js/types\`. The \`apexify.js/types\` subpath is type-only and has no runtime JavaScript target.\n\n---`,
    1,
    'README requirements/module section'
  );
  text = replaceExactly(
    text,
    '- Root helpers: **`synthesizePreset`**, **`synthesizeSequence`**, **`composeSynthAudio`**, …',
    '- Low-level synthesis helpers are internal implementation details; the supported public audio surface is **`painter.createAudio`**.',
    1,
    'README audio root helper claim'
  );
  fs.writeFileSync(file, text);
}

{
  const file = 'CHANGELOG.md';
  let text = fs.readFileSync(file, 'utf8');
  const anchor = `The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n`;
  const entry = `## [6.0.0] - Unreleased\n\n### ⚠️ Breaking\n\n- **Node.js support is now 22.x, 24.x, and 26.x.** Node 16, 18, and 20 are no longer supported. Raising the runtime floor is a breaking compatibility change, so this work is correctly staged as **6.0.0**, not a 5.4.x patch.\n- The supported package-root runtime surface is explicitly **\`ApexPainter\`**. Low-level synthesis helpers remain internal; audio functionality is exposed through **\`painter.createAudio\`**.\n\n### 📦 Runtime, package, and release correctness\n\n- Replaced nominal dual builds with explicit **native ESM** (\`dist/esm/index.js\`) and **CommonJS** (\`dist/cjs/index.cjs\`) builds and behavioral verification of both formats.\n- Added condition-aware **ESM and CommonJS declaration trees**, including a type-only **\`apexify.js/types\`** subpath, and clean installed-package typechecking in both module modes.\n- Added clean tarball installation fixtures that install the result of **\`npm pack\`** into separate ESM and CommonJS consumer projects.\n- Added a tracked **\`package-lock.json\`**, pinned repository npm tooling to **11.19.1**, and moved CI to reproducible **\`npm ci\`** installs on Node 22/24/26.\n- Hardened **\`prepack\`** and **\`prepublishOnly\`** so publish-time lifecycle checks rebuild from source, run security regressions, verify exports, and validate the packed artifact.\n- Added the repository **MIT LICENSE** to the package and restricted package contents to the intended distribution surface.\n- Removed obsolete release/build configuration, stale dependency overrides, and obsolete Node-version CI workflows.\n- Replaced legacy **\`gifencoder\` / \`canvas\`** dependency plumbing with **\`@skyra/gifenc\`** for compatibility with the supported modern Node matrix.\n- Migrated Sharp integration and types to **Sharp 0.35.4** semantics.\n\n`;
  text = replaceExactly(text, anchor, anchor + entry, 1, 'CHANGELOG 6.0.0 insertion');
  text = replaceExactly(
    text,
    '- Root exports: **`synthesizeSound`**, **`synthesizePreset`**, **`synthesizeSequence`**, **`mixSynthSounds`**, **`composeSynthAudio`**, **`SYNTH_PRESET_NAMES`**, **`listPresets`**.',
    '- Internal synthesis helpers include **`synthesizeSound`**, **`synthesizePreset`**, **`synthesizeSequence`**, **`mixSynthSounds`**, **`composeSynthAudio`**, **`SYNTH_PRESET_NAMES`**, and **`listPresets`**; these are not supported package-root runtime exports.',
    1,
    'CHANGELOG historical root export correction'
  );
  fs.writeFileSync(file, text);
}

console.log('Phase 2 README and changelog synchronization applied with exact-match assertions.');
