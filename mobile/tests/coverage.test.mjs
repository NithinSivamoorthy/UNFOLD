import assert from 'node:assert/strict';
import { test } from 'node:test';

const cov = await import('../src/scan/coverage.ts');
const { pickByHeading } = await import('../src/scan/views.ts');

test('turn rate is the gyro component along gravity', () => {
  // iPad upright in portrait: gravity along -y. Turning about vertical shows up on the y gyro axis (beta).
  assert.equal(cov.yawRateAboutGravity({ x: 0, y: -9.8, z: 0 }, { alpha: 0, beta: 20, gamma: 0 }), -20);
  // Tilting forward (x axis) is not a turn around the vertical.
  assert.equal(cov.yawRateAboutGravity({ x: 0, y: -9.8, z: 0 }, { alpha: 0, beta: 0, gamma: 40 }), 0);
  assert.equal(cov.yawRateAboutGravity({ x: 0, y: 0, z: 0 }, { alpha: 5, beta: 5, gamma: 5 }), 0);
});

test('heading integration visits sectors in either direction and ignores big gaps', () => {
  let s = cov.initialCoverage();
  for (let i = 0; i < 40; i++) s = cov.integrate(s, -10, 0.1); // -40°
  assert.equal(cov.sectorOf(s.headingDeg), 8);
  assert.ok(s.visited[0] && s.visited[8] && s.visited[9]);
  const before = s.headingDeg;
  s = cov.integrate(s, 100, 3); // app was suspended: ignored
  assert.equal(s.headingDeg, before);
});

test('one photo per sector, only when steady, capped', () => {
  const s = cov.initialCoverage();
  assert.equal(cov.wantsCapture(s, 5, 0), true);
  assert.equal(cov.wantsCapture(s, 50, 0), false);
  const filled = { ...s, filled: s.filled.map((_, i) => i === 0) };
  assert.equal(cov.wantsCapture(filled, 5, 1), false);
  assert.equal(cov.wantsCapture(s, 5, cov.MAX_FRAMES), false);
});

test('completion needs enough distinct filled sectors, not time or count', () => {
  const s = cov.initialCoverage();
  assert.equal(cov.isComplete({ ...s, filled: s.filled.map((_, i) => i < 7) }), false);
  assert.equal(cov.isComplete({ ...s, filled: s.filled.map((_, i) => i < 8) }), true);
});

test('blur heuristic rejects frames far below the median size', () => {
  assert.equal(cov.isLikelyBlurry(100, [300, 320, 310]), true);
  assert.equal(cov.isLikelyBlurry(280, [300, 320, 310]), false);
  assert.equal(cov.isLikelyBlurry(10, [300]), false);
});

test('views are picked by measured heading, distinct frames', () => {
  const sel = pickByHeading([0, 40, 85, 130, 178, 220, 268, 310]);
  assert.deepEqual(sel, { front: 0, left: 2, back: 4, right: 6 });
  const neg = pickByHeading([0, -95, -180, -270]);
  assert.deepEqual(neg, { front: 0, left: 3, back: 2, right: 1 });
});
