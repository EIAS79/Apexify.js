const fs = require("node:fs");

function migrateFile(file, importFrom, importTo, replacements) {
  let source = fs.readFileSync(file, "utf8");

  const alreadyMigrated = source.includes(importTo) && replacements.every(([from]) => !source.includes(from));
  if (alreadyMigrated) {
    console.log(`${file}: already migrated`);
    return false;
  }

  const importCount = source.split(importFrom).length - 1;
  if (importCount !== 1) {
    throw new Error(`${file}: expected exactly one legacy Sharp import, found ${importCount}`);
  }
  source = source.replace(importFrom, importTo);

  for (const [from, to, expectedCount] of replacements) {
    const count = source.split(from).length - 1;
    if (count !== expectedCount) {
      throw new Error(`${file}: expected ${expectedCount} occurrences of ${from}, found ${count}`);
    }
    source = source.split(from).join(to);
  }

  fs.writeFileSync(file, source);
  console.log(`${file}: migrated`);
  return true;
}

migrateFile(
  "lib-next/core/general-functions.ts",
  "import sharp from 'sharp';\n",
  "import sharp from 'sharp';\nimport type { Sharp, ResizeOptions as SharpResizeOptions, FormatEnum } from \"sharp\";\n",
  [
    ["sharp.Sharp", "Sharp", 3],
    ["sharp.ResizeOptions", "SharpResizeOptions", 1],
    ["sharp.FormatEnum", "FormatEnum", 3],
  ]
);

migrateFile(
  "lib-next/render/context-image-filters.ts",
  "import sharp from \"sharp\";\n",
  "import sharp from \"sharp\";\nimport type { Sharp } from \"sharp\";\n",
  [["sharp.Sharp", "Sharp", 32]]
);
