const fs = require('node:fs');

function patch(path, replacements) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      throw new Error(`Expected text not found in ${path}: ${from.slice(0, 120)}`);
    }
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text);
}

patch('lib-next/media/source.ts', [
  [
    'export type MediaSource = string | Buffer;',
    'export type MediaSource = string | Buffer | Uint8Array | URL;'
  ],
  [
    'export async function resolveMediaInput(source: MediaSource, options: ResolveMediaOptions = {}): Promise<string | Buffer> {\n  if (Buffer.isBuffer(source)) {',
    'export async function resolveMediaInput(source: MediaSource, options: ResolveMediaOptions = {}): Promise<string | Buffer> {\n  if (source instanceof URL) source = source.toString();\n  if (source instanceof Uint8Array && !Buffer.isBuffer(source)) source = Buffer.from(source);\n  if (Buffer.isBuffer(source)) {'
  ]
]);

patch('lib-next/canvas/pattern-renderer.ts', [
  [
    'import type { PatternOptions, PatternViewport, RenderPatternStackOptions } from "../types";\nimport path from \'path\';',
    'import type { PatternOptions, PatternViewport, RenderPatternStackOptions } from "../types";\nimport { resolveMediaInput } from "../media/source";'
  ],
  [
    '      let imagePath = options.customPatternImage;\n      if (!/^https?:\\/\\//.test(imagePath)) {\n        imagePath = path.isAbsolute(imagePath) ? imagePath : path.join(process.cwd(), imagePath);\n      }\n\n      const image = await loadImage(imagePath);',
    '      const imageSource = await resolveMediaInput(options.customPatternImage, { kind: "image" });\n      const image = await loadImage(imageSource);'
  ]
]);

patch('lib-next/image/gradient-blend.ts', [
  [
    'import { getCanvasContext, getErrorMessage } from "../core/errors";',
    'import { getCanvasContext, getErrorMessage } from "../core/errors";\nimport { resolveMediaInput, type MediaSource } from "../media/source";'
  ],
  [
    '    const img = await loadImage(source as string | Buffer | URL);',
    '    const resolvedSource = await resolveMediaInput(source as MediaSource, { kind: "image" });\n    const img = await loadImage(resolvedSource);'
  ],
  [
    '      const mask = await loadImage(options.maskSource as string | Buffer | URL);',
    '      const resolvedMask = await resolveMediaInput(options.maskSource as MediaSource, { kind: "image" });\n      const mask = await loadImage(resolvedMask);'
  ]
]);

patch('lib-next/image/raster-masking.ts', [
  [
    'import { getCanvasContext, getErrorMessage } from "../core/errors";',
    'import { getCanvasContext, getErrorMessage } from "../core/errors";\nimport { resolveMediaInput, type MediaSource } from "../media/source";'
  ],
  [
    '    const img = await loadImage(source as string | Buffer | URL);\n    const mask = await loadImage(maskSource as string | Buffer | URL);',
    '    const resolvedSource = await resolveMediaInput(source as MediaSource, { kind: "image" });\n    const resolvedMask = await resolveMediaInput(maskSource as MediaSource, { kind: "image" });\n    const img = await loadImage(resolvedSource);\n    const mask = await loadImage(resolvedMask);'
  ]
]);

patch('lib-next/output/stitch.ts', [
  [
    "import { createCanvas, loadImage, Image } from '@napi-rs/canvas';\nimport path from 'path';\nimport fs from 'fs';",
    "import { createCanvas, loadImage, Image } from '@napi-rs/canvas';"
  ],
  [
    'import { getCanvasContext } from "../core/errors";',
    'import { getCanvasContext } from "../core/errors";\nimport { resolveMediaInput } from "../media/source";'
  ],
  [
    "    let img: Image;\n    if (Buffer.isBuffer(imgSource)) {\n      img = await loadImage(imgSource);\n    } else if (imgSource.startsWith('http')) {\n      img = await loadImage(imgSource);\n    } else {\n      const imgPath = path.join(process.cwd(), imgSource);\n      img = await loadImage(fs.readFileSync(imgPath));\n    }\n    loadedImages.push(img);",
    "    const resolvedSource = await resolveMediaInput(imgSource, { kind: 'image' });\n    loadedImages.push(await loadImage(resolvedSource));"
  ],
  [
    "    let img: Image;\n    if (Buffer.isBuffer(imgConfig.source)) {\n      img = await loadImage(imgConfig.source);\n    } else if (typeof imgConfig.source === 'string' && imgConfig.source.startsWith('http')) {\n      img = await loadImage(imgConfig.source);\n    } else {\n      const imgPath = path.join(process.cwd(), imgConfig.source as string);\n      img = await loadImage(fs.readFileSync(imgPath));\n    }\n\n    loadedImages.push({",
    "    const resolvedSource = await resolveMediaInput(imgConfig.source, { kind: 'image' });\n    const img = await loadImage(resolvedSource);\n\n    loadedImages.push({"
  ]
]);

console.log('Phase 3 remaining media bypasses migrated.');
