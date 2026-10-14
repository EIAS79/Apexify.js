'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { transformSync } = require('esbuild');

// Load the real TypeScript geometry without importing graphics backends.
const source = fs.readFileSync(path.join(__dirname, '../lib-next/text/text-curved.ts'), 'utf8');
const compiled = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { computeCircularArcPlacements } = loaded.exports;
const ctx = { measureText: (value) => ({ width: Array.from(value).length * 12 }) };
const nearly = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-7, label + ': ' + a + ' != ' + b);
const settings = { sweepDegrees: 130, radius: 80, up: true, layoutMode: 'clamp' };

test('single-glyph arc midpoint stays at the explicit anchor for any angle, radius and direction', () => {
  for (const up of [true, false]) for (const angle of [-180, -90, -27, 0, 45, 90, 180]) {
    const [placement] = computeCircularArcPlacements(ctx, 'X', 225, 175, { ...settings, up, startAngleDeg: angle });
    nearly(placement.x, 225, 'x anchor');
    nearly(placement.y, 175, 'y anchor');
  }
});

test('baseline offset follows the normal and rotates rigidly about the text anchor', () => {
  for (const up of [true, false]) for (const angle of [-90, -30, 0, 30, 90]) {
    const offset = 17;
    const [placement] = computeCircularArcPlacements(ctx, 'X', 225, 175, { ...settings, up, baselineOffset: offset, startAngleDeg: angle });
    const sign = up ? -1 : 1;
    const r = angle * Math.PI / 180;
    nearly(placement.x, 225 - sign * offset * Math.sin(r), 'offset x');
    nearly(placement.y, 175 + sign * offset * Math.cos(r), 'offset y');
  }
});

test('multi-grapheme placements at nonzero startAngle are exact rigid rotations about anchor', () => {
  const anchor = { x: 120, y: 110 };
  for (const mode of ['fit', 'clamp', 'override']) for (const up of [true, false]) {
    const unrotated = computeCircularArcPlacements(ctx, 'Curve λ test', anchor.x, anchor.y, { ...settings, up, layoutMode: mode, baselineOffset: -11 });
    const angle = 42;
    const rotated = computeCircularArcPlacements(ctx, 'Curve λ test', anchor.x, anchor.y, { ...settings, up, layoutMode: mode, baselineOffset: -11, startAngleDeg: angle });
    const c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180);
    assert.equal(unrotated.length, rotated.length);
    for (let i=0;i<unrotated.length;i++) {
      const px = unrotated[i].x - anchor.x, py = unrotated[i].y - anchor.y;
      nearly(rotated[i].x, anchor.x + px*c - py*s, 'rotated x');
      nearly(rotated[i].y, anchor.y + px*s + py*c, 'rotated y');
      nearly(rotated[i].rotationRad, unrotated[i].rotationRad + angle*Math.PI/180, 'tangent');
      nearly(rotated[i].resolvedRadius, unrotated[i].resolvedRadius, 'R constant');
    }
  }
});

test('native measureText curve bounds rotate with the arc and track baseline offset', async () => {
  const { ApexPainter } = require('../dist/cjs/index.cjs');
  const metrics = new ApexPainter();
  const base = {
    text: 'CURVED BASELINE', x: 120, y: 100,
    font: { size: 25, family: 'Arial' },
    textOnCurve: { sweepAngle: 120, radius: 100, layoutMode: 'clamp', up: true },
  };
  const unrotated = await metrics.measureText(base);
  const quarterTurn = await metrics.measureText({
    ...base, textOnCurve: { ...base.textOnCurve, startAngleDeg: 90 },
  });
  assert.ok(unrotated.width > 0 && unrotated.height > 0);
  nearly(unrotated.width, quarterTurn.height, '90 degree height');
  nearly(unrotated.height, quarterTurn.width, '90 degree width');
  const shifted = await metrics.measureText({
    ...base, textOnCurve: { ...base.textOnCurve, baselineOffset: 30 },
  });
  assert.ok(Math.abs(shifted.width - unrotated.width) > 1, 'Offset must affect actual arc extent');
});
