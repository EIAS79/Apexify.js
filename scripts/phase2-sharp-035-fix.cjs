const fs = require('node:fs');

function replaceExactly(source, from, to, expected, label) {
  const count = source.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} occurrence(s), found ${count}`);
  }
  return source.split(from).join(to);
}

{
  const file = 'lib-next/core/general-functions.ts';
  let source = fs.readFileSync(file, 'utf8');
  source = replaceExactly(
    source,
    'import type { Sharp, ResizeOptions as SharpResizeOptions, FormatEnum } from "sharp";',
    'import type { Sharp, ResizeOptions as SharpResizeOptions } from "sharp";',
    1,
    'Sharp type import'
  );
  source = replaceExactly(
    source,
    "      const validExtensions: (keyof FormatEnum)[] = ['jpeg', 'png', 'webp', 'tiff', 'gif', 'avif', 'heif', 'raw', 'pdf', 'svg'];\n\n      const newExt = newExtension.toLowerCase();\n      if (!validExtensions.includes(newExt as keyof FormatEnum)) {\n          throw new Error(`Invalid image format: ${newExt}`);\n      }\n\n      const image = await sharpFromResolvableInput(imageSource);\n\n      const convertedBuffer = await image.toFormat(newExt as keyof FormatEnum).toBuffer();\n      return convertedBuffer;",
    "      type SharpOutputFormat = 'jpeg' | 'png' | 'webp' | 'tiff' | 'gif' | 'avif' | 'heif' | 'raw';\n      const validExtensions: readonly SharpOutputFormat[] = ['jpeg', 'png', 'webp', 'tiff', 'gif', 'avif', 'heif', 'raw'];\n\n      const newExt = newExtension.toLowerCase();\n      if (!validExtensions.includes(newExt as SharpOutputFormat)) {\n          throw new Error(`Invalid image output format: ${newExt}`);\n      }\n\n      const image = await sharpFromResolvableInput(imageSource);\n\n      const convertedBuffer = await image.toFormat(newExt as SharpOutputFormat).toBuffer();\n      return convertedBuffer;",
    1,
    'Sharp output format conversion'
  );
  fs.writeFileSync(file, source);
}

{
  const file = 'lib-next/render/context-image-filters.ts';
  let source = fs.readFileSync(file, 'utf8');
  source = replaceExactly(
    source,
    "  // Intensity: sharpening strength (0-100+)\n  // Sharp's sharpen: (sigma, flat, jagged)\n  const sigma = Math.max(0.3, Math.min(1000, intensity));\n  return image.sharpen(sigma, 1, 2);",
    "  // Sharp 0.35 accepts an options object and limits sigma to 10.\n  const sigma = Math.max(0.000001, Math.min(10, intensity));\n  return image.sharpen({ sigma, m1: 1, m2: 2 });",
    1,
    'Sharp sharpen API'
  );
  fs.writeFileSync(file, source);
}

console.log('Sharp 0.35 API migration applied with exact-match assertions.');
