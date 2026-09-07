'use strict';

const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '..', 'lib-next', 'template', 'resolve-template.ts');
let text = fs.readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`Missing expected template migration target: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`Ambiguous repeated template migration target: ${label}`);
  text = text.slice(0, first) + after + text.slice(first + before.length);
}

replaceOnce(
  'import { ApexifyInputError } from "../runtime/errors";\n',
  'import { getDefaultApexifyRuntimeConfig } from "../runtime/config";\nimport { ApexifyInputError } from "../runtime/errors";\n',
  'runtime config import'
);

replaceOnce(
`function finiteNonNegative(value: unknown, label: string): number {
  const number = Number(value ?? 0);
  assertFiniteNumber(number, label, { min: 0 });
  return number;
}
`,
`function finiteNonNegative(value: unknown, label: string): number {
  const number = Number(value ?? 0);
  assertFiniteNumber(number, label, { min: 0 });
  return number;
}

async function measureChildrenBounded(
  children: readonly TemplateLayerInput[],
  measureText: (props: TextProperties) => Promise<TextMetrics>
): Promise<Array<{ width: number; height: number }>> {
  if (children.length === 0) return [];
  const concurrency = Math.max(1, Math.min(children.length, getDefaultApexifyRuntimeConfig().limits.maxBatchConcurrency));
  const sizes = new Array<{ width: number; height: number }>(children.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= children.length) return;
      sizes[index] = await measureChildSize(children[index]!, measureText);
    }
  }));
  return sizes;
}
`,
  'bounded template measurement helper'
);

for (const scope of ['flex', 'grid']) {
  replaceOnce(
    `  assertCollection(children, "template.${scope}.children");\n  const sizes = await Promise.all(children.map((child) => measureChildSize(child, measureText)));`,
    `  assertCollection(children, "template.${scope}.children", { limit: "maxCollectionItems" });\n  const sizes = await measureChildrenBounded(children, measureText);`,
    `${scope} child measurement`
  );
}

fs.writeFileSync(file, text);
console.log('phase14-template-bound-migrate: bounded flex/grid child collections and measurement concurrency.');
