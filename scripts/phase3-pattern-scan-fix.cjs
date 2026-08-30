const fs = require('node:fs');
const file = 'lib-next/canvas/pattern-renderer.ts';
let text = fs.readFileSync(file, 'utf8');
const from = 'const imageSource = await resolveMediaInput(options.customPatternImage, { kind: "image" });\n      const image = await loadImage(imageSource);';
const to = 'const resolvedPatternInput = await resolveMediaInput(options.customPatternImage, { kind: "image" });\n      const image = await loadImage(resolvedPatternInput);';
if (!text.includes(from)) throw new Error('Expected Phase 3 pattern resolver block was not found.');
text = text.replace(from, to);
fs.writeFileSync(file, text);
