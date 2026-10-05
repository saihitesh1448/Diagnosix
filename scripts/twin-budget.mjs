/**
 * Verifies the 4GB-RAM / low-end-GPU contract on the twin's *actual* geometry:
 *
 *   1. the body cloud never exceeds 1,200 points
 *   2. the heart node is a separate cloud (so it can pulse on its own)
 *   3. the render surface is capped at 1.5x device pixel ratio
 *
 * `buildSkeleton()` is pure arithmetic + BufferGeometry, so it runs in Node
 * without a GPU — the same function the browser renders.
 *
 *   node scripts/twin-budget.mjs
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const MAX_PARTICLES = 1200;
const PIXEL_RATIO_CAP = 1.5;

const outDir = mkdtempSync(join(tmpdir(), 'diagnosix-twin-'));
const outFile = join(outDir, 'twin.mjs');

await esbuild.build({
  entryPoints: ['src/components/BodyTwinCanvas.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: outFile,
  logLevel: 'warning',
  jsx: 'automatic',
});

const { buildSkeleton } = await import(pathToFileURL(outFile).href);
const { group, bodyMaterial, heartMaterial } = buildSkeleton();

const clouds = group.children.filter((child) => child.isPoints);
const bodyCount = clouds[0].geometry.attributes.position.count;
const heartCount = clouds[1].geometry.attributes.position.count;
const colorAttr = clouds[0].geometry.attributes.color;

let failures = 0;
const assert = (label, condition, detail) => {
  if (condition) {
    console.log(`  ✓ ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` (${detail})` : ''}`);
  }
};

console.log('\nTwin geometry budget');
console.log(`  body cloud: ${bodyCount} pts · heart cloud: ${heartCount} pts · total ${bodyCount + heartCount}`);

assert('body cloud within the 1,200 point budget', bodyCount <= MAX_PARTICLES, `${bodyCount} pts`);
assert(
  'TOTAL particle count (body + heart) stays within 1,200',
  bodyCount + heartCount <= MAX_PARTICLES,
  `${bodyCount + heartCount} pts`,
);
assert('heart node is its own pulsable cloud', clouds.length === 2 && heartCount > 0, `${heartCount} pts`);
assert('every point carries a vertex colour', colorAttr && colorAttr.count === bodyCount);
assert(
  'clouds share one additive material each (no per-part draw calls)',
  clouds.every((cloud) => cloud.material && cloud.material.blending === 2),
);
assert(
  'heart material is animatable (size + colour exposed)',
  typeof heartMaterial.size === 'number' && typeof heartMaterial.color?.setHex === 'function',
);
assert(
  'body material is animatable',
  typeof bodyMaterial.size === 'number',
);

// The pixel-ratio cap must be present in the shipped source, since it is applied
// at renderer construction (browser-only path).
const source = readFileSync('src/components/BodyTwinCanvas.tsx', 'utf8');
assert(
  `pixel ratio clamped to ${PIXEL_RATIO_CAP}`,
  /Math\.min\(\s*window\.devicePixelRatio\s*,\s*PIXEL_RATIO_CAP\s*\)/.test(source),
);
assert(
  'render loop halts while the tab/canvas is hidden',
  /visibilitychange/.test(readFileSync('src/hooks/useVisibilityPause.ts', 'utf8')) &&
    /isAnimatingRef\.current/.test(source),
);
assert(
  'teardown disposes geometry, materials and the renderer',
  /\.dispose\(\)/.test(source) && /forceContextLoss/.test(source),
);

console.log(failures === 0 ? '\nAll budget checks passed' : `\n${failures} check(s) failed`);
rmSync(outDir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
